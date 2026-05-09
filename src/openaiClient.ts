import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import type { AiCrmFields, EmailCopyReview, LeadRecord, WebsiteScanResult } from "./types.js";

interface GenerateAnalysisInput {
  lead: LeadRecord;
  scan: WebsiteScanResult;
}

const allowedOffers = [
  "Full redesign",
  "Mobile-first redesign",
  "Landing page",
  "Booking/contact flow improvement",
  "SEO cleanup",
  "Speed + conversion fix",
];

const promptCache = new Map<string, string>();

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function generatePersonalizedAnalysis(input: GenerateAnalysisInput): Promise<AiCrmFields> {
  if (!hasOpenAiKey() || !shouldUseOpenAi(input.scan)) {
    return createFallbackAnalysis(input);
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const websitePrompt = await readPrompt("website-analysis.txt");
    const crmPrompt = await readPrompt("crm-ready-json.txt");
    const fallback = createFallbackAnalysis(input);

    const response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${websitePrompt}\n\n${crmPrompt}\n\nReturn JSON fields for friendly_email, direct_email, premium_email, recommended_email_version, email_reviews, outreach_copy_review, copy_score, and copy_improvements. Do not send email.`,
        },
        {
          role: "user",
          content: JSON.stringify(buildPromptData(input), null, 2),
        },
      ],
    });

    const content = response.choices[0]?.message.content ?? "{}";
    return normalizeAiFields(parseJsonObject(content), fallback, input.scan);
  } catch (error) {
    console.warn(`OpenAI analysis failed for ${input.lead.business_name}: ${getErrorMessage(error)}`);
    return createFallbackAnalysis(input);
  }
}

export function createFallbackAnalysis(input: GenerateAnalysisInput): AiCrmFields {
  const { lead, scan } = input;
  const mainIssue = getMainIssue(scan);
  const observation = scan.status === "analyzed"
    ? scan.issues[0]?.evidence ?? "the homepage could make the next step clearer"
    : scan.error ?? "the website needs manual review before outreach";
  const offer = chooseOffer(scan);
  const friendlyEmail = buildEmail(lead, observation, "friendly");
  const directEmail = buildEmail(lead, observation, "direct");
  const premiumEmail = buildEmail(lead, observation, "premium");
  const emailReviews = {
    friendly: reviewEmail(friendlyEmail, "friendly", scan),
    direct: reviewEmail(directEmail, "direct", scan),
    premium: reviewEmail(premiumEmail, "premium", scan),
  };
  const recommended = recommendEmailVersion(emailReviews);

  return {
    business_name: scan.businessIdentity.name || lead.business_name,
    website_url: scan.finalUrl || scan.normalizedUrl || lead.website_url,
    industry: scan.businessIdentity.industry || lead.industry,
    detected_builder: scan.builder.builder,
    builder_confidence: scan.builder.confidence,
    business_name_confidence: scan.businessIdentity.confidence,
    is_javascript_rendered: scan.isJavaScriptRendered,
    overall_score: scan.scoreBreakdown.overall_score,
    cta_score: scan.scoreBreakdown.cta_score,
    seo_score: scan.scoreBreakdown.seo_score,
    contact_visibility_score: scan.scoreBreakdown.contact_visibility_score,
    design_ux_score: scan.scoreBreakdown.design_ux_score,
    conversion_score: scan.scoreBreakdown.conversion_score,
    trust_signal_score: scan.scoreBreakdown.trust_signal_score,
    lead_fit_score: scan.scoreBreakdown.lead_fit_score,
    priority_level: scan.scoreBreakdown.priority_level,
    main_issue: mainIssue,
    issues: scan.issues,
    score_summary: scan.scoreBreakdown.score_summary,
    top_3_reasons_for_score: scan.scoreBreakdown.top_3_reasons_for_score,
    business_impact: buildBusinessImpact(scan, lead),
    personalized_hook: buildPersonalizedHook(lead, observation),
    recommended_offer: offer,
    friendly_email: friendlyEmail,
    direct_email: directEmail,
    premium_email: premiumEmail,
    recommended_email_version: recommended,
    outreach_copy_review: summarizeReviews(emailReviews, recommended),
    copy_score: emailReviews[recommended].copy_score,
    email_reviews: emailReviews,
    copy_improvements: emailReviews[recommended].improvement_suggestions,
    crm_stage: "Needs Review",
    qualified: false,
    qualification_reason: "Qualification is calculated after website analysis.",
  };
}

function shouldUseOpenAi(scan: WebsiteScanResult): boolean {
  return scan.status === "analyzed" || scan.status === "needs_manual_review";
}

function buildPromptData(input: GenerateAnalysisInput): Record<string, unknown> {
  const { lead, scan } = input;

  return {
    business_name: scan.businessIdentity.name || lead.business_name,
    website_url: scan.finalUrl,
    industry: scan.businessIdentity.industry || lead.industry,
    location: scan.businessIdentity.location || lead.location,
    email: lead.email,
    analysis_status: scan.status,
    detected_builder: scan.builder.builder,
    builder_confidence: scan.builder.confidence,
    business_name_confidence: scan.businessIdentity.confidence,
    business_name_source: scan.businessIdentity.source,
    is_javascript_rendered: scan.isJavaScriptRendered,
    scores: scan.scoreBreakdown,
    detected_issues: scan.issues,
    homepage_signals: {
      title: scan.signals.title,
      meta_description: scan.signals.metaDescription,
      visible_word_count: scan.signals.wordCount,
      has_clear_cta: scan.signals.hasClearCta,
      has_phone_visible: scan.signals.hasPhone,
      has_email_visible: scan.signals.hasEmail,
      has_booking_or_contact_button: scan.signals.hasBookingOrContactButton,
      has_trust_signals: scan.signals.hasTrustSignals,
      has_navigation: scan.signals.hasNavigation,
      old_copyright_year: scan.signals.oldCopyrightYear,
      generic_phrases: scan.signals.genericPhrases,
      corporate_signals: scan.signals.corporateSignals,
    },
    homepage_text_excerpt: scan.signals.textExcerpt,
  };
}

async function readPrompt(fileName: string): Promise<string> {
  if (promptCache.has(fileName)) {
    return promptCache.get(fileName) ?? "";
  }

  const promptPath = path.join(process.cwd(), "prompts", fileName);
  const content = await readFile(promptPath, "utf8");
  promptCache.set(fileName, content);
  return content;
}

function normalizeAiFields(raw: Record<string, unknown>, fallback: AiCrmFields, scan: WebsiteScanResult): AiCrmFields {
  const recommendedOffer = asString(raw.recommended_offer, fallback.recommended_offer);
  const friendlyEmail = limitWords(asString(raw.friendly_email, fallback.friendly_email), 120);
  const directEmail = limitWords(asString(raw.direct_email, fallback.direct_email), 120);
  const premiumEmail = limitWords(asString(raw.premium_email, fallback.premium_email), 120);
  const emailReviews = normalizeEmailReviews(raw.email_reviews, fallback.email_reviews);
  const recommended = normalizeRecommendedVersion(raw.recommended_email_version, fallback.recommended_email_version);

  return {
    ...fallback,
    business_name: asString(raw.business_name, fallback.business_name),
    website_url: asString(raw.website_url, fallback.website_url),
    industry: asString(raw.industry, fallback.industry),
    detected_builder: asString(raw.detected_builder, fallback.detected_builder),
    builder_confidence: asString(raw.builder_confidence, fallback.builder_confidence),
    business_name_confidence: fallback.business_name_confidence,
    is_javascript_rendered: scan.isJavaScriptRendered,
    main_issue: asString(raw.main_issue, fallback.main_issue),
    business_impact: asString(raw.business_impact, fallback.business_impact),
    personalized_hook: asString(raw.personalized_hook, fallback.personalized_hook),
    recommended_offer: allowedOffers.includes(recommendedOffer) ? recommendedOffer : fallback.recommended_offer,
    friendly_email: friendlyEmail,
    direct_email: directEmail,
    premium_email: premiumEmail,
    recommended_email_version: recommended,
    outreach_copy_review: asString(raw.outreach_copy_review, fallback.outreach_copy_review),
    copy_score: asNumber(raw.copy_score, emailReviews[recommended].copy_score, 1, 100),
    email_reviews: emailReviews,
    copy_improvements: asStringArray(raw.copy_improvements, emailReviews[recommended].improvement_suggestions),
  };
}

function parseJsonObject(content: string): Record<string, unknown> {
  const trimmed = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error("OpenAI response was not valid JSON.");
  }
}

function chooseOffer(scan: WebsiteScanResult): string {
  const issueKeys = new Set(scan.issues.map((issue) => issue.key));

  if (issueKeys.has("missing_contact_button")) return "Booking/contact flow improvement";
  if (issueKeys.has("missing_cta")) return "Landing page";
  if (issueKeys.has("weak_seo_basics") || issueKeys.has("low_text")) return "SEO cleanup";
  if (issueKeys.has("javascript_rendered")) return "Speed + conversion fix";
  if (issueKeys.has("template_builder") || issueKeys.has("old_copyright") || issueKeys.has("generic_wording")) return "Full redesign";

  return "Mobile-first redesign";
}

function buildBusinessImpact(scan: WebsiteScanResult, lead: LeadRecord): string {
  if (scan.status !== "analyzed") {
    return "The website could not be fully reviewed automatically, so outreach should wait until a manual review confirms the page is public and relevant.";
  }

  const industryText = lead.industry ? `${lead.industry} visitors` : "website visitors";
  const impacts = [];

  if (!scan.signals.hasClearCta || !scan.signals.hasBookingOrContactButton) {
    impacts.push(`make it harder for ${industryText} to know how to contact, book, or request a quote`);
  }

  if (scan.signals.weakTitle || scan.signals.weakMetaDescription) {
    impacts.push("weaken search snippets and first impressions");
  }

  if (!scan.signals.hasPhone && !scan.signals.hasEmail) {
    impacts.push("reduce quick-response contact options");
  }

  if (impacts.length === 0) {
    impacts.push("create avoidable friction before a visitor becomes a lead");
  }

  return `These issues may ${impacts.join(", ")}.`;
}

function buildPersonalizedHook(lead: LeadRecord, observation: string): string {
  const locationText = lead.location ? ` in ${lead.location}` : "";
  const industryText = lead.industry ? `${lead.industry} business` : "business";

  return `I noticed ${ensureSentence(observation)} For a ${industryText}${locationText}, that can make the next step less clear for visitors.`;
}

function buildEmail(lead: LeadRecord, observation: string, tone: "friendly" | "direct" | "premium"): string {
  const businessName = lead.business_name || "there";
  const industry = lead.industry ? ` ${lead.industry}` : "";
  const location = lead.location ? ` in ${lead.location}` : "";
  const observationSentence = ensureSentence(observation);
  const opener = tone === "friendly"
    ? `Hi ${businessName}, I took a quick look at your website and noticed ${observationSentence}`
    : tone === "direct"
      ? `Hi ${businessName}, I noticed ${observationSentence}`
      : `Hi ${businessName}, I reviewed your website and noticed ${observationSentence}`;
  const value = tone === "premium"
    ? "We help businesses tighten website clarity, trust signals, and conversion paths so more visitors become inquiries."
    : "I help improve homepage clarity and contact flow so more visitors turn into calls or bookings.";
  const cta = tone === "direct"
    ? "Would you be open to a quick idea?"
    : "Would it be useful if I sent over a few quick ideas?";

  return limitWords(`${opener} For a${industry} business${location}, that can make it harder for visitors to know what to do next. ${value} ${cta}`, 120);
}

function reviewEmail(copy: string, tone: string, scan: WebsiteScanResult): EmailCopyReview {
  const risks: string[] = [];
  const improvements: string[] = [];
  let score = tone === "direct" ? 86 : tone === "premium" ? 84 : 82;

  if (copy.split(/\s+/).filter(Boolean).length > 120) {
    score -= 20;
    improvements.push("Shorten the email to stay under 120 words.");
  }

  if (!scan.issues[0]?.evidence) {
    score -= 12;
    risks.push("The message may sound generic without a specific observation.");
    improvements.push("Add one verified website observation before sending.");
  }

  if (/bad website|terrible|awful|outdated mess/i.test(copy)) {
    score -= 25;
    risks.push("The tone may feel insulting.");
    improvements.push("Remove any negative judgment and keep the note helpful.");
  }

  if (!/\?|would it|open to|useful/i.test(copy)) {
    score -= 8;
    improvements.push("End with a soft question instead of a hard sell.");
  }

  if (risks.length === 0) risks.push("Confirm the observation is accurate before sending.");
  if (improvements.length === 0) improvements.push("Review manually for fit before sending.");

  return {
    copy_score: Math.max(1, Math.min(100, score)),
    strengths: ["Respectful tone", "Short enough for cold outreach", "Tied to a visible website observation"],
    risks,
    improvement_suggestions: improvements,
    best_version_recommendation: tone === "direct" ? "Best default for business-focused outreach." : "Useful depending on the relationship and brand tone.",
  };
}

function recommendEmailVersion(reviews: Record<string, EmailCopyReview>): "friendly" | "direct" | "premium" {
  const entries = Object.entries(reviews) as Array<["friendly" | "direct" | "premium", EmailCopyReview]>;
  return entries.sort((a, b) => b[1].copy_score - a[1].copy_score)[0]?.[0] ?? "direct";
}

function summarizeReviews(reviews: Record<string, EmailCopyReview>, recommended: string): string {
  return `Recommended version: ${recommended}. Scores: friendly ${reviews.friendly?.copy_score ?? "N/A"}, direct ${reviews.direct?.copy_score ?? "N/A"}, premium ${reviews.premium?.copy_score ?? "N/A"}.`;
}

function getMainIssue(scan: WebsiteScanResult): string {
  if (scan.issues[0]) return `${scan.issues[0].issue}: ${scan.issues[0].detail}`;
  if (scan.status === "analyzed") return "No specific redesign issue found.";
  return `${scan.status.replace(/_/g, " ")}: ${scan.error ?? "Manual review needed."}`;
}

function normalizeEmailReviews(value: unknown, fallback: Record<string, EmailCopyReview>): Record<string, EmailCopyReview> {
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
    copy_score: asNumber(record.copy_score, fallback.copy_score, 1, 100),
    strengths: asStringArray(record.strengths, fallback.strengths),
    risks: asStringArray(record.risks, fallback.risks),
    improvement_suggestions: asStringArray(record.improvement_suggestions, fallback.improvement_suggestions),
    best_version_recommendation: asString(record.best_version_recommendation, fallback.best_version_recommendation),
  };
}

function normalizeRecommendedVersion(value: unknown, fallback: "friendly" | "direct" | "premium"): "friendly" | "direct" | "premium" {
  return value === "friendly" || value === "direct" || value === "premium" ? value : fallback;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(min, Math.min(max, Math.round(numberValue))) : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return fallback;
}

function limitWords(value: string, maxWords: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  return words.length <= maxWords ? value : `${words.slice(0, maxWords).join(" ")}...`;
}

function ensureSentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
