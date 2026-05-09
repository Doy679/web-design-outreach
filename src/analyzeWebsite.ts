import { detectBuilder } from "./detectBuilder.js";
import { detectBusinessIdentity } from "./identity.js";
import { captureScreenshots } from "./screenshots.js";
import { buildScoreBreakdown, extractWebsiteSignals, findWebsiteIssues, scoreWebsiteOpportunity } from "./scoring.js";
import type {
  BusinessIdentity,
  BuilderDetection,
  LeadRecord,
  ScoreBreakdown,
  ScreenshotCapture,
  WebsiteScanResult,
  WebsiteSignals,
  WebsiteStatus,
} from "./types.js";

interface RenderedPage {
  html: string;
  text: string;
  finalUrl: string;
}

interface BrowserLike {
  close: () => Promise<void>;
  newPage: () => Promise<PageLike>;
}

interface PageLike {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  waitForLoadState: (state: "networkidle", options: { timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  url: () => string;
  locator: (selector: string) => {
    innerText: (options: { timeout: number }) => Promise<string>;
  };
}

interface PlaywrightLike {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<BrowserLike>;
  };
}

const fetchTimeoutMs = 15000;
const renderTimeoutMs = 18000;

export async function analyzeWebsite(lead: LeadRecord): Promise<WebsiteScanResult> {
  const urlValidation = getUrlCandidates(lead.website_url);

  if (!urlValidation.valid) {
    return failedScan(lead, "", lead.website_url, "Invalid website URL.", "invalid_url");
  }

  let lastScan: WebsiteScanResult | null = null;

  // Plain domains try HTTPS first, then HTTP only if HTTPS never responds.
  for (const url of urlValidation.urls) {
    const scan = await scanSingleUrl(lead, url);

    if (scan.status === "analyzed" || scan.status === "blocked" || scan.statusCode || url.startsWith("http://")) {
      return scan;
    }

    lastScan = scan;
  }

  return lastScan ?? failedScan(lead, "", lead.website_url, "Unable to fetch website.", "fetch_failed");
}

async function scanSingleUrl(lead: LeadRecord, normalizedUrl: string): Promise<WebsiteScanResult> {
  try {
    const response = await fetchHomepage(normalizedUrl);
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      const status = response.status === 401 || response.status === 403 ? "blocked" : "fetch_failed";
      return failedScan(
        lead,
        normalizedUrl,
        response.url || normalizedUrl,
        `HTTP ${response.status} ${response.statusText}`,
        status,
        response.status,
      );
    }

    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      return failedScan(
        lead,
        normalizedUrl,
        response.url || normalizedUrl,
        `Unsupported content type: ${contentType}`,
        "fetch_failed",
        response.status,
      );
    }

    const html = await response.text();

    if (looksBlockedOrPrivate(html)) {
      return failedScan(
        lead,
        normalizedUrl,
        response.url || normalizedUrl,
        "Page appears blocked, private, gated, or captcha-protected; skipped without bypassing.",
        "blocked",
        response.status,
      );
    }

    const initialSignals = extractWebsiteSignals(html);

    if (looksJavaScriptRendered(html, initialSignals)) {
      return scanRenderedFallback(lead, normalizedUrl, response.url || normalizedUrl, html, response.headers, initialSignals);
    }

    return await analyzedScan(lead, normalizedUrl, response.url || normalizedUrl, html, response.headers, "", false, response.status);
  } catch (error) {
    return failedScan(lead, normalizedUrl, normalizedUrl, getErrorMessage(error), "fetch_failed");
  }
}

async function scanRenderedFallback(
  lead: LeadRecord,
  normalizedUrl: string,
  finalUrl: string,
  initialHtml: string,
  headers: Headers,
  initialSignals: WebsiteSignals,
): Promise<WebsiteScanResult> {
  try {
    const rendered = await renderWithPlaywright(finalUrl || normalizedUrl);

    if (looksBlockedOrPrivate(rendered.html) || looksBlockedOrPrivate(rendered.text)) {
      return failedScan(
        lead,
        normalizedUrl,
        rendered.finalUrl || finalUrl,
        "Rendered page appears blocked, private, gated, or captcha-protected; skipped without bypassing.",
        "blocked",
        undefined,
        true,
      );
    }

    const renderedSignals = extractWebsiteSignals(rendered.html, rendered.text);

    if (renderedSignals.wordCount < 20) {
      return partialManualReviewScan(
        lead,
        normalizedUrl,
        rendered.finalUrl || finalUrl,
        rendered.html || initialHtml,
        headers,
        "Homepage appears JavaScript-rendered, but rendered text was still too short for confident analysis.",
      );
    }

    return await analyzedScan(
      lead,
      normalizedUrl,
      rendered.finalUrl || finalUrl,
      rendered.html || initialHtml,
      headers,
      rendered.text,
      true,
    );
  } catch (error) {
    return partialManualReviewScan(
      lead,
      normalizedUrl,
      finalUrl,
      initialHtml,
      headers,
      `Homepage appears JavaScript-rendered, but Playwright rendering failed: ${getErrorMessage(error)}`,
    );
  }
}

async function analyzedScan(
  lead: LeadRecord,
  normalizedUrl: string,
  finalUrl: string,
  html: string,
  headers: Headers,
  renderedText: string,
  isJavaScriptRendered: boolean,
  statusCode?: number,
): Promise<WebsiteScanResult> {
  const builder = detectBuilder(html, headers);
  const signals = extractWebsiteSignals(html, renderedText);
  const businessIdentity = detectBusinessIdentity(lead, html, finalUrl, signals);
  const issues = findWebsiteIssues(signals, builder, isJavaScriptRendered);
  const websiteScore = scoreWebsiteOpportunity(issues, builder);
  const scoreBreakdown = buildScoreBreakdown(issues, builder, signals);
  const screenshots = await captureScreenshots(finalUrl);

  return {
    lead,
    normalizedUrl,
    finalUrl,
    status: "analyzed",
    success: true,
    statusCode,
    isJavaScriptRendered,
    builder,
    businessIdentity,
    signals,
    issues,
    websiteScore,
    scoreBreakdown,
    screenshots,
  };
}

function partialManualReviewScan(
  lead: LeadRecord,
  normalizedUrl: string,
  finalUrl: string,
  html: string,
  headers: Headers,
  error: string,
): WebsiteScanResult {
  const builder = detectBuilder(html, headers);
  const signals = extractWebsiteSignals(html);
  const businessIdentity = detectBusinessIdentity(lead, html, finalUrl, signals);
  const issues = findWebsiteIssues(signals, builder, true);
  const websiteScore = scoreWebsiteOpportunity(issues, builder);
  const scoreBreakdown = buildScoreBreakdown(issues, builder, signals);

  return {
    lead,
    normalizedUrl,
    finalUrl,
    status: "needs_manual_review",
    success: false,
    error,
    isJavaScriptRendered: true,
    renderNote: error,
    builder,
    businessIdentity,
    signals,
    issues,
    websiteScore,
    scoreBreakdown,
    screenshots: emptyScreenshots(),
  };
}

function getUrlCandidates(value: string): { valid: boolean; urls: string[] } {
  const trimmed = value.trim();

  if (!trimmed || /\s/.test(trimmed)) {
    return { valid: false, urls: [] };
  }

  const values = /^https?:\/\//i.test(trimmed) ? [trimmed] : [`https://${trimmed}`, `http://${trimmed}`];
  const urls = values.filter((candidate) => {
    try {
      const url = new URL(candidate);
      return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
    } catch {
      return false;
    }
  });

  return { valid: urls.length > 0, urls };
}

async function fetchHomepage(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    return await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "web-design-outreach/1.0 public-homepage-analysis",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function renderWithPlaywright(url: string): Promise<RenderedPage> {
  const playwright = await importPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: renderTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);

    return {
      html: await page.content(),
      text: await page.locator("body").innerText({ timeout: 5000 }).catch(() => ""),
      finalUrl: page.url(),
    };
  } finally {
    await browser.close();
  }
}

async function importPlaywright(): Promise<PlaywrightLike> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<unknown>;

  try {
    return (await dynamicImport("playwright")) as PlaywrightLike;
  } catch {
    throw new Error("Playwright is not installed. Run npm install, then npx playwright install chromium.");
  }
}

function looksJavaScriptRendered(html: string, signals: WebsiteSignals): boolean {
  const text = signals.textExcerpt.trim().toLowerCase();
  const normalizedText = text.replace(/[.\s]/g, "");

  return (
    signals.wordCount < 20 ||
    normalizedText === "loading" ||
    normalizedText === "pleasewait" ||
    (html.trim().length < 500 && signals.wordCount < 40)
  );
}

function looksBlockedOrPrivate(content: string): boolean {
  const lowerContent = content.toLowerCase();
  // Conservative skip list: do not attempt to work around gated or blocked pages.
  const blockedMarkers = [
    "access denied",
    "attention required! | cloudflare",
    "please enable cookies",
    "login required",
    "sign in to continue",
    "subscribe to continue",
    "paywall",
    "checking your browser before accessing",
    "verify you are human",
    "complete the security check",
  ];

  return blockedMarkers.some((marker) => lowerContent.includes(marker));
}

function failedScan(
  lead: LeadRecord,
  normalizedUrl: string,
  finalUrl: string,
  error: string,
  status: WebsiteStatus,
  statusCode?: number,
  isJavaScriptRendered = false,
): WebsiteScanResult {
  return {
    lead,
    normalizedUrl,
    finalUrl,
    status,
    success: false,
    error,
    statusCode,
    isJavaScriptRendered,
    builder: emptyBuilder(),
    businessIdentity: emptyBusinessIdentity(lead, finalUrl || normalizedUrl),
    signals: emptySignals(),
    issues: [],
    websiteScore: 0,
    scoreBreakdown: emptyScoreBreakdown(),
    screenshots: emptyScreenshots(),
  };
}

function emptyBuilder(): BuilderDetection {
  return {
    builder: "unknown",
    confidence: "low",
    evidence: [],
  };
}

function emptyBusinessIdentity(lead: LeadRecord, url: string): BusinessIdentity {
  return {
    name: lead.business_name || deriveNameFromUrl(url) || "Unknown Website",
    confidence: lead.business_name ? "high" : "low",
    source: lead.business_name ? "provided" : "domain",
    industry: lead.industry,
    location: lead.location,
  };
}

function emptyScoreBreakdown(): ScoreBreakdown {
  return {
    overall_score: 0,
    cta_score: 0,
    seo_score: 0,
    contact_visibility_score: 0,
    design_ux_score: 0,
    conversion_score: 0,
    trust_signal_score: 0,
    lead_fit_score: 0,
    score_summary: "Website could not be fully analyzed.",
    top_3_reasons_for_score: [],
    priority_level: "Low",
  };
}

function emptyScreenshots(): ScreenshotCapture {
  return {
    desktop_screenshot_path: "",
    mobile_screenshot_path: "",
  };
}

function deriveNameFromUrl(value: string): string {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(candidate).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function emptySignals(): WebsiteSignals {
  return {
    title: "",
    metaDescription: "",
    wordCount: 0,
    textExcerpt: "",
    hasClearCta: false,
    hasPhone: false,
    hasEmail: false,
    hasBookingOrContactButton: false,
    hasTrustSignals: false,
    hasNavigation: false,
    oldCopyrightYear: null,
    weakTitle: true,
    weakMetaDescription: true,
    genericPhrases: [],
    corporateSignals: [],
    navigationLabels: [],
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
