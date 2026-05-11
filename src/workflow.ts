import path from "node:path";
import { readFile } from "node:fs/promises";
import { analyzeWebsite } from "./analyzeWebsite.js";
import { readLeads, writeCsvResults, writeJsonResults } from "./csv.js";
import { createFallbackAnalysis, generatePersonalizedAnalysis } from "./openaiClient.js";
import { getCsvOutputPath, getInputPath, getJsonOutputPath } from "./runtimePaths.js";
import { looksLikeCorporateOrLargeBrand } from "./scoring.js";
import type {
  AiCrmFields,
  EmailCopyReview,
  LeadRecord,
  OutreachResult,
  PriorityLevel,
  ReviewStatus,
  WebsiteIssue,
  WebsiteScanResult,
  WebsiteStatus,
} from "./types.js";

export const defaultInputPath = getInputPath();
export const defaultJsonOutputPath = getJsonOutputPath();
export const defaultCsvOutputPath = getCsvOutputPath();

export const reviewStatuses: ReviewStatus[] = [
  "Needs Review",
  "Approved",
  "Rejected",
  "Contacted",
  "Replied",
  "Won",
  "Lost",
  "Needs Manual Review",
  "Not Qualified",
];

export interface AnalyzeInput {
  website_url: string;
  business_name?: string;
  industry?: string;
  location?: string;
  email?: string;
}

export interface SummaryCounts {
  websitesAnalyzed: number;
  qualified: number;
  notQualifiedButAnalyzed: number;
  needsManualReview: number;
  fetchFailed: number;
}

export async function loadCsvInputWebsites(inputPath: string): Promise<LeadRecord[]> {
  return (await readLeads(inputPath))
    .filter((lead) => lead.website_url.trim())
    .map(normalizeLead);
}

export function makeLeadFromInput(input: AnalyzeInput): LeadRecord {
  return normalizeLead({
    business_name: input.business_name ?? "",
    website_url: input.website_url,
    industry: input.industry ?? "",
    location: input.location ?? "",
    email: input.email ?? "",
  });
}

export async function analyzeLeadToResult(lead: LeadRecord): Promise<OutreachResult> {
  const scan = await analyzeWebsite(lead);
  const aiFields = shouldGenerateAiFields(scan)
    ? await generatePersonalizedAnalysis({ lead, scan })
    : createFallbackAnalysis({ lead, scan });

  return buildOutreachResult(lead, scan, aiFields);
}

export async function readResultsFile(filePath = defaultJsonOutputPath): Promise<OutreachResult[]> {
  try {
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;

    if (!Array.isArray(parsed)) return [];

    const rawRecords = parsed
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item));
    const hadMissingIds = rawRecords.some((item) => !getString(item.id, ""));
    const results = rawRecords
      .map(normalizeResultRecord);

    if (hadMissingIds) {
      await writeJsonResults(filePath, results);

      if (filePath === defaultJsonOutputPath) {
        await writeCsvResults(defaultCsvOutputPath, results);
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function saveResults(
  results: OutreachResult[],
  jsonOutputPath = defaultJsonOutputPath,
  csvOutputPath = defaultCsvOutputPath,
): Promise<void> {
  await writeJsonResults(jsonOutputPath, results.map(normalizeResultRecord));
  await writeCsvResults(csvOutputPath, results.map(normalizeResultRecord));
}

export async function appendResult(
  result: OutreachResult,
  jsonOutputPath = defaultJsonOutputPath,
  csvOutputPath = defaultCsvOutputPath,
): Promise<OutreachResult[]> {
  const existingResults = await readResultsFile(jsonOutputPath);
  const results = [...existingResults, normalizeResultRecord(result)];
  await saveResults(results, jsonOutputPath, csvOutputPath);
  return results;
}

export async function updateResult(
  match: { id?: string; website_url?: string },
  updates: Partial<OutreachResult>,
  jsonOutputPath = defaultJsonOutputPath,
  csvOutputPath = defaultCsvOutputPath,
): Promise<OutreachResult[]> {
  const results = await readResultsFile(jsonOutputPath);
  const updated = results.map((result) => {
    const id = getResultId(result);
    const matches = (match.id && id === match.id) || (match.website_url && result.website_url === match.website_url);

    if (!matches) return result;

    const merged = { ...result, ...updates };

    if (updates.status && !isReviewStatus(updates.status)) {
      merged.status = result.status;
    }

    return normalizeResultRecord(merged);
  });

  await saveResults(updated, jsonOutputPath, csvOutputPath);
  return updated;
}

function isReviewStatus(value: string): value is ReviewStatus {
  return reviewStatuses.includes(value as ReviewStatus);
}

export async function deleteResult(
  id: string,
  jsonOutputPath = defaultJsonOutputPath,
  csvOutputPath = defaultCsvOutputPath,
): Promise<{ results: OutreachResult[]; removed: boolean }> {
  const results = await readResultsFile(jsonOutputPath);
  const updated = results.filter((result) => getResultId(result) !== id);
  const removed = updated.length !== results.length;

  if (removed) {
    await saveResults(updated, jsonOutputPath, csvOutputPath);
  }

  return { results: updated, removed };
}

export function getResultId(result: Pick<OutreachResult, "id" | "website_url" | "analysis_date">): string {
  return result.id || createResultId(result.website_url, result.analysis_date);
}

export function summarizeResults(results: OutreachResult[]): SummaryCounts {
  return {
    websitesAnalyzed: results.length,
    qualified: results.filter((result) => result.qualified).length,
    notQualifiedButAnalyzed: results.filter((result) => result.analysis_status === "analyzed" && !result.qualified).length,
    needsManualReview: results.filter((result) => result.crm_stage === "Needs Manual Review").length,
    fetchFailed: results.filter((result) => result.analysis_status === "fetch_failed").length,
  };
}

export function isFullHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeLead(lead: LeadRecord): LeadRecord {
  return {
    ...lead,
    business_name: lead.business_name.trim(),
    website_url: lead.website_url.trim(),
    industry: lead.industry.trim(),
    location: lead.location.trim(),
    email: lead.email.trim(),
  };
}

export function printSummary(results: OutreachResult[], jsonOutputPath: string, csvOutputPath: string): void {
  const summary = summarizeResults(results);

  console.log(`Websites analyzed: ${summary.websitesAnalyzed}`);
  console.log(`Qualified outreach prospects: ${summary.qualified}`);
  console.log(`Not qualified but analyzed: ${summary.notQualifiedButAnalyzed}`);
  console.log(`Needs manual review: ${summary.needsManualReview}`);
  console.log(`Fetch failed: ${summary.fetchFailed}`);
  console.log(`Results saved to ${path.relative(process.cwd(), jsonOutputPath)}`);
  console.log(`Results saved to ${path.relative(process.cwd(), csvOutputPath)}`);
}

export function normalizeResultRecord(record: Record<string, unknown> | OutreachResult): OutreachResult {
  const issues = normalizeIssues(record.issues, record.secondary_issues, record.main_issue);
  const oldScore = getNumber(record.website_score, getNumber(record.overall_score, 0));
  const overall = getNumber(record.overall_score, oldScore);
  const websiteQuality = getNumber(record.website_quality_score, overall ? 100 - overall : 0);
  const friendly = getString(record.friendly_email, getString(record.cold_email_body, ""));
  const direct = getString(record.direct_email, friendly);
  const premium = getString(record.premium_email, friendly);
  const recommended = normalizeEmailVersion(record.recommended_email_version);
  const emailReviews = normalizeEmailReviews(record.email_reviews);
  const analysisStatus = normalizeWebsiteStatus(record.analysis_status ?? record.status);
  const qualified = getBoolean(record.qualified, false);
  const crmStage = getString(record.crm_stage, getCrmStageFromStatuses(analysisStatus, qualified));
  const status = normalizeReviewStatus(record.status, crmStage, qualified);
  const analysisDate = getString(record.analysis_date, new Date().toISOString());

  return {
    id: getString(record.id, createResultId(getString(record.website_url, ""), analysisDate)),
    business_name: getString(record.business_name, "Unknown Website"),
    website_url: getString(record.website_url, ""),
    industry: getString(record.industry, ""),
    location: getString(record.location, ""),
    email: getString(record.email, ""),
    status,
    analysis_status: analysisStatus,
    detected_builder: getString(record.detected_builder, "unknown"),
    builder_confidence: getString(record.builder_confidence, "low"),
    business_name_confidence: getString(record.business_name_confidence, "low"),
    business_name_source: getString(record.business_name_source, "unknown"),
    is_javascript_rendered: getBoolean(record.is_javascript_rendered, false),
    website_score: oldScore,
    overall_score: overall,
    website_quality_score: websiteQuality,
    score_confidence: normalizeScoreConfidence(record.score_confidence),
    cta_score: getNumber(record.cta_score, overall),
    seo_score: getNumber(record.seo_score, overall),
    contact_visibility_score: getNumber(record.contact_visibility_score, overall),
    design_ux_score: getNumber(record.design_ux_score, overall),
    conversion_score: getNumber(record.conversion_score, overall),
    trust_signal_score: getNumber(record.trust_signal_score, overall),
    lead_fit_score: getNumber(record.lead_fit_score, qualified ? 80 : 40),
    priority_level: normalizePriority(record.priority_level, overall),
    main_issue: getString(record.main_issue, issues[0]?.issue ?? "No specific issue found"),
    issues,
    secondary_issues: getStringArray(record.secondary_issues, issues.slice(1).map((issue) => issue.issue)),
    score_summary: getString(record.score_summary, overall ? `Overall redesign opportunity score: ${overall}.` : "Website could not be scored."),
    top_3_reasons_for_score: getStringArray(record.top_3_reasons_for_score, issues.slice(0, 3).map((issue) => issue.issue)),
    business_impact: getString(record.business_impact, ""),
    personalized_hook: getString(record.personalized_hook, ""),
    recommended_offer: getString(record.recommended_offer, "Manual review"),
    friendly_email: friendly,
    direct_email: direct,
    premium_email: premium,
    recommended_email_version: recommended,
    cold_email_subject: getString(record.cold_email_subject, `Quick website idea for ${getString(record.business_name, "your site")}`),
    cold_email_body: getString(record.cold_email_body, getEmailByVersion({ friendly, direct, premium }, recommended)),
    outreach_copy_review: getString(record.outreach_copy_review, ""),
    copy_score: getNumber(record.copy_score, emailReviews[recommended].copy_score),
    email_reviews: emailReviews,
    copy_improvements: getStringArray(record.copy_improvements, emailReviews[recommended].improvement_suggestions),
    qualified,
    qualification_reason: getString(record.qualification_reason, qualified ? "Qualified after analysis." : "Not qualified or not yet reviewed."),
    crm_stage: crmStage,
    notes: getString(record.notes, ""),
    desktop_screenshot_path: getString(record.desktop_screenshot_path, ""),
    mobile_screenshot_path: getString(record.mobile_screenshot_path, ""),
    desktop_preview_screenshot_path: getString(record.desktop_preview_screenshot_path, getString(record.desktop_screenshot_path, "")),
    desktop_full_screenshot_path: getString(record.desktop_full_screenshot_path, getString(record.desktop_screenshot_path, "")),
    mobile_preview_screenshot_path: getString(record.mobile_preview_screenshot_path, getString(record.mobile_screenshot_path, "")),
    mobile_full_screenshot_path: getString(record.mobile_full_screenshot_path, getString(record.mobile_screenshot_path, "")),
    analysis_date: analysisDate,
    opt_out_status: getString(record.opt_out_status, "Not Opted Out"),
  };
}

function buildOutreachResult(
  lead: LeadRecord,
  scan: WebsiteScanResult,
  aiFields: AiCrmFields,
): OutreachResult {
  const qualification = qualifyWebsite(scan);
  const crmStage = getCrmStageFromStatuses(scan.status, qualification.qualified);
  const reviewStatus = qualification.qualified ? "Needs Review" : scan.status === "analyzed" ? "Not Qualified" : "Needs Manual Review";
  const businessName = scan.businessIdentity.name || aiFields.business_name || lead.business_name;
  const analysisDate = new Date().toISOString();

  return normalizeResultRecord({
    id: createResultId(scan.finalUrl || scan.normalizedUrl || lead.website_url, analysisDate),
    business_name: businessName,
    website_url: scan.finalUrl || scan.normalizedUrl || lead.website_url,
    industry: scan.businessIdentity.industry || aiFields.industry || lead.industry,
    location: scan.businessIdentity.location || lead.location,
    email: lead.email,
    status: reviewStatus,
    analysis_status: scan.status,
    detected_builder: scan.builder.builder || aiFields.detected_builder,
    builder_confidence: scan.builder.confidence || aiFields.builder_confidence,
    business_name_confidence: scan.businessIdentity.confidence || aiFields.business_name_confidence,
    business_name_source: scan.businessIdentity.source,
    is_javascript_rendered: scan.isJavaScriptRendered,
    website_score: scan.scoreBreakdown.overall_score,
    overall_score: scan.scoreBreakdown.overall_score,
    website_quality_score: scan.scoreBreakdown.website_quality_score,
    score_confidence: scan.scoreBreakdown.score_confidence,
    cta_score: scan.scoreBreakdown.cta_score,
    seo_score: scan.scoreBreakdown.seo_score,
    contact_visibility_score: scan.scoreBreakdown.contact_visibility_score,
    design_ux_score: scan.scoreBreakdown.design_ux_score,
    conversion_score: scan.scoreBreakdown.conversion_score,
    trust_signal_score: scan.scoreBreakdown.trust_signal_score,
    lead_fit_score: scan.scoreBreakdown.lead_fit_score,
    priority_level: scan.scoreBreakdown.priority_level,
    main_issue: aiFields.main_issue || scan.issues[0]?.issue || "No specific issue found",
    issues: aiFields.issues.length > 0 ? aiFields.issues : scan.issues,
    secondary_issues: scan.issues.slice(1).map((issue) => issue.issue),
    score_summary: aiFields.score_summary || scan.scoreBreakdown.score_summary,
    top_3_reasons_for_score: aiFields.top_3_reasons_for_score.length > 0 ? aiFields.top_3_reasons_for_score : scan.scoreBreakdown.top_3_reasons_for_score,
    business_impact: aiFields.business_impact,
    personalized_hook: aiFields.personalized_hook,
    recommended_offer: aiFields.recommended_offer,
    friendly_email: aiFields.friendly_email,
    direct_email: aiFields.direct_email,
    premium_email: aiFields.premium_email,
    recommended_email_version: aiFields.recommended_email_version,
    cold_email_subject: `Quick website idea for ${businessName || "your site"}`,
    cold_email_body: getEmailByVersion(aiFields, aiFields.recommended_email_version),
    outreach_copy_review: aiFields.outreach_copy_review,
    copy_score: aiFields.copy_score,
    email_reviews: aiFields.email_reviews,
    copy_improvements: aiFields.copy_improvements,
    qualified: qualification.qualified,
    qualification_reason: qualification.reason,
    crm_stage: crmStage,
    notes: "",
    desktop_screenshot_path: scan.screenshots.desktop_screenshot_path,
    mobile_screenshot_path: scan.screenshots.mobile_screenshot_path,
    desktop_preview_screenshot_path: scan.screenshots.desktop_preview_screenshot_path || scan.screenshots.desktop_screenshot_path,
    desktop_full_screenshot_path: scan.screenshots.desktop_full_screenshot_path || scan.screenshots.desktop_screenshot_path,
    mobile_preview_screenshot_path: scan.screenshots.mobile_preview_screenshot_path || scan.screenshots.mobile_screenshot_path,
    mobile_full_screenshot_path: scan.screenshots.mobile_full_screenshot_path || scan.screenshots.mobile_screenshot_path,
    analysis_date: analysisDate,
    opt_out_status: "Not Opted Out",
  });
}

function qualifyWebsite(scan: WebsiteScanResult): { qualified: boolean; reason: string } {
  if (scan.status !== "analyzed") return { qualified: false, reason: `Not qualified because analysis status is ${scan.status}.` };
  if (isReservedPlaceholderDomain(scan.finalUrl || scan.normalizedUrl)) return { qualified: false, reason: "Not qualified because the URL is a reserved placeholder/example domain." };
  if (looksLikeCorporateOrLargeBrand(scan.signals)) return { qualified: false, reason: `Not qualified because the site shows large-brand/corporate signals: ${scan.signals.corporateSignals.join(", ")}.` };
  if (scan.scoreBreakdown.score_confidence === "low") return { qualified: false, reason: "Not qualified automatically because score confidence is low; review screenshots manually before outreach." };
  if (scan.scoreBreakdown.overall_score < 70) return { qualified: false, reason: `Not qualified because redesign opportunity score is ${scan.scoreBreakdown.overall_score}, below 70.` };
  if (!scan.issues.some((issue) => issue.urgency === "High" || issue.urgency === "Medium")) return { qualified: false, reason: "Not qualified because no high or medium urgency redesign issue was found." };
  if (scan.scoreBreakdown.lead_fit_score < 45) return { qualified: false, reason: `Not qualified because lead fit score is ${scan.scoreBreakdown.lead_fit_score}.` };
  if (scan.signals.wordCount < 20) return { qualified: false, reason: "Not qualified because there is not enough visible homepage information." };

  return {
    qualified: true,
    reason: "Qualified after analysis: strong redesign opportunity, specific urgency, and realistic outreach fit.",
  };
}

function getCrmStageFromStatuses(analysisStatus: WebsiteStatus, qualified: boolean): string {
  if (qualified) return "Needs Review";
  if (analysisStatus === "analyzed") return "Analyzed - Not Qualified";
  return "Needs Manual Review";
}

function shouldGenerateAiFields(scan: WebsiteScanResult): boolean {
  return scan.status === "analyzed" || scan.status === "needs_manual_review";
}

function isReservedPlaceholderDomain(websiteUrl: string): boolean {
  try {
    const hostname = new URL(websiteUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return hostname === "example.com" || hostname === "example.org" || hostname === "example.net" || hostname.endsWith(".test") || hostname.endsWith(".invalid") || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

function normalizeReviewStatus(value: unknown, crmStage = "", qualified = false): ReviewStatus {
  if (typeof value === "string" && reviewStatuses.includes(value as ReviewStatus)) return value as ReviewStatus;
  if (crmStage === "Needs Manual Review") return "Needs Manual Review";
  return qualified ? "Needs Review" : "Not Qualified";
}

function normalizeWebsiteStatus(value: unknown): WebsiteStatus {
  const status = typeof value === "string" ? value : "";
  if (status === "analyzed" || status === "needs_manual_review" || status === "fetch_failed" || status === "blocked" || status === "invalid_url") return status;
  if (status === "Needs Manual Review") return "needs_manual_review";
  return "analyzed";
}

function normalizePriority(value: unknown, score: number): PriorityLevel {
  if (value === "Low" || value === "Medium" || value === "High") return value;
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function normalizeScoreConfidence(value: unknown): OutreachResult["score_confidence"] {
  return value === "high" || value === "medium" || value === "low" ? value : "low";
}

function normalizeEmailVersion(value: unknown): "friendly" | "direct" | "premium" {
  return value === "friendly" || value === "direct" || value === "premium" ? value : "direct";
}

function normalizeIssues(value: unknown, oldSecondary: unknown, oldMain: unknown): WebsiteIssue[] {
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeIssue(item, index)).filter(Boolean);
  }

  const oldIssues = [getString(oldMain, ""), ...getStringArray(oldSecondary, [])].filter(Boolean);
  return oldIssues.map((issue, index) => normalizeIssue(issue, index));
}

function normalizeIssue(value: unknown, index: number): WebsiteIssue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const issue = getString(record.issue, getString(record.label, "Website issue"));
    return {
      key: getString(record.key, `issue_${index + 1}`),
      label: getString(record.label, issue),
      detail: getString(record.detail, getString(record.evidence, issue)),
      evidence: getString(record.evidence, getString(record.detail, issue)),
      weight: getNumber(record.weight, 8),
      issue,
      why_it_matters: getString(record.why_it_matters, "This can reduce clarity, trust, or conversion performance."),
      suggested_fix: getString(record.suggested_fix, "Review this section and make the next step clearer."),
      urgency: record.urgency === "High" || record.urgency === "Medium" || record.urgency === "Low" ? record.urgency : "Medium",
      category: normalizeIssueCategory(record.category),
    };
  }

  const issue = String(value ?? "Website issue").trim() || "Website issue";
  return {
    key: `issue_${index + 1}`,
    label: issue,
    detail: issue,
    evidence: issue,
    weight: 8,
    issue,
    why_it_matters: "This can reduce clarity, trust, or conversion performance.",
    suggested_fix: "Review this section and make the next step clearer.",
    urgency: "Medium",
    category: "Conversion",
  };
}

function normalizeIssueCategory(value: unknown): WebsiteIssue["category"] {
  return value === "CTA" ||
    value === "SEO" ||
    value === "Contact" ||
    value === "UX" ||
    value === "Trust" ||
    value === "Speed" ||
    value === "Conversion" ||
    value === "Content" ||
    value === "Local"
    ? value
    : "Conversion";
}

function normalizeEmailReviews(value: unknown): Record<string, EmailCopyReview> {
  const fallback = {
    friendly: defaultEmailReview(80),
    direct: defaultEmailReview(84),
    premium: defaultEmailReview(82),
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    friendly: normalizeEmailReview(record.friendly, fallback.friendly),
    direct: normalizeEmailReview(record.direct, fallback.direct),
    premium: normalizeEmailReview(record.premium, fallback.premium),
  };
}

function normalizeEmailReview(value: unknown, fallback: EmailCopyReview): EmailCopyReview {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  return {
    copy_score: getNumber(record.copy_score, fallback.copy_score),
    strengths: getStringArray(record.strengths, fallback.strengths),
    risks: getStringArray(record.risks, fallback.risks),
    improvement_suggestions: getStringArray(record.improvement_suggestions, fallback.improvement_suggestions),
    best_version_recommendation: getString(record.best_version_recommendation, fallback.best_version_recommendation),
  };
}

function defaultEmailReview(score: number): EmailCopyReview {
  return {
    copy_score: score,
    strengths: ["Respectful tone", "Short enough for cold outreach"],
    risks: ["Confirm details before sending."],
    improvement_suggestions: ["Review manually for fit before sending."],
    best_version_recommendation: "Use after manual review.",
  };
}

function getEmailByVersion(emails: { friendly_email?: string; direct_email?: string; premium_email?: string; friendly?: string; direct?: string; premium?: string }, version: "friendly" | "direct" | "premium"): string {
  if (version === "friendly") return emails.friendly_email ?? emails.friendly ?? "";
  if (version === "premium") return emails.premium_email ?? emails.premium ?? "";
  return emails.direct_email ?? emails.direct ?? "";
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(100, Math.round(numberValue))) : fallback;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return fallback;
}

function getStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return value.split(/;|\n/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function createResultId(websiteUrl: string, analysisDate: string): string {
  const domain = safeIdDomain(websiteUrl);
  const timestamp = compactTimestamp(analysisDate || new Date().toISOString());
  const random = Math.random().toString(16).slice(2, 6) || "0000";

  return `${domain}-${timestamp}-${random}`;
}

function safeIdDomain(websiteUrl: string): string {
  try {
    const candidate = /^https?:\/\//i.test(websiteUrl) ? websiteUrl : `https://${websiteUrl}`;
    return new URL(candidate).hostname
      .replace(/^www\./i, "")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "website";
  } catch {
    return "website";
  }
}

function compactTimestamp(value: string): string {
  const date = new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad = (numberValue: number): string => String(numberValue).padStart(2, "0");

  return [
    safeDate.getFullYear(),
    pad(safeDate.getMonth() + 1),
    pad(safeDate.getDate()),
    "-",
    pad(safeDate.getHours()),
    pad(safeDate.getMinutes()),
    pad(safeDate.getSeconds()),
  ].join("");
}
