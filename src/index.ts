import "dotenv/config";
import path from "node:path";
import { hasOpenAiKey } from "./openaiClient.js";
import { generateHtmlReport } from "./report.js";
import { getReportOutputPath } from "./runtimePaths.js";
import {
  analyzeLeadToResult,
  defaultCsvOutputPath,
  defaultInputPath,
  defaultJsonOutputPath,
  loadCsvInputWebsites,
  makeLeadFromInput,
  printSummary,
  saveResults,
} from "./workflow.js";
import type { LeadRecord, OutreachResult } from "./types.js";

const defaultDelayMs = 2500;

async function main(): Promise<void> {
  const jsonOutputPath = path.resolve(getArg("--json", defaultJsonOutputPath));
  const csvOutputPath = path.resolve(getArg("--out-csv", defaultCsvOutputPath));
  const limit = getOptionalNumberArg("--limit");
  const delayMs = Number(process.env.FETCH_DELAY_MS ?? defaultDelayMs);
  const leads = await loadInputWebsites();
  const selectedLeads = typeof limit === "number" ? leads.slice(0, limit) : leads;
  const results: OutreachResult[] = [];

  console.log(`Input websites loaded: ${selectedLeads.length}`);

  if (selectedLeads.length === 0) {
    console.log("No input websites found. Add websites to data/leads.csv or run with --url.");
    await saveResults(results, jsonOutputPath, csvOutputPath);
    printSummary(results, jsonOutputPath, csvOutputPath);
    await generateHtmlReport(jsonOutputPath, getReportOutputPath());
    return;
  }

  if (!hasOpenAiKey()) {
    console.warn("OPENAI_API_KEY is not set. The CLI will still run, but it will use local fallback copy instead of AI-generated analysis.");
  }

  for (let index = 0; index < selectedLeads.length; index += 1) {
    const lead = selectedLeads[index];
    console.log(`[${index + 1}/${selectedLeads.length}] Analyzing ${lead.business_name || lead.website_url}: ${lead.website_url}`);

    const result = await analyzeLeadToResult(lead);
    if (result.analysis_status !== "analyzed") {
      console.warn(`Saved ${result.analysis_status} result for ${lead.business_name || lead.website_url}: ${result.main_issue}`);
    }

    results.push(result);

    if (index < selectedLeads.length - 1 && delayMs > 0) {
      await delay(delayMs);
    }
  }

  await saveResults(results, jsonOutputPath, csvOutputPath);
  printSummary(results, jsonOutputPath, csvOutputPath);
  await generateHtmlReport(jsonOutputPath, getReportOutputPath());
  console.log("Done. Review every record before importing it into a CRM or contacting anyone.");
}

async function loadInputWebsites(): Promise<LeadRecord[]> {
  const url = getArg("--url", "");

  if (url) {
    return [
      makeLeadFromInput({
        website_url: url,
        business_name: getArg("--business", ""),
        industry: getArg("--industry", ""),
        location: getArg("--location", ""),
        email: getArg("--email", ""),
      }),
    ];
  }

  const inputPath = path.resolve(getArg("--csv", getArg("--input", defaultInputPath)));
  console.log(`Reading input websites from ${path.relative(process.cwd(), inputPath)}`);

  return loadCsvInputWebsites(inputPath);
}

function getArg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function getOptionalNumberArg(name: string): number | undefined {
  const value = getArg(name, "");
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
