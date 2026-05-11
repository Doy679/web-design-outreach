import { mkdir } from "node:fs/promises";
import path from "node:path";
import { getScreenshotDir } from "./runtimePaths.js";
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
    launch: (options: { headless: boolean; args?: string[] }) => Promise<BrowserLike>;
  };
}

const screenshotTimeoutMs = 18000;

export async function captureScreenshots(url: string): Promise<ScreenshotCapture> {
  const empty = {
    desktop_screenshot_path: "",
    mobile_screenshot_path: "",
    desktop_preview_screenshot_path: "",
    desktop_full_screenshot_path: "",
    mobile_preview_screenshot_path: "",
    mobile_full_screenshot_path: "",
  };

  try {
    const playwright = await importPlaywright();
    const browser = await playwright.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const safeName = safeDomain(url);
    const screenshotDir = getScreenshotDir();
    const timestamp = Date.now();
    
    const desktopPreviewFileName = `desktop-preview-${safeName}-${timestamp}.png`;
    const desktopFullFileName = `desktop-full-${safeName}-${timestamp}.png`;
    const mobilePreviewFileName = `mobile-preview-${safeName}-${timestamp}.png`;
    const mobileFullFileName = `mobile-full-${safeName}-${timestamp}.png`;

    const desktopPreviewPath = path.join(screenshotDir, desktopPreviewFileName);
    const desktopFullPath = path.join(screenshotDir, desktopFullFileName);
    const mobilePreviewPath = path.join(screenshotDir, mobilePreviewFileName);
    const mobileFullPath = path.join(screenshotDir, mobileFullFileName);

    try {
      await mkdir(screenshotDir, { recursive: true });
      
      // Desktop Preview (Above the fold)
      await screenshotPage(browser, url, desktopPreviewPath, { width: 1440, height: 900 }, false);
      // Desktop Full Page
      await screenshotPage(browser, url, desktopFullPath, { width: 1440, height: 900 }, true);
      // Mobile Preview (Above the fold)
      await screenshotPage(browser, url, mobilePreviewPath, { width: 390, height: 844 }, false);
      // Mobile Full Page
      await screenshotPage(browser, url, mobileFullPath, { width: 390, height: 844 }, true);

      return {
        desktop_screenshot_path: `/screenshots/${desktopFullFileName}`, // Fallback
        mobile_screenshot_path: `/screenshots/${mobileFullFileName}`, // Fallback
        desktop_preview_screenshot_path: `/screenshots/${desktopPreviewFileName}`,
        desktop_full_screenshot_path: `/screenshots/${desktopFullFileName}`,
        mobile_preview_screenshot_path: `/screenshots/${mobilePreviewFileName}`,
        mobile_full_screenshot_path: `/screenshots/${mobileFullFileName}`,
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
  fullPage: boolean,
): Promise<void> {
  const page = await browser.newPage({
    viewport,
    userAgent: "web-design-outreach/1.0 public-website-preview",
  });

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: screenshotTimeoutMs });
    await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
    // Extra delay for stability and animations to settle
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.screenshot({ path: filePath, fullPage });
  } finally {
    // page.close() is not in interface but normally exists; interface PageLike needs update if we want to be safe
    // but browser.close() will handle it.
  }
}

async function importPlaywright(): Promise<PlaywrightLike> {
  const dynamicImport = new Function("specifier", "return import(specifier)") as (
    specifier: string,
  ) => Promise<unknown>;

  return (await dynamicImport("playwright")) as PlaywrightLike;
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  } catch {
    return `website-${Date.now()}`;
  }
}
