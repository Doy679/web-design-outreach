import { tmpdir } from "node:os";
import path from "node:path";

export const sourceDataDir = "data";
export const sourceReportsDir = "reports";

export function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

export function getRuntimeDataDir(): string {
  return (
    process.env.WEB_DESIGN_DATA_DIR ||
    (isVercelRuntime() ? path.join(tmpdir(), "web-design-outreach", "data") : sourceDataDir)
  );
}

export function getRuntimeReportDir(): string {
  return (
    process.env.WEB_DESIGN_REPORT_DIR ||
    (isVercelRuntime() ? path.join(tmpdir(), "web-design-outreach", "reports") : sourceReportsDir)
  );
}

export function getInputPath(): string {
  return path.join(sourceDataDir, "leads.csv");
}

export function getJsonOutputPath(): string {
  return path.join(getRuntimeDataDir(), "results.json");
}

export function getCsvOutputPath(): string {
  return path.join(getRuntimeDataDir(), "results.csv");
}

export function getScreenshotDir(): string {
  return path.join(getRuntimeDataDir(), "screenshots");
}

export function getReportOutputPath(): string {
  return path.join(getRuntimeReportDir(), "index.html");
}
