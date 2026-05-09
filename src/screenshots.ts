import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { ScreenshotCapture } from "./types.js";

interface BrowserLike {
  close: () => Promise<void>;
  newPage: (options?: { viewport?: { width: number; height: number }; userAgent?: string }) => Promise<PageLike>;
}

interface PageLike {
  goto: (url: string, options: { waitUntil: "domcontentloaded"; timeout: number }) => Promise<unknown>;
  waitForLoadState: (state: "networkidle", options: { timeout: number }) => Promise<unknown>;
  screenshot: (options: { path: string; fullPage: boolean }) => Promise<Buffer>;
}

interface PlaywrightLike {
  chromium: {
    launch: (options: { headless: boolean }) => Promise<BrowserLike>;
  };
}

const screenshotDir = "data/screenshots";
const screenshotTimeoutMs = 18000;

export async function captureScreenshots(url: string): Promise<ScreenshotCapture> {
  const empty = {
    desktop_screenshot_path: "",
    mobile_screenshot_path: "",
  };

  try {
    const playwright = await importPlaywright();
    const browser = await playwright.chromium.launch({ headless: true });
    const safeName = safeDomain(url);
    const desktopPath = path.join(screenshotDir, `desktop-${safeName}.png`);
    const mobilePath = path.join(screenshotDir, `mobile-${safeName}.png`);

    try {
      await mkdir(screenshotDir, { recursive: true });
      await screenshotPage(browser, url, desktopPath, { width: 1440, height: 1000 });
      await screenshotPage(browser, url, mobilePath, { width: 390, height: 844 });

      return {
        desktop_screenshot_path: desktopPath,
        mobile_screenshot_path: mobilePath,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      ...empty,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function screenshotPage(
  browser: BrowserLike,
  url: string,
  filePath: string,
  viewport: { width: number; height: number },
): Promise<void> {
  const page = await browser.newPage({
    viewport,
    userAgent: "web-design-outreach/1.0 public-website-preview",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: screenshotTimeoutMs });
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.screenshot({ path: filePath, fullPage: true });
}

async function importPlaywright(): Promise<PlaywrightLike> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<unknown>;

  return (await dynamicImport("playwright")) as PlaywrightLike;
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").replace(/[^a-z0-9.-]/gi, "-").toLowerCase();
  } catch {
    return `website-${Date.now()}`;
  }
}
