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
    const desktopFileName = `desktop-${safeName}-${timestamp}.png`;
    const mobileFileName = `mobile-${safeName}-${timestamp}.png`;
    const desktopFilePath = path.join(screenshotDir, desktopFileName);
    const mobileFilePath = path.join(screenshotDir, mobileFileName);
    const desktopPublicPath = `/screenshots/${desktopFileName}`;
    const mobilePublicPath = `/screenshots/${mobileFileName}`;

    try {
      await mkdir(screenshotDir, { recursive: true });
      await screenshotPage(browser, url, desktopFilePath, { width: 1440, height: 1000 });
      await screenshotPage(browser, url, mobileFilePath, { width: 390, height: 844 });

      return {
        desktop_screenshot_path: desktopPublicPath,
        mobile_screenshot_path: mobilePublicPath,
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
    return new URL(url).hostname.replace(/^www\./i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  } catch {
    return `website-${Date.now()}`;
  }
}
