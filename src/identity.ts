import type { BusinessIdentity, BuilderConfidence, LeadRecord, WebsiteSignals } from "./types.js";

interface Candidate {
  name: string;
  confidence: BuilderConfidence;
  source: string;
}

export function detectBusinessIdentity(
  lead: LeadRecord,
  html: string,
  finalUrl: string,
  signals: WebsiteSignals,
): BusinessIdentity {
  const providedName = lead.business_name.trim();
  const candidates: Candidate[] = [];

  if (providedName) {
    candidates.push({ name: providedName, confidence: "high", source: "provided" });
  }

  const jsonLdIdentity = extractJsonLdIdentity(html);
  if (jsonLdIdentity.name) {
    candidates.push({ name: jsonLdIdentity.name, confidence: "high", source: jsonLdIdentity.source });
  }

  const ogSiteName = signals.ogSiteName || getMetaContent(html, "property", "og:site_name");
  if (ogSiteName) {
    candidates.push({ name: ogSiteName, confidence: "high", source: "og_site_name" });
  }

  const applicationName = signals.applicationName || getMetaContent(html, "name", "application-name");
  if (applicationName) {
    candidates.push({ name: applicationName, confidence: "medium", source: "application-name" });
  }

  const h1 = signals.h1Text[0] || extractFirstTagText(html, "h1");
  if (h1) {
    candidates.push({ name: h1, confidence: "medium", source: "h1" });
  }

  const logoAlt = signals.logoAltText[0] || extractLogoAlt(html);
  if (logoAlt) {
    candidates.push({ name: logoAlt, confidence: "medium", source: "logo_alt" });
  }

  const titleName = cleanTitle(signals.title || signals.ogTitle);
  if (titleName) {
    candidates.push({ name: titleName, confidence: "medium", source: "title" });
  }

  candidates.push({ name: domainFallback(finalUrl || lead.website_url), confidence: "low", source: "domain_fallback" });

  const best = candidates.find((candidate) => candidate.name.trim()) ?? {
    name: "Unknown Website",
    confidence: "low" as BuilderConfidence,
    source: "fallback",
  };

  return {
    name: normalizeName(best.name),
    confidence: best.confidence,
    source: best.source,
    industry: lead.industry || jsonLdIdentity.industry,
    location: lead.location || jsonLdIdentity.location,
  };
}

function extractJsonLdIdentity(html: string): { name: string; industry: string; location: string; source: string } {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];

  for (const script of scripts) {
    const content = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    const parsed = safeJsonParse(content);
    const objects = flattenJsonLd(parsed);

    for (const object of objects) {
      const type = getJsonString(object["@type"]).toLowerCase();
      const name = getJsonString(object.name);

      if (name && (type.includes("organization") || type.includes("localbusiness") || type.includes("business"))) {
        return {
          name,
          industry: getJsonString(object.industry) || getJsonString(object.category),
          location: extractJsonLdLocation(object),
          source: type.includes("localbusiness") ? "json-ld LocalBusiness" : "json-ld Organization",
        };
      }
    }
  }

  return { name: "", industry: "", location: "", source: "" };
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const graph = record["@graph"];
    return [record, ...flattenJsonLd(graph)];
  }

  return [];
}

function extractJsonLdLocation(object: Record<string, unknown>): string {
  const address = object.address;

  if (typeof address === "string") {
    return address;
  }

  if (address && typeof address === "object") {
    const record = address as Record<string, unknown>;
    return [record.addressLocality, record.addressRegion, record.addressCountry]
      .map(getJsonString)
      .filter(Boolean)
      .join(", ");
  }

  return "";
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getMetaContent(html: string, attr: "name" | "property", target: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    if (getAttribute(tag, attr).toLowerCase() === target.toLowerCase()) {
      return normalizeName(decodeHtml(getAttribute(tag, "content")));
    }
  }

  return "";
}

function extractFirstTagText(html: string, tagName: string): string {
  const match = html.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return normalizeName(stripTags(decodeHtml(match?.[1] ?? "")));
}

function extractLogoAlt(html: string): string {
  const images = html.match(/<img\b[^>]*>/gi) ?? [];

  for (const image of images) {
    const combined = `${getAttribute(image, "class")} ${getAttribute(image, "id")} ${getAttribute(image, "src")}`.toLowerCase();
    const alt = normalizeName(decodeHtml(getAttribute(image, "alt")));

    if (alt && combined.includes("logo")) {
      return alt;
    }
  }

  return "";
}

function cleanTitle(title: string): string {
  const firstSegment = title.split(/\s(?:[|–—-]|::)\s/)[0] ?? title;
  return cleanBusinessName(firstSegment);
}

function domainFallback(value: string): string {
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const hostname = new URL(candidate).hostname.replace(/^www\./i, "");
    const firstPart = hostname.split(".")[0] ?? hostname;
    const spaced = firstPart
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/([a-z])(\d)/gi, "$1 $2")
      .replace(/(\d)([a-z])/gi, "$1 $2");

    return titleCase(spaced);
  } catch {
    return "Unknown Website";
  }
}

function getJsonString(value: unknown): string {
  if (typeof value === "string") {
    return normalizeName(value);
  }

  if (Array.isArray(value)) {
    return value.map(getJsonString).filter(Boolean).join(", ");
  }

  return "";
}

function getAttribute(tag: string, name: string): string {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted?.[1]) {
    return quoted[1];
  }

  const unquoted = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted?.[1] ?? "";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeName(value: string): string {
  return cleanBusinessName(value);
}

function cleanBusinessName(value: string): string {
  let cleaned = value
    .replace(/\blogo\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const suffixes = [
    "Home",
    "Official Site",
    "Welcome",
    "Restaurant",
    "Services",
    "Best",
    "Near Me",
    "Website",
  ];

  for (const suffix of suffixes) {
    cleaned = cleaned.replace(new RegExp(`\\s*(?:[-|–—:]\\s*)?${escapeRegExp(suffix)}\\s*$`, "i"), "").trim();
  }

  return cleaned;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
