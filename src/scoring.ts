import type {
  BuilderDetection,
  BuilderName,
  IssueCategory,
  IssueUrgency,
  PriorityLevel,
  ScoreBreakdown,
  WebsiteIssue,
  WebsiteSignals,
} from "./types.js";

const ctaPhrases = [
  "book now",
  "book online",
  "schedule",
  "appointment",
  "contact us",
  "get a quote",
  "request a quote",
  "free estimate",
  "free consultation",
  "call now",
  "reserve",
  "order now",
];

const genericPhrases = [
  "welcome to our website",
  "under construction",
  "coming soon",
  "click here",
  "learn more about us",
  "we offer a wide range",
  "best kept secret",
  "internet explorer",
  "webmaster",
];

const trustPhrases = [
  "reviews",
  "testimonials",
  "licensed",
  "insured",
  "certified",
  "years of experience",
  "award",
  "guarantee",
  "trusted",
  "portfolio",
  "case studies",
];

const corporatePhrases = [
  "investor relations",
  "annual report",
  "press room",
  "media relations",
  "global headquarters",
  "franchise opportunities",
  "nasdaq",
  "nyse",
  "locations worldwide",
  "corporate responsibility",
  "fortune 500",
];

const navigationPhrases = ["home", "about", "services", "products", "contact", "locations", "pricing", "book"];

const builderOpportunityScore: Record<BuilderName, number> = {
  wix: 10,
  squarespace: 7,
  godaddy: 11,
  weebly: 11,
  wordpress: 6,
  shopify: 3,
  webflow: 4,
  framer: 4,
  custom: 0,
  unknown: 0,
};

export function extractWebsiteSignals(html: string, renderedText = ""): WebsiteSignals {
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const visibleText = normalizeText(renderedText) || extractVisibleText(html);
  const lowerText = visibleText.toLowerCase();
  const wordCount = countWords(visibleText);
  const foundGenericPhrases = genericPhrases.filter((phrase) => lowerText.includes(phrase));
  const foundCorporateSignals = corporatePhrases.filter((phrase) => lowerText.includes(phrase));
  const navigationLabels = extractNavigationLabels(html, visibleText);

  return {
    title,
    metaDescription,
    wordCount,
    textExcerpt: visibleText.slice(0, 2500),
    hasClearCta: ctaPhrases.some((phrase) => lowerText.includes(phrase)),
    hasPhone: hasVisiblePhone(visibleText),
    hasEmail: hasVisibleEmail(visibleText),
    hasBookingOrContactButton: hasBookingOrContactButton(html),
    hasTrustSignals: trustPhrases.some((phrase) => lowerText.includes(phrase)),
    hasNavigation: navigationLabels.length >= 2,
    oldCopyrightYear: findOldCopyrightYear(html),
    weakTitle: isWeakTitle(title),
    weakMetaDescription: metaDescription.length < 50,
    genericPhrases: foundGenericPhrases,
    corporateSignals: foundCorporateSignals,
    navigationLabels,
  };
}

export function findWebsiteIssues(
  signals: WebsiteSignals,
  builder: BuilderDetection,
  isJavaScriptRendered = false,
): WebsiteIssue[] {
  const issues: WebsiteIssue[] = [];

  if (["wix", "godaddy", "weebly"].includes(builder.builder)) {
    issues.push(makeIssue({
      key: "template_builder",
      issue: "Templated website builder detected",
      detail: `Homepage appears to use ${builder.builder}.`,
      evidence: `Homepage appears to use ${builder.builder} (${builder.evidence[0] ?? "builder marker found"}).`,
      why_it_matters: "Hosted template builders can be fine, but older template implementations often limit differentiation and conversion-focused layout.",
      suggested_fix: "Review whether a focused redesign or landing page would better present the offer and contact path.",
      urgency: "Medium",
      category: "UX",
      weight: 8,
    }));
  }

  if (signals.weakTitle || signals.weakMetaDescription) {
    const parts = [
      signals.weakTitle ? "weak or missing title" : "",
      signals.weakMetaDescription ? "weak or missing meta description" : "",
    ].filter(Boolean);

    issues.push(makeIssue({
      key: "weak_seo_basics",
      issue: "Weak SEO title or meta description",
      detail: `Homepage has ${parts.join(" and ")}.`,
      evidence: `Homepage has ${parts.join(" and ")}.`,
      why_it_matters: "Weak search snippets and unclear page titles reduce first impressions before a visitor reaches the site.",
      suggested_fix: "Rewrite the title and meta description around the core service, city, and primary conversion action.",
      urgency: "Medium",
      category: "SEO",
      weight: 12,
    }));
  }

  if (!signals.hasClearCta) {
    issues.push(makeIssue({
      key: "missing_cta",
      issue: "Missing clear call to action",
      detail: "No clear CTA phrase such as book, schedule, contact, or get a quote was visible in homepage text.",
      evidence: "No clear CTA phrase such as book, schedule, contact, or get a quote was visible in homepage text.",
      why_it_matters: "Visitors need a clear next step; unclear CTAs can reduce calls, bookings, and quote requests.",
      suggested_fix: "Add a prominent above-the-fold CTA and repeat it near key service sections.",
      urgency: "High",
      category: "CTA",
      weight: 15,
    }));
  }

  if (!signals.hasBookingOrContactButton) {
    issues.push(makeIssue({
      key: "missing_contact_button",
      issue: "No obvious booking or contact button",
      detail: "No prominent contact, booking, appointment, quote, phone, or email button was found in links/buttons.",
      evidence: "No prominent contact, booking, appointment, quote, phone, or email button was found in links/buttons.",
      why_it_matters: "A hidden contact path creates friction for visitors who are ready to act.",
      suggested_fix: "Add a visible contact or booking button in the header and hero area.",
      urgency: "High",
      category: "Conversion",
      weight: 12,
    }));
  }

  if (!signals.hasPhone) {
    issues.push(makeIssue({
      key: "missing_phone",
      issue: "No phone number visible",
      detail: "No phone number was visible in the homepage text.",
      evidence: "No phone number was visible in the homepage text.",
      why_it_matters: "For service businesses, phone visibility can directly affect calls and lead volume.",
      suggested_fix: "Add a clickable phone number in the header, footer, and contact section.",
      urgency: "Medium",
      category: "Contact",
      weight: 8,
    }));
  }

  if (!signals.hasEmail) {
    issues.push(makeIssue({
      key: "missing_email",
      issue: "No email address visible",
      detail: "No email address was visible in the homepage text.",
      evidence: "No email address was visible in the homepage text.",
      why_it_matters: "Some prospects prefer written contact; missing email can reduce conversion options.",
      suggested_fix: "Add an email address or simple contact form with a clear response expectation.",
      urgency: "Low",
      category: "Contact",
      weight: 6,
    }));
  }

  if (signals.oldCopyrightYear) {
    issues.push(makeIssue({
      key: "old_copyright",
      issue: "Outdated copyright year",
      detail: `Copyright year appears to be ${signals.oldCopyrightYear}.`,
      evidence: `Copyright year appears to be ${signals.oldCopyrightYear}.`,
      why_it_matters: "Outdated details can make visitors question whether the business is active and attentive.",
      suggested_fix: "Update footer details and review the page for other stale content.",
      urgency: "Medium",
      category: "Trust",
      weight: 11,
    }));
  }

  if (signals.wordCount < 180) {
    issues.push(makeIssue({
      key: "low_text",
      issue: "Very low amount of homepage text",
      detail: `Only about ${signals.wordCount} words of visible text were found.`,
      evidence: `Only about ${signals.wordCount} words of visible text were found.`,
      why_it_matters: "Thin content can make it hard for visitors and search engines to understand services, trust, and next steps.",
      suggested_fix: "Add concise service descriptions, local proof, benefits, and a clear conversion path.",
      urgency: signals.wordCount < 60 ? "High" : "Medium",
      category: "UX",
      weight: 10,
    }));
  }

  if (!signals.hasTrustSignals) {
    issues.push(makeIssue({
      key: "missing_trust_signals",
      issue: "No obvious trust signals",
      detail: "Homepage text did not show obvious reviews, testimonials, credentials, guarantees, or portfolio proof.",
      evidence: "Homepage text did not show obvious reviews, testimonials, credentials, guarantees, or portfolio proof.",
      why_it_matters: "Trust proof reduces hesitation and supports higher conversion rates.",
      suggested_fix: "Add reviews, testimonials, certifications, project photos, guarantees, or credibility badges.",
      urgency: "Medium",
      category: "Trust",
      weight: 7,
    }));
  }

  if (!signals.hasNavigation) {
    issues.push(makeIssue({
      key: "unclear_navigation",
      issue: "Broken or unclear navigation",
      detail: "Homepage did not show a clear set of navigation paths such as services, about, locations, or contact.",
      evidence: "Homepage did not show a clear set of navigation paths such as services, about, locations, or contact.",
      why_it_matters: "Visitors need predictable paths to compare services, verify fit, and contact the business.",
      suggested_fix: "Simplify navigation around services, proof, about, locations, and contact.",
      urgency: "Medium",
      category: "UX",
      weight: 7,
    }));
  }

  if (isJavaScriptRendered) {
    issues.push(makeIssue({
      key: "javascript_rendered",
      issue: "Homepage depends heavily on JavaScript",
      detail: "Initial HTML looked empty, very short, or stuck on a loading state before rendered fallback.",
      evidence: "Initial HTML looked empty, very short, or stuck on a loading state before rendered fallback.",
      why_it_matters: "Heavy client-side rendering can slow down the first impression and complicate indexing or previews.",
      suggested_fix: "Review performance, above-the-fold loading, and whether key content can render sooner.",
      urgency: "Medium",
      category: "Speed",
      weight: 8,
    }));
  }

  if (signals.genericPhrases.length > 0) {
    issues.push(makeIssue({
      key: "generic_wording",
      issue: "Generic or outdated wording",
      detail: `Found generic wording: ${signals.genericPhrases.join(", ")}.`,
      evidence: `Found generic wording: ${signals.genericPhrases.join(", ")}.`,
      why_it_matters: "Generic copy makes the business sound interchangeable and weakens the outreach angle.",
      suggested_fix: "Replace generic phrases with specific services, outcomes, locations, and customer proof.",
      urgency: "Low",
      category: "Conversion",
      weight: 8,
    }));
  }

  return issues;
}

export function looksLikeCorporateOrLargeBrand(signals: WebsiteSignals): boolean {
  return signals.corporateSignals.length >= 2;
}

export function scoreWebsiteOpportunity(
  issues: WebsiteIssue[],
  builder: BuilderDetection,
): number {
  return buildScoreBreakdown(issues, builder, emptySignalsForScoring()).overall_score;
}

export function buildScoreBreakdown(
  issues: WebsiteIssue[],
  builder: BuilderDetection,
  signals: WebsiteSignals,
): ScoreBreakdown {
  const overall = scoreFromIssues(issues, builder);
  const scoreFor = (category: IssueCategory, base = 25): number =>
    clamp(base + issues.filter((issue) => issue.category === category).reduce((sum, issue) => sum + issue.weight * 5, 0));
  const contactScore = clamp(
    20 +
      (signals.hasPhone ? 0 : 28) +
      (signals.hasEmail ? 0 : 18) +
      (signals.hasBookingOrContactButton ? 0 : 32),
  );
  const leadFitScore = clamp(
    85 -
      (signals.corporateSignals.length >= 2 ? 55 : 0) -
      (signals.wordCount < 20 ? 35 : 0) -
      (builder.builder === "unknown" ? 5 : 0),
  );
  const priority = getPriority(overall);
  const topReasons = issues
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((issue) => issue.issue);

  return {
    overall_score: overall,
    cta_score: scoreFor("CTA", 20),
    seo_score: scoreFor("SEO", 20),
    contact_visibility_score: contactScore,
    design_ux_score: scoreFor("UX", 20),
    conversion_score: scoreFor("Conversion", 25),
    trust_signal_score: scoreFor("Trust", 20),
    lead_fit_score: leadFitScore,
    score_summary:
      topReasons.length > 0
        ? `${priority} redesign opportunity driven by ${topReasons.join(", ")}.`
        : "Low redesign opportunity based on the visible homepage signals.",
    top_3_reasons_for_score: topReasons,
    priority_level: priority,
  };
}

function makeIssue(input: {
  key: string;
  issue: string;
  detail: string;
  evidence: string;
  why_it_matters: string;
  suggested_fix: string;
  urgency: IssueUrgency;
  category: IssueCategory;
  weight: number;
}): WebsiteIssue {
  return {
    ...input,
    label: input.issue,
  };
}

function scoreFromIssues(issues: WebsiteIssue[], builder: BuilderDetection): number {
  if (issues.length === 0) {
    return 1;
  }

  const issueScore = issues.reduce((total, issue) => total + issue.weight, 0);
  const issueVolumeBonus = issues.length >= 5 ? 14 : issues.length >= 3 ? 8 : 0;
  const score = issueScore + builderOpportunityScore[builder.builder] + issueVolumeBonus;

  return clamp(score);
}

function clamp(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function getPriority(score: number): PriorityLevel {
  if (score >= 70) {
    return "High";
  }

  if (score >= 40) {
    return "Medium";
  }

  return "Low";
}

function emptySignalsForScoring(): WebsiteSignals {
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

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeText(decodeHtml(match?.[1] ?? ""));
}

function extractMetaDescription(html: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    const name = getAttribute(tag, "name").toLowerCase();
    const property = getAttribute(tag, "property").toLowerCase();

    if (name === "description" || property === "og:description") {
      return normalizeText(decodeHtml(getAttribute(tag, "content")));
    }
  }

  return "";
}

function extractVisibleText(html: string): string {
  return normalizeText(
    decodeHtml(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
        .replace(/<[^>]+>/g, " "),
    ),
  );
}

function hasVisiblePhone(text: string): boolean {
  return /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/.test(text);
}

function hasVisibleEmail(text: string): boolean {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
}

function hasBookingOrContactButton(html: string): boolean {
  const linkOrButtonPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const matches = html.matchAll(linkOrButtonPattern);

  for (const match of matches) {
    const attrs = decodeHtml(match[2] ?? "").toLowerCase();
    const label = extractVisibleText(match[3] ?? "").toLowerCase();
    const combined = `${attrs} ${label}`;

    if (attrs.includes("href=\"tel:") || attrs.includes("href='tel:")) {
      return true;
    }

    if (attrs.includes("href=\"mailto:") || attrs.includes("href='mailto:")) {
      return true;
    }

    if (ctaPhrases.some((phrase) => combined.includes(phrase))) {
      return true;
    }
  }

  return false;
}

function extractNavigationLabels(html: string, visibleText: string): string[] {
  const labels = new Set<string>();
  const linkOrButtonPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const matches = html.matchAll(linkOrButtonPattern);

  for (const match of matches) {
    const label = extractVisibleText(match[3] ?? "").toLowerCase();
    const attrs = decodeHtml(match[2] ?? "").toLowerCase();
    const combined = `${attrs} ${label}`;

    for (const phrase of navigationPhrases) {
      if (combined.includes(phrase)) {
        labels.add(phrase);
      }
    }
  }

  if (labels.size === 0) {
    const lowerText = visibleText.toLowerCase();

    for (const phrase of navigationPhrases) {
      if (lowerText.includes(phrase)) {
        labels.add(phrase);
      }
    }
  }

  return Array.from(labels);
}

function findOldCopyrightYear(html: string): number | null {
  const currentYear = new Date().getFullYear();
  const matches = html.match(/(?:copyright|&copy;|©)[\s\S]{0,160}?(?:19|20)\d{2}|(?:19|20)\d{2}[\s\S]{0,160}?(?:copyright|&copy;|©)/gi) ?? [];
  const years = matches
    .flatMap((text) => text.match(/(?:19|20)\d{2}/g) ?? [])
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year) && year <= currentYear);

  if (years.length === 0) {
    return null;
  }

  const latestYear = Math.max(...years);
  return latestYear <= currentYear - 2 ? latestYear : null;
}

function isWeakTitle(title: string): boolean {
  const lowerTitle = title.toLowerCase();

  return (
    title.length < 12 ||
    lowerTitle === "home" ||
    lowerTitle === "homepage" ||
    lowerTitle.includes("untitled") ||
    lowerTitle.includes("welcome")
  );
}

function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
}

function getAttribute(tag: string, name: string): string {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted?.[1]) {
    return quoted[1];
  }

  const unquoted = tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, "i"));
  return unquoted?.[1] ?? "";
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

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
