import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import type { LeadRecord, OutreachResult } from "./types.js";

const csvColumns = [
  "id",
  "business_name",
  "website_url",
  "industry",
  "location",
  "email",
  "status",
  "analysis_status",
  "detected_builder",
  "builder_confidence",
  "business_name_confidence",
  "business_name_source",
  "is_javascript_rendered",
  "website_score",
  "overall_score",
  "website_quality_score",
  "score_confidence",
  "cta_score",
  "seo_score",
  "contact_visibility_score",
  "design_ux_score",
  "conversion_score",
  "trust_signal_score",
  "lead_fit_score",
  "priority_level",
  "main_issue",
  "issues",
  "secondary_issues",
  "score_summary",
  "top_3_reasons_for_score",
  "business_impact",
  "personalized_hook",
  "recommended_offer",
  "friendly_email",
  "direct_email",
  "premium_email",
  "recommended_email_version",
  "cold_email_subject",
  "cold_email_body",
  "outreach_copy_review",
  "copy_score",
  "email_reviews",
  "copy_improvements",
  "qualified",
  "qualification_reason",
  "crm_stage",
  "notes",
  "desktop_screenshot_path",
  "mobile_screenshot_path",
  "analysis_date",
  "opt_out_status",
];

export async function readLeads(filePath: string): Promise<LeadRecord[]> {
  const content = await readFile(filePath, "utf8");
  const records = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  return records.map((record) => ({
    business_name: clean(record.business_name) || clean(record.business) || clean(record.name),
    website_url: clean(record.website_url),
    industry: clean(record.industry),
    location: clean(record.location),
    email: clean(record.email),
  }));
}

export function parseLeadsCsv(content: string): LeadRecord[] {
  const records = parse(content, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;

  return records.map((record) => ({
    business_name: clean(record.business_name) || clean(record.business) || clean(record.name),
    website_url: clean(record.website_url),
    industry: clean(record.industry),
    location: clean(record.location),
    email: clean(record.email),
  }));
}

export async function writeJsonResults(filePath: string, results: OutreachResult[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
}

export async function writeCsvResults(filePath: string, results: OutreachResult[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyResults(results), "utf8");
}

export function stringifyResults(results: OutreachResult[]): string {
  const rows = results.map((result) => ({
    ...result,
    issues: JSON.stringify(result.issues ?? []),
    secondary_issues: (result.secondary_issues ?? []).join("; "),
    top_3_reasons_for_score: (result.top_3_reasons_for_score ?? []).join("; "),
    email_reviews: JSON.stringify(result.email_reviews ?? {}),
    copy_improvements: (result.copy_improvements ?? []).join("; "),
    is_javascript_rendered: result.is_javascript_rendered ? "true" : "false",
    qualified: result.qualified ? "true" : "false",
  }));

  return stringify(rows, {
    header: true,
    columns: csvColumns,
  });
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
