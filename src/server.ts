import "dotenv/config";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseLeadsCsv, stringifyResults } from "./csv.js";
import { generateHtmlReport } from "./report.js";
import {
  analyzeLeadToResult,
  appendResult,
  defaultCsvOutputPath,
  defaultJsonOutputPath,
  isFullHttpUrl,
  makeLeadFromInput,
  readResultsFile,
  reviewStatuses,
  summarizeResults,
  updateResult,
  type AnalyzeInput,
} from "./workflow.js";
import type { LeadRecord, ReviewStatus } from "./types.js";

const host = "127.0.0.1";
const defaultPort = 3000;
const reportsDir = path.resolve("reports");
const dataDir = path.resolve("data");
const uploadDelayMs = 1500;

async function main(): Promise<void> {
  const requestedPort = Number(process.env.PORT ?? defaultPort);
  const port = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : defaultPort;

  await generateHtmlReport();
  const runningPort = await startServer(port);

  console.log(`Preview server running at http://localhost:${runningPort}`);
  console.log("Press Ctrl+C to stop the preview server.");
}

async function startServer(startPort: number): Promise<number> {
  for (let port = startPort; port <= startPort + 20; port += 1) {
    try {
      await listen(port);
      return port;
    } catch (error) {
      if (isAddressInUse(error)) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(`No available preview port found between ${startPort} and ${startPort + 20}.`);
}

function listen(port: number): Promise<Server> {
  const server = createServer(handleRequest);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && url.pathname === "/api/results") {
      await handleResults(response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      await handleAnalyze(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/results/update") {
      await handleUpdateResult(request, response);
      return;
    }

    if (request.method === "PATCH" && url.pathname.startsWith("/api/results/")) {
      const id = decodeURIComponent(url.pathname.replace("/api/results/", ""));
      await handleUpdateResult(request, response, id);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/upload-csv") {
      await handleUploadCsv(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/export/csv") {
      await handleExportCsv(response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/export/json") {
      await handleExportJson(response);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      sendJson(response, 404, { success: false, error: "API route not found." });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/data/screenshots/")) {
      await serveDataFile(url.pathname, response);
      return;
    }

    await serveReportFile(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { success: false, error: getErrorMessage(error) });
  }
}

async function handleResults(response: ServerResponse): Promise<void> {
  const results = await readResultsFile(defaultJsonOutputPath);

  sendJson(response, 200, {
    success: true,
    results,
    summary: summarizeResults(results),
  });
}

async function handleAnalyze(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request);
  const websiteUrl = typeof body.website_url === "string" ? body.website_url.trim() : "";

  if (!isFullHttpUrl(websiteUrl)) {
    sendJson(response, 400, {
      success: false,
      error: "Invalid URL. Please enter a full URL starting with http:// or https://",
    });
    return;
  }

  try {
    const input: AnalyzeInput = {
      website_url: websiteUrl,
      business_name: getOptionalString(body.business_name),
      industry: getOptionalString(body.industry),
      location: getOptionalString(body.location),
      email: getOptionalString(body.email),
    };
    const result = await analyzeLeadToResult(makeLeadFromInput(input));
    const results = await appendResult(result, defaultJsonOutputPath, defaultCsvOutputPath);
    await generateHtmlReport(defaultJsonOutputPath, "reports/index.html");

    sendJson(response, 200, {
      success: true,
      result,
      results,
      summary: summarizeResults(results),
    });
  } catch (error) {
    sendJson(response, 500, {
      success: false,
      error: `Analysis failed: ${getErrorMessage(error)}`,
    });
  }
}

async function handleUpdateResult(
  request: IncomingMessage,
  response: ServerResponse,
  routeId = "",
): Promise<void> {
  const body = await readJsonBody(request);
  const id = routeId || getOptionalString(body.id);
  const websiteUrl = getOptionalString(body.website_url);
  const status = getOptionalString(body.status);
  const notes = typeof body.notes === "string" ? body.notes : undefined;

  if (!id && !websiteUrl) {
    sendJson(response, 400, { success: false, error: "Missing result id or website_url." });
    return;
  }

  const results = await updateResult(
    { id, website_url: websiteUrl },
    { status: isReviewStatus(status) ? status : undefined, notes },
    defaultJsonOutputPath,
    defaultCsvOutputPath,
  );
  await generateHtmlReport(defaultJsonOutputPath, "reports/index.html");

  sendJson(response, 200, {
    success: true,
    results,
    summary: summarizeResults(results),
  });
}

async function handleUploadCsv(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const body = await readJsonBody(request, 2_500_000);
  const leads = getLeadsFromUploadBody(body);

  if (leads.length === 0) {
    sendJson(response, 400, {
      success: false,
      error: "No valid website rows found. CSV columns should include business_name,website_url,industry,location,email.",
    });
    return;
  }

  const analyzed = [];
  let results = await readResultsFile(defaultJsonOutputPath);

  for (let index = 0; index < leads.length; index += 1) {
    const lead = leads[index];
    const result = await analyzeLeadToResult(lead);
    results = await appendResult(result, defaultJsonOutputPath, defaultCsvOutputPath);
    analyzed.push(result);

    if (index < leads.length - 1) {
      await delay(uploadDelayMs);
    }
  }

  await generateHtmlReport(defaultJsonOutputPath, "reports/index.html");
  sendJson(response, 200, {
    success: true,
    analyzed,
    results,
    summary: summarizeResults(results),
  });
}

async function handleExportCsv(response: ServerResponse): Promise<void> {
  const results = await readResultsFile(defaultJsonOutputPath);
  const content = stringifyResults(results);
  response.writeHead(200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": 'attachment; filename="web-design-outreach-results.csv"',
    "cache-control": "no-store",
  });
  response.end(content);
}

async function handleExportJson(response: ServerResponse): Promise<void> {
  const results = await readResultsFile(defaultJsonOutputPath);
  response.writeHead(200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": 'attachment; filename="web-design-outreach-results.json"',
    "cache-control": "no-store",
  });
  response.end(`${JSON.stringify(results, null, 2)}\n`);
}

async function serveReportFile(pathname: string, response: ServerResponse): Promise<void> {
  try {
    const filePath = getSafeReportPath(pathname);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      sendNotFound(response);
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": getContentType(filePath),
      "cache-control": "no-store",
    });
    response.end(content);
  } catch {
    sendNotFound(response);
  }
}

async function serveDataFile(pathname: string, response: ServerResponse): Promise<void> {
  try {
    const filePath = getSafeDataPath(pathname);
    const fileStats = await stat(filePath);

    if (!fileStats.isFile()) {
      sendNotFound(response);
      return;
    }

    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": getContentType(filePath),
      "cache-control": "no-store",
    });
    response.end(content);
  } catch {
    sendNotFound(response);
  }
}

function readJsonBody(request: IncomingMessage, maxBytes = 500_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");

      if (body.length > maxBytes) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function getLeadsFromUploadBody(body: Record<string, unknown>): LeadRecord[] {
  if (typeof body.csv === "string") {
    return parseLeadsCsv(body.csv)
      .filter((lead) => isFullHttpUrl(lead.website_url))
      .map((lead) => makeLeadFromInput(lead));
  }

  if (Array.isArray(body.rows)) {
    return body.rows
      .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object" && !Array.isArray(row))
      .map((row) =>
        makeLeadFromInput({
          website_url: getOptionalString(row.website_url),
          business_name: getOptionalString(row.business_name),
          industry: getOptionalString(row.industry),
          location: getOptionalString(row.location),
          email: getOptionalString(row.email),
        }),
      )
      .filter((lead) => isFullHttpUrl(lead.website_url));
  }

  return [];
}

function getSafeReportPath(pathname: string): string {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(reportsDir, `.${normalizedPath}`);

  if (!filePath.startsWith(reportsDir)) {
    return path.join(reportsDir, "index.html");
  }

  return filePath;
}

function getSafeDataPath(pathname: string): string {
  const requestedPath = pathname.replace(/^\/data\//, "");
  const normalizedPath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.resolve(dataDir, normalizedPath);

  if (!filePath.startsWith(dataDir)) {
    return path.join(dataDir, "results.json");
  }

  return filePath;
}

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }

  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }

  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }

  if (extension === ".json") {
    return "application/json; charset=utf-8";
  }

  if (extension === ".csv") {
    return "text/csv; charset=utf-8";
  }

  if (extension === ".png") {
    return "image/png";
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  return "application/octet-stream";
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendNotFound(response: ServerResponse): void {
  response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  response.end("Not found");
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE";
}

function getOptionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isReviewStatus(value: string): value is ReviewStatus {
  return reviewStatuses.includes(value as ReviewStatus);
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
