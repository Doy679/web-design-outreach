import type { BuilderDetection, BuilderName } from "./types.js";

interface BuilderRule {
  builder: BuilderName;
  tests: Array<{
    evidence: string;
    matches: (html: string, lowerHtml: string, headers: string) => boolean;
  }>;
}

const rules: BuilderRule[] = [
  {
    builder: "wix",
    tests: [
      {
        evidence: "Wix static asset URLs found",
        matches: (_html, lowerHtml) => lowerHtml.includes("wixstatic.com"),
      },
      {
        evidence: "Wix runtime markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("wix-thunderbolt") ||
          lowerHtml.includes("wix-code") ||
          lowerHtml.includes("wixsite.com"),
      },
      {
        evidence: "Wix generator metadata found",
        matches: (_html, lowerHtml) => lowerHtml.includes("content=\"wix\""),
      },
    ],
  },
  {
    builder: "squarespace",
    tests: [
      {
        evidence: "Squarespace domain or CDN markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("squarespace.com") ||
          lowerHtml.includes("squarespace-cdn.com") ||
          lowerHtml.includes("static1.squarespace.com"),
      },
      {
        evidence: "Squarespace page markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("squarespace") && lowerHtml.includes("data-section-id"),
      },
    ],
  },
  {
    builder: "godaddy",
    tests: [
      {
        evidence: "GoDaddy asset URLs found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("wsimg.com") || lowerHtml.includes("secureservercdn.net"),
      },
      {
        evidence: "GoDaddy website builder markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("godaddy") || lowerHtml.includes("websitebuilder"),
      },
    ],
  },
  {
    builder: "weebly",
    tests: [
      {
        evidence: "Weebly or EditMySite asset URLs found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("weebly.com") ||
          lowerHtml.includes("editmysite.com") ||
          lowerHtml.includes("weeblycloud.com"),
      },
      {
        evidence: "Weebly generator metadata found",
        matches: (_html, lowerHtml) => lowerHtml.includes("content=\"weebly\""),
      },
    ],
  },
  {
    builder: "wordpress",
    tests: [
      {
        evidence: "WordPress content directory found",
        matches: (_html, lowerHtml) => lowerHtml.includes("/wp-content/"),
      },
      {
        evidence: "WordPress includes directory found",
        matches: (_html, lowerHtml) => lowerHtml.includes("/wp-includes/"),
      },
      {
        evidence: "WordPress generator or API marker found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("content=\"wordpress") || lowerHtml.includes("/wp-json/"),
      },
    ],
  },
  {
    builder: "shopify",
    tests: [
      {
        evidence: "Shopify CDN URLs found",
        matches: (_html, lowerHtml) => lowerHtml.includes("cdn.shopify.com"),
      },
      {
        evidence: "Shopify theme markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("shopify.theme") ||
          lowerHtml.includes("shopify-section") ||
          lowerHtml.includes("myshopify.com"),
      },
      {
        evidence: "Shopify response headers found",
        matches: (_html, _lowerHtml, headers) => headers.includes("x-shopify"),
      },
    ],
  },
  {
    builder: "webflow",
    tests: [
      {
        evidence: "Webflow asset URLs found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("webflow.com") || lowerHtml.includes("uploads-ssl.webflow.com"),
      },
      {
        evidence: "Webflow page markers found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("data-wf-page") ||
          lowerHtml.includes("data-wf-site") ||
          lowerHtml.includes("w-mod-js"),
      },
      {
        evidence: "Webflow generator metadata found",
        matches: (_html, lowerHtml) => lowerHtml.includes("content=\"webflow\""),
      },
    ],
  },
  {
    builder: "framer",
    tests: [
      {
        evidence: "Framer asset URLs found",
        matches: (_html, lowerHtml) =>
          lowerHtml.includes("framerusercontent.com") || lowerHtml.includes("framer.com"),
      },
      {
        evidence: "Framer page markers found",
        matches: (_html, lowerHtml) => lowerHtml.includes("data-framer") || lowerHtml.includes("__framer"),
      },
      {
        evidence: "Framer generator metadata found",
        matches: (_html, lowerHtml) => lowerHtml.includes("content=\"framer\""),
      },
    ],
  },
];

export function detectBuilder(html: string, headers: Headers): BuilderDetection {
  const lowerHtml = html.toLowerCase();
  const headerText = Array.from(headers.entries())
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n")
    .toLowerCase();

  const matches = rules
    .map((rule) => ({
      builder: rule.builder,
      evidence: rule.tests
        .filter((test) => test.matches(html, lowerHtml, headerText))
        .map((test) => test.evidence),
    }))
    .filter((match) => match.evidence.length > 0)
    .sort((a, b) => b.evidence.length - a.evidence.length);

  if (matches.length === 0) {
    return {
      builder: html.trim().length > 500 ? "custom" : "unknown",
      confidence: "low",
      evidence: ["No common CMS or hosted builder signature found in homepage HTML."],
    };
  }

  const best = matches[0];
  return {
    builder: best.builder,
    confidence: best.evidence.length >= 3 ? "high" : best.evidence.length === 2 ? "medium" : "low",
    evidence: best.evidence,
  };
}
