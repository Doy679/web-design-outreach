import type {
  BuilderDetection,
  BuilderName,
  IssueCategory,
  IssueUrgency,
  PriorityLevel,
  ScoreBreakdown,
  ScoreConfidence,
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
  "reservation",
  "order now",
  "order online",
  "request service",
  "start project",
  "get started",
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
  "lorem ipsum",
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
  "gallery",
  "before and after",
  "five star",
  "5 star",
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

const navigationPhrases = [
  "home",
  "about",
  "services",
  "products",
  "contact",
  "locations",
  "pricing",
  "book",
  "menu",
  "order",
  "reservations",
  "hours",
  "gallery",
  "reviews",
  "portfolio",
  "faq",
];

const builderOpportunityScore: Record<BuilderName, number> = {
  wix: 8,
  squarespace: 5,
  godaddy: 10,
  weebly: 10,
  wordpress: 4,
  shopify: 2,
  webflow: 2,
  framer: 2,
  custom: 0,
  unknown: 0,
};

export function extractWebsiteSignals(html: string, renderedText = ""): WebsiteSignals {
  const title = extractTitle(html);
  const metaDescription = extractMetaDescription(html);
  const ogSiteName = getMetaContent(html, "property", "og:site_name");
  const ogTitle = getMetaContent(html, "property", "og:title");
  const applicationName = getMetaContent(html, "name", "application-name");
  const visibleText = normalizeText(renderedText) || extractVisibleText(html);
  const lowerText = visibleText.toLowerCase();
  const wordCount = countWords(visibleText);
  const h1Text = extractTagTexts(html, "h1");
  const h2Text = extractTagTexts(html, "h2");
  const linkButtonText = extractLinkButtonText(html);
  const logoAltText = extractLogoAltText(html);
  const phoneNumbers = extractPhoneNumbers(`${visibleText} ${extractAttributeValues(html, "href").join(" ")}`);
  const emails = extractEmails(`${visibleText} ${extractAttributeValues(html, "href").join(" ")}`);
  const foundGenericPhrases = genericPhrases.filter((phrase) => lowerText.includes(phrase));
  const foundCorporateSignals = corporatePhrases.filter((phrase) => lowerText.includes(phrase));
  const navigationLabels = extractNavigationLabels(html, visibleText, linkButtonText);
  const schema = extractJsonLdSummary(html);
  const ctaMatches = linkButtonText.filter((label) => containsAny(label.toLowerCase(), ctaPhrases));
  const likelyIndustry = inferLikelyIndustry(visibleText, title, schema.types);
  const hasMenuServicesProducts = hasAnyNavigation(navigationLabels, ["menu", "services", "products"]) ||
    /\b(menu|services|products|what we offer|our work)\b/i.test(visibleText);

  return {
    title,
    metaDescription,
    ogSiteName,
    ogTitle,
    applicationName,
    wordCount,
    textExcerpt: visibleText.slice(0, 3500),
    h1Text,
    h2Text,
    linkButtonText,
    logoAltText,
    phoneNumbers,
    emails,
    hasClearCta: ctaMatches.length > 0 || containsAny(lowerText, ctaPhrases),
    hasHeroHeadline: h1Text.some((heading) => countWords(heading) >= 2) || countWords(title) >= 3,
    hasCtaAboveFold: containsAny(visibleText.slice(0, 1300).toLowerCase(), ctaPhrases),
    hasPhone: phoneNumbers.length > 0,
    hasEmail: emails.length > 0,
    hasBookingOrContactButton: hasBookingOrContactButton(html, linkButtonText),
    hasContactFormOrPage: hasContactFormOrPage(html, visibleText, navigationLabels),
    hasAddressOrLocation: hasAddressOrLocation(visibleText, html),
    hasMapOrLocationSection: hasMapOrLocationSection(html, visibleText),
    hasMenuServicesProducts,
    hasOnlineOrdering: /\b(order online|order now|online order|toasttab|ubereats|uber eats|doordash|grubhub|delivery.com)\b/i.test(`${visibleText} ${html}`),
    hasReservations: /\b(reservation|reservations|reserve|opentable|resy|book a table)\b/i.test(`${visibleText} ${html}`),
    hasHours: /\b(hours|open daily|open today|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b/i.test(visibleText),
    hasDeliveryPickup: /\b(delivery|pickup|takeout|take out|carryout|curbside)\b/i.test(visibleText),
    hasReviewsOrTestimonials: /\b(review|reviews|testimonial|testimonials|rated|stars?|yelp|tripadvisor|google reviews)\b/i.test(visibleText),
    hasSocialLinks: hasSocialLinks(html),
    hasTrustSignals: trustPhrases.some((phrase) => lowerText.includes(phrase)),
    hasNavigation: navigationLabels.length >= 3,
    hasViewportMeta: /<meta\b[^>]*name=["']viewport["'][^>]*>/i.test(html),
    oldCopyrightYear: findOldCopyrightYear(html),
    weakTitle: isWeakTitle(title),
    weakMetaDescription: metaDescription.length < 50,
    veryThinContent: wordCount < 180,
    unclearNavigation: navigationLabels.length < 3,
    tooManyCtas: new Set(ctaMatches.map((label) => label.toLowerCase())).size > 5,
    brokenOrEmptySections: looksBrokenOrEmpty(visibleText, html),
    scriptCount: countTag(html, "script"),
    imageCount: countTag(html, "img"),
    genericPhrases: foundGenericPhrases,
    corporateSignals: foundCorporateSignals,
    navigationLabels,
    schemaTypes: schema.types,
    schemaNames: schema.names,
    likelyIndustry,
  };
}

export function findWebsiteIssues(
  signals: WebsiteSignals,
  builder: BuilderDetection,
  isJavaScriptRendered = false,
): WebsiteIssue[] {
  const issues: WebsiteIssue[] = [];
  const industry = signals.likelyIndustry;

  if (["wix", "godaddy", "weebly"].includes(builder.builder)) {
    issues.push(makeIssue({
      key: "template_builder",
      issue: "Templated website builder detected",
      detail: `Homepage appears to use ${builder.builder}.`,
      evidence: `${builder.builder} marker found${builder.evidence[0] ? `: ${builder.evidence[0]}` : "."}`,
      why_it_matters: "Hosted builders can work well, but older template implementations often limit differentiation, page speed, and conversion-focused layout.",
      suggested_fix: "Review whether a focused redesign or landing page would better present the offer, proof, and contact path.",
      urgency: "Medium",
      category: "UX",
      weight: 7,
    }));
  }

  if (!signals.hasHeroHeadline) {
    issues.push(makeIssue({
      key: "weak_hero_headline",
      issue: "Hero headline is unclear or missing",
      detail: "The page did not expose a strong H1 or clear headline in the readable content.",
      evidence: signals.h1Text.length > 0 ? `Detected H1 text: ${signals.h1Text.join(" | ")}` : "No clear H1 text was detected.",
      why_it_matters: "The first headline should quickly explain what the business offers and why the visitor should continue.",
      suggested_fix: "Add a concise hero headline that names the service, location, or main customer benefit.",
      urgency: "Medium",
      category: "Content",
      weight: 8,
    }));
  }

  if (!signals.hasClearCta || !signals.hasCtaAboveFold) {
    issues.push(makeIssue({
      key: "missing_cta",
      issue: signals.hasClearCta ? "CTA is not prominent above the fold" : "Missing clear call to action",
      detail: signals.hasClearCta
        ? "CTA wording was found, but not early enough in the visible page text to read as above-the-fold."
        : "No clear CTA phrase such as book, schedule, contact, reserve, order, or get a quote was visible.",
      evidence: signals.linkButtonText.length > 0
        ? `Detected button/link labels include: ${signals.linkButtonText.slice(0, 8).join(", ")}.`
        : "No button or link labels were detected.",
      why_it_matters: "Visitors need an obvious next step; weak CTA placement can reduce calls, bookings, orders, and quote requests.",
      suggested_fix: "Place one primary CTA in the header and hero area, then repeat it near proof and service sections.",
      urgency: "High",
      category: "CTA",
      weight: 13,
    }));
  }

  if (!signals.hasBookingOrContactButton) {
    issues.push(makeIssue({
      key: "missing_contact_button",
      issue: "No obvious booking or contact button",
      detail: "The page did not expose a clear contact, booking, appointment, quote, phone, or email action in links/buttons.",
      evidence: signals.linkButtonText.length > 0
        ? `Visible link/button labels: ${signals.linkButtonText.slice(0, 10).join(", ")}.`
        : "No visible link/button labels were detected.",
      why_it_matters: "A hidden contact path creates friction for visitors who are ready to act.",
      suggested_fix: "Add a visible contact, booking, order, or quote button in the header and hero area.",
      urgency: "High",
      category: "Conversion",
      weight: 12,
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
      evidence: `Title: "${signals.title || "missing"}"; meta description: "${signals.metaDescription || "missing"}".`,
      why_it_matters: "Weak snippets and unclear titles reduce first impressions before a visitor reaches the site.",
      suggested_fix: "Rewrite the title and meta description around the core service, city, and primary conversion action.",
      urgency: "Medium",
      category: "SEO",
      weight: 10,
    }));
  }

  if (!signals.hasPhone) {
    issues.push(makeIssue({
      key: "missing_phone",
      issue: "No phone number visible",
      detail: "No phone number was visible in the public homepage text or phone links.",
      evidence: "No phone number pattern or tel: link was detected.",
      why_it_matters: industry === "restaurant"
        ? "Restaurants often depend on quick calls for questions, reservations, pickup, delivery, and visit planning."
        : "For local and service businesses, phone visibility can directly affect calls and lead volume.",
      suggested_fix: "Add a clickable phone number in the header, footer, and contact section.",
      urgency: "Medium",
      category: "Contact",
      weight: 8,
    }));
  }

  if (!signals.hasEmail && !signals.hasContactFormOrPage) {
    issues.push(makeIssue({
      key: "missing_written_contact",
      issue: "No email or contact form path visible",
      detail: "No email address or clear contact form/page was detected on the homepage.",
      evidence: "No email address, mailto: link, contact form marker, or contact page label was detected.",
      why_it_matters: "Some visitors prefer written contact before calling; missing options can reduce conversion paths.",
      suggested_fix: "Add a simple contact page, contact form, or visible email address with response expectations.",
      urgency: "Medium",
      category: "Contact",
      weight: 8,
    }));
  } else if (!signals.hasEmail) {
    issues.push(makeIssue({
      key: "missing_email",
      issue: "No email address visible",
      detail: "A contact path may exist, but no email address was visible in the homepage text.",
      evidence: "No email address or mailto: link was detected.",
      why_it_matters: "Email is not always required, but it gives cautious visitors a low-pressure contact option.",
      suggested_fix: "Consider adding an email address or contact form response note in the footer/contact section.",
      urgency: "Low",
      category: "Contact",
      weight: 4,
    }));
  }

  if (!signals.hasAddressOrLocation && (industry === "restaurant" || industry === "local_service")) {
    issues.push(makeIssue({
      key: "missing_location",
      issue: "Location or service area is not obvious",
      detail: industry === "restaurant"
        ? "No clear restaurant address or location signal was detected."
        : "No clear service area, city, or location signal was detected.",
      evidence: "No street-address pattern, location section, or service-area wording was found.",
      why_it_matters: "Local visitors need to know whether the business is near them or serves their area.",
      suggested_fix: industry === "restaurant"
        ? "Add the address, neighborhood/city, and a map or directions link near the top and footer."
        : "Add a clear service area, city list, or local coverage statement near the hero and contact section.",
      urgency: "Medium",
      category: "Local",
      weight: 8,
    }));
  }

  if (industry === "restaurant") {
    addRestaurantIssues(issues, signals);
  } else if (industry === "local_service") {
    addServiceBusinessIssues(issues, signals);
  }

  if (signals.veryThinContent) {
    issues.push(makeIssue({
      key: "low_text",
      issue: "Very low amount of readable homepage content",
      detail: `Only about ${signals.wordCount} words of visible text were found.`,
      evidence: `Visible text word count: ${signals.wordCount}.`,
      why_it_matters: "Thin content can make it hard for visitors and search engines to understand services, proof, and next steps.",
      suggested_fix: "Add concise service descriptions, local proof, benefits, FAQs, and a clear conversion path.",
      urgency: signals.wordCount < 80 ? "High" : "Medium",
      category: "Content",
      weight: signals.wordCount < 80 ? 12 : 8,
    }));
  }

  if (!signals.hasReviewsOrTestimonials && !signals.hasTrustSignals) {
    issues.push(makeIssue({
      key: "missing_trust_signals",
      issue: "No obvious trust signals",
      detail: "Homepage text did not show obvious reviews, testimonials, credentials, guarantees, gallery/portfolio proof, or awards.",
      evidence: "No review, testimonial, certification, guarantee, award, portfolio, gallery, or case-study wording was detected.",
      why_it_matters: "Trust proof reduces hesitation and supports higher conversion rates.",
      suggested_fix: "Add reviews, testimonials, certifications, project photos, guarantees, awards, or credibility badges.",
      urgency: "Medium",
      category: "Trust",
      weight: 7,
    }));
  }

  if (signals.unclearNavigation) {
    issues.push(makeIssue({
      key: "unclear_navigation",
      issue: "Navigation is limited or unclear",
      detail: "Homepage did not show a broad set of navigation paths such as services/menu, proof, about, locations, or contact.",
      evidence: signals.navigationLabels.length > 0
        ? `Detected navigation labels: ${signals.navigationLabels.join(", ")}.`
        : "No clear navigation labels were detected.",
      why_it_matters: "Visitors need predictable paths to compare services, verify fit, and contact the business.",
      suggested_fix: "Simplify navigation around the offer, proof, about/location details, and contact action.",
      urgency: "Medium",
      category: "UX",
      weight: 7,
    }));
  }

  if (signals.oldCopyrightYear) {
    issues.push(makeIssue({
      key: "old_copyright",
      issue: "Outdated copyright year",
      detail: `Copyright year appears to be ${signals.oldCopyrightYear}.`,
      evidence: `Footer copyright appears to reference ${signals.oldCopyrightYear}.`,
      why_it_matters: "Outdated details can make visitors question whether the business is active and attentive.",
      suggested_fix: "Update footer details and review the page for other stale content.",
      urgency: "Medium",
      category: "Trust",
      weight: 8,
    }));
  }

  if (!signals.hasViewportMeta) {
    issues.push(makeIssue({
      key: "missing_viewport_meta",
      issue: "Mobile viewport tag is missing",
      detail: "The page HTML did not expose a standard mobile viewport meta tag.",
      evidence: "No meta name=\"viewport\" tag was detected.",
      why_it_matters: "Without a viewport tag, mobile layout and scaling can behave poorly.",
      suggested_fix: "Add a standard responsive viewport meta tag and verify the mobile screenshot.",
      urgency: "High",
      category: "UX",
      weight: 10,
    }));
  }

  if (signals.tooManyCtas) {
    issues.push(makeIssue({
      key: "too_many_ctas",
      issue: "Conversion path may be competing with too many CTAs",
      detail: "Several different CTA labels were detected, which may split attention.",
      evidence: `CTA-like labels include: ${signals.linkButtonText.filter((label) => containsAny(label.toLowerCase(), ctaPhrases)).slice(0, 8).join(", ")}.`,
      why_it_matters: "Too many competing actions can make it harder for visitors to choose the best next step.",
      suggested_fix: "Choose one primary action and one secondary action, then keep labels consistent across the page.",
      urgency: "Low",
      category: "Conversion",
      weight: 4,
    }));
  }

  if (signals.brokenOrEmptySections || signals.genericPhrases.length > 0) {
    issues.push(makeIssue({
      key: "generic_or_empty_content",
      issue: "Generic, placeholder, or broken-looking content detected",
      detail: signals.genericPhrases.length > 0
        ? `Found generic wording: ${signals.genericPhrases.join(", ")}.`
        : "The page text contains signs of placeholder, empty, or broken-looking sections.",
      evidence: signals.genericPhrases.length > 0
        ? `Generic phrases detected: ${signals.genericPhrases.join(", ")}.`
        : "Placeholder or empty-section wording was detected.",
      why_it_matters: "Generic copy makes the business sound interchangeable and weakens trust.",
      suggested_fix: "Replace generic or placeholder copy with specific services, outcomes, locations, and customer proof.",
      urgency: "Low",
      category: "Content",
      weight: 6,
    }));
  }

  if (isJavaScriptRendered) {
    issues.push(makeIssue({
      key: "javascript_rendered",
      issue: "Homepage depends heavily on JavaScript",
      detail: "Initial HTML was limited or script-heavy, so rendered browser content was needed for analysis.",
      evidence: `Detected ${signals.scriptCount} scripts and ${signals.wordCount} rendered words.`,
      why_it_matters: "Heavy client-side rendering can slow first impressions and complicate search previews if content appears late.",
      suggested_fix: "Review performance, above-the-fold loading, and whether key text/CTA content can render sooner.",
      urgency: "Medium",
      category: "Speed",
      weight: signals.wordCount < 300 ? 8 : 5,
    }));
  }

  if (signals.scriptCount >= 35 || signals.imageCount >= 45) {
    issues.push(makeIssue({
      key: "load_perception_risk",
      issue: "Page may feel heavy to load",
      detail: `Detected ${signals.scriptCount} scripts and ${signals.imageCount} images in the rendered page HTML.`,
      evidence: `${signals.scriptCount} script tags and ${signals.imageCount} image tags were found.`,
      why_it_matters: "Large script/image volume can hurt perceived speed, especially on mobile connections.",
      suggested_fix: "Review image optimization, lazy loading, unused scripts, and above-the-fold performance.",
      urgency: "Low",
      category: "Speed",
      weight: 4,
    }));
  }

  if (issues.length < 3) {
    issues.push(makeIssue({
      key: "manual_review_note",
      issue: "Limited automatic issues detected",
      detail: "Only limited issues were detected automatically. Review screenshots before outreach.",
      evidence: signals.wordCount > 0
        ? `The analyzer read about ${signals.wordCount} words and ${signals.navigationLabels.length} navigation labels.`
        : "The analyzer could not read enough public page text for a confident automated review.",
      why_it_matters: "A client-safe outreach process should avoid overstating issues when the automatic review has limited evidence.",
      suggested_fix: "Use the desktop and mobile screenshots to confirm visual fit, design quality, and conversion friction before contacting the business.",
      urgency: "Low",
      category: "UX",
      weight: 2,
    }));
  }

  return dedupeIssues(issues).slice(0, 12);
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
  const confidence = getScoreConfidence(signals);
  const ctaQuality = scoreCtaQuality(signals, issues);
  const seoQuality = scoreSeoQuality(signals, issues);
  const contactQuality = scoreContactQuality(signals, issues);
  const uxQuality = scoreUxQuality(signals, issues);
  const conversionQuality = scoreConversionQuality(signals, issues);
  const trustQuality = scoreTrustQuality(signals, issues);
  const leadFitScore = scoreLeadFit(signals, builder);
  const averageQuality = Math.round(
    (ctaQuality + seoQuality + contactQuality + uxQuality + conversionQuality + trustQuality) / 6,
  );
  const issueWeight = issues.reduce((total, issue) => total + issue.weight, 0);
  const issueVolumeBonus = issues.length >= 7 ? 10 : issues.length >= 4 ? 6 : issues.length >= 2 ? 3 : 0;
  const contentUncertainty = confidence === "low" ? 12 : confidence === "medium" ? 5 : 0;
  const opportunity = clamp(
    Math.round((100 - averageQuality) * 0.72) +
      Math.round(issueWeight * 0.55) +
      builderOpportunityScore[builder.builder] +
      issueVolumeBonus +
      contentUncertainty,
  );
  const qualityPenalty = confidence === "low" ? 10 : 0;
  const websiteQualityScore = clamp(averageQuality - Math.round(issueWeight * 0.12) - qualityPenalty);
  const priority = getPriority(opportunity);
  const topReasons = issues
    .filter((issue) => issue.key !== "manual_review_note")
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((issue) => issue.issue);
  const confidenceText = confidence === "low" ? "low-confidence" : `${confidence}-confidence`;

  return {
    overall_score: opportunity,
    website_quality_score: websiteQualityScore,
    score_confidence: confidence,
    cta_score: ctaQuality,
    seo_score: seoQuality,
    contact_visibility_score: contactQuality,
    design_ux_score: uxQuality,
    conversion_score: conversionQuality,
    trust_signal_score: trustQuality,
    lead_fit_score: leadFitScore,
    score_summary:
      topReasons.length > 0
        ? `${priority} redesign opportunity (${confidenceText}) driven by ${topReasons.join(", ")}. Website quality score is ${websiteQualityScore}.`
        : `Low redesign opportunity (${confidenceText}) based on the visible public homepage signals. Website quality score is ${websiteQualityScore}.`,
    top_3_reasons_for_score: topReasons,
    priority_level: priority,
  };
}

function addRestaurantIssues(issues: WebsiteIssue[], signals: WebsiteSignals): void {
  if (!signals.hasMenuServicesProducts) {
    issues.push(makeIssue({
      key: "missing_menu",
      issue: "Menu path is not obvious",
      detail: "No clear menu link or menu section was detected.",
      evidence: `Navigation labels: ${signals.navigationLabels.join(", ") || "none detected"}.`,
      why_it_matters: "Restaurant visitors often check the menu before deciding to call, order, reserve, or visit.",
      suggested_fix: "Add a prominent menu link in the header and a visible menu preview on the homepage.",
      urgency: "High",
      category: "Conversion",
      weight: 11,
    }));
  }

  if (!signals.hasOnlineOrdering && !signals.hasReservations && !signals.hasPhone) {
    issues.push(makeIssue({
      key: "missing_restaurant_action",
      issue: "Ordering, reservation, or call path is unclear",
      detail: "No online ordering, reservation, or visible phone path was detected.",
      evidence: "No order/reservation phrasing or phone number was found.",
      why_it_matters: "Restaurants can lose calls, orders, reservations, and first-time visits when the next step is not obvious.",
      suggested_fix: "Add one primary restaurant CTA: Order Online, Reserve a Table, or Call Now.",
      urgency: "High",
      category: "CTA",
      weight: 13,
    }));
  }

  if (!signals.hasHours) {
    issues.push(makeIssue({
      key: "missing_hours",
      issue: "Hours are not easy to find",
      detail: "No clear opening-hours wording was detected in the visible homepage text.",
      evidence: "No day-of-week or hours section wording was found.",
      why_it_matters: "Restaurant visitors often need hours before deciding to visit, reserve, or order.",
      suggested_fix: "Show current hours near the location/contact block and keep them consistent with Google Business Profile.",
      urgency: "Medium",
      category: "Local",
      weight: 7,
    }));
  }

  if (!signals.hasDeliveryPickup && !signals.hasOnlineOrdering) {
    issues.push(makeIssue({
      key: "missing_delivery_pickup",
      issue: "Delivery or pickup options are not clear",
      detail: "No delivery, pickup, takeout, or ordering partner path was detected.",
      evidence: "No delivery, pickup, takeout, DoorDash, Uber Eats, Grubhub, or online ordering wording was found.",
      why_it_matters: "Clear pickup/delivery options reduce friction for customers who are ready to order.",
      suggested_fix: "Add pickup/delivery options and link the preferred ordering path from the hero area.",
      urgency: "Low",
      category: "Conversion",
      weight: 5,
    }));
  }
}

function addServiceBusinessIssues(issues: WebsiteIssue[], signals: WebsiteSignals): void {
  if (!signals.hasMenuServicesProducts) {
    issues.push(makeIssue({
      key: "missing_services",
      issue: "Services are not easy to scan",
      detail: "No clear services/products section or navigation path was detected.",
      evidence: `Navigation labels: ${signals.navigationLabels.join(", ") || "none detected"}.`,
      why_it_matters: "Service buyers need to quickly confirm the business handles their specific need.",
      suggested_fix: "Add a services section with 4-8 clear service cards and a contact/quote CTA.",
      urgency: "High",
      category: "Content",
      weight: 11,
    }));
  }

  if (!/\b(quote|estimate|consultation|request service|book service|schedule service)\b/i.test(signals.textExcerpt)) {
    issues.push(makeIssue({
      key: "missing_quote_path",
      issue: "Quote or consultation path is not clear",
      detail: "No quote, estimate, consultation, or request-service action was detected.",
      evidence: "No quote/estimate/consultation wording was found in readable text.",
      why_it_matters: "Contractors and service businesses depend on clear inquiry paths for project leads.",
      suggested_fix: "Add a Request Estimate, Schedule Service, or Free Consultation CTA near the top of the page.",
      urgency: "High",
      category: "CTA",
      weight: 12,
    }));
  }

  if (!signals.hasReviewsOrTestimonials && !signals.hasTrustSignals) {
    issues.push(makeIssue({
      key: "missing_service_proof",
      issue: "Service proof is limited",
      detail: "No testimonials, reviews, portfolio, gallery, certification, or guarantee signal was detected.",
      evidence: "No testimonial/review/gallery/license/insured/certified wording was found.",
      why_it_matters: "Service buyers often compare trust and proof before calling or requesting a quote.",
      suggested_fix: "Add testimonials, project photos, certifications, and service-area proof near the CTA.",
      urgency: "Medium",
      category: "Trust",
      weight: 8,
    }));
  }
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

function dedupeIssues(issues: WebsiteIssue[]): WebsiteIssue[] {
  const seen = new Set<string>();
  const deduped: WebsiteIssue[] = [];

  for (const issue of issues) {
    if (seen.has(issue.key)) continue;
    seen.add(issue.key);
    deduped.push(issue);
  }

  return deduped;
}

function scoreCtaQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    88 -
      (signals.hasClearCta ? 0 : 30) -
      (signals.hasCtaAboveFold ? 0 : 18) -
      (signals.hasBookingOrContactButton ? 0 : 18) -
      (signals.tooManyCtas ? 8 : 0) -
      issuePenalty(issues, "CTA", 2.2),
  );
}

function scoreSeoQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    88 -
      (signals.weakTitle ? 24 : 0) -
      (signals.weakMetaDescription ? 20 : 0) -
      (signals.veryThinContent ? 12 : 0) -
      issuePenalty(issues, "SEO", 2.2),
  );
}

function scoreContactQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    90 -
      (signals.hasPhone ? 0 : 20) -
      (signals.hasEmail ? 0 : 8) -
      (signals.hasContactFormOrPage ? 0 : 16) -
      (signals.hasAddressOrLocation ? 0 : 8) -
      issuePenalty(issues, "Contact", 2),
  );
}

function scoreUxQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    88 -
      (signals.hasHeroHeadline ? 0 : 18) -
      (signals.hasNavigation ? 0 : 16) -
      (signals.hasViewportMeta ? 0 : 18) -
      (signals.brokenOrEmptySections ? 18 : 0) -
      (signals.veryThinContent ? 10 : 0) -
      issuePenalty(issues, "UX", 1.8),
  );
}

function scoreConversionQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    88 -
      (signals.hasBookingOrContactButton ? 0 : 20) -
      (signals.hasMenuServicesProducts ? 0 : 12) -
      (signals.hasClearCta ? 0 : 18) -
      (signals.tooManyCtas ? 8 : 0) -
      issuePenalty(issues, "Conversion", 1.8),
  );
}

function scoreTrustQuality(signals: WebsiteSignals, issues: WebsiteIssue[]): number {
  return clampQuality(
    84 -
      (signals.hasTrustSignals || signals.hasReviewsOrTestimonials ? 0 : 20) -
      (signals.hasSocialLinks ? 0 : 4) -
      (signals.oldCopyrightYear ? 14 : 0) -
      issuePenalty(issues, "Trust", 2),
  );
}

function scoreLeadFit(signals: WebsiteSignals, builder: BuilderDetection): number {
  return clampQuality(
    86 -
      (signals.corporateSignals.length >= 2 ? 55 : 0) -
      (signals.wordCount < 40 ? 24 : 0) -
      (signals.likelyIndustry === "unknown" ? 5 : 0) -
      (builder.builder === "unknown" ? 3 : 0),
  );
}

function issuePenalty(issues: WebsiteIssue[], category: IssueCategory, factor: number): number {
  return Math.round(issues.filter((issue) => issue.category === category).reduce((sum, issue) => sum + issue.weight, 0) * factor);
}

function getScoreConfidence(signals: WebsiteSignals): ScoreConfidence {
  if (signals.wordCount >= 300 && signals.hasHeroHeadline && signals.navigationLabels.length >= 3) return "high";
  if (signals.wordCount >= 100 || signals.h1Text.length > 0 || signals.linkButtonText.length >= 3) return "medium";
  return "low";
}

function getPriority(score: number): PriorityLevel {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function emptySignalsForScoring(): WebsiteSignals {
  return {
    title: "",
    metaDescription: "",
    ogSiteName: "",
    ogTitle: "",
    applicationName: "",
    wordCount: 0,
    textExcerpt: "",
    h1Text: [],
    h2Text: [],
    linkButtonText: [],
    logoAltText: [],
    phoneNumbers: [],
    emails: [],
    hasClearCta: false,
    hasHeroHeadline: false,
    hasCtaAboveFold: false,
    hasPhone: false,
    hasEmail: false,
    hasBookingOrContactButton: false,
    hasContactFormOrPage: false,
    hasAddressOrLocation: false,
    hasMapOrLocationSection: false,
    hasMenuServicesProducts: false,
    hasOnlineOrdering: false,
    hasReservations: false,
    hasHours: false,
    hasDeliveryPickup: false,
    hasReviewsOrTestimonials: false,
    hasSocialLinks: false,
    hasTrustSignals: false,
    hasNavigation: false,
    hasViewportMeta: false,
    oldCopyrightYear: null,
    weakTitle: true,
    weakMetaDescription: true,
    veryThinContent: true,
    unclearNavigation: true,
    tooManyCtas: false,
    brokenOrEmptySections: false,
    scriptCount: 0,
    imageCount: 0,
    genericPhrases: [],
    corporateSignals: [],
    navigationLabels: [],
    schemaTypes: [],
    schemaNames: [],
    likelyIndustry: "unknown",
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

function getMetaContent(html: string, attr: "name" | "property", target: string): string {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of metaTags) {
    if (getAttribute(tag, attr).toLowerCase() === target.toLowerCase()) {
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

function extractTagTexts(html: string, tagName: string): string[] {
  return Array.from(html.matchAll(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi")))
    .map((match) => extractVisibleText(match[1] ?? ""))
    .filter((text) => text.length > 0)
    .slice(0, 12);
}

function extractLinkButtonText(html: string): string[] {
  const labels = new Set<string>();
  const linkOrButtonPattern = /<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi;

  for (const match of html.matchAll(linkOrButtonPattern)) {
    const label = extractVisibleText(match[3] ?? "");
    const aria = normalizeText(decodeHtml(getAttribute(match[2] ?? "", "aria-label")));
    const title = normalizeText(decodeHtml(getAttribute(match[2] ?? "", "title")));
    const combined = label || aria || title;

    if (combined && combined.length <= 80) {
      labels.add(combined);
    }
  }

  return Array.from(labels).slice(0, 80);
}

function extractLogoAltText(html: string): string[] {
  const values = new Set<string>();

  for (const image of html.match(/<img\b[^>]*>/gi) ?? []) {
    const combined = `${getAttribute(image, "class")} ${getAttribute(image, "id")} ${getAttribute(image, "src")}`.toLowerCase();
    const alt = normalizeText(decodeHtml(getAttribute(image, "alt")));

    if (alt && (combined.includes("logo") || alt.toLowerCase().includes("logo"))) {
      values.add(alt.replace(/\blogo\b/gi, "").trim());
    }
  }

  return Array.from(values).filter(Boolean).slice(0, 8);
}

function extractAttributeValues(html: string, attr: string): string[] {
  return Array.from(html.matchAll(new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, "gi"))).map((match) => decodeHtml(match[1] ?? ""));
}

function extractPhoneNumbers(text: string): string[] {
  const values = new Set<string>();
  const phoneMatches = text.match(/(?:tel:\s*)?(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g) ?? [];

  for (const phone of phoneMatches) {
    values.add(phone.replace(/^tel:\s*/i, "").trim());
  }

  return Array.from(values).slice(0, 8);
}

function extractEmails(text: string): string[] {
  const values = new Set<string>();
  const emailMatches = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];

  for (const email of emailMatches) {
    values.add(email.replace(/^mailto:/i, "").trim());
  }

  return Array.from(values).slice(0, 8);
}

function hasBookingOrContactButton(html: string, linkButtonText: string[]): boolean {
  const hrefs = extractAttributeValues(html, "href").join(" ").toLowerCase();
  const labels = linkButtonText.join(" ").toLowerCase();

  return hrefs.includes("tel:") || hrefs.includes("mailto:") || containsAny(`${hrefs} ${labels}`, ctaPhrases);
}

function hasContactFormOrPage(html: string, visibleText: string, navigationLabels: string[]): boolean {
  const combined = `${html} ${visibleText}`.toLowerCase();
  return (
    navigationLabels.includes("contact") ||
    /href=["'][^"']*contact/i.test(html) ||
    /<(form)\b/i.test(html) ||
    /\b(contact form|send message|message us|get in touch|contact us)\b/i.test(combined)
  );
}

function hasAddressOrLocation(text: string, html: string): boolean {
  return (
    /\b\d{1,6}\s+[a-z0-9.' -]+\s+(street|st\.?|avenue|ave\.?|road|rd\.?|boulevard|blvd\.?|drive|dr\.?|lane|ln\.?|way|court|ct\.?)\b/i.test(text) ||
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text) ||
    /\b(address|located in|visit us|service area|serving|directions)\b/i.test(text) ||
    /"address"\s*:/i.test(html)
  );
}

function hasMapOrLocationSection(html: string, text: string): boolean {
  return /google\.com\/maps|maps\.google|mapbox|iframe[^>]+map|directions|view map/i.test(`${html} ${text}`);
}

function hasSocialLinks(html: string): boolean {
  return /\b(facebook\.com|instagram\.com|linkedin\.com|yelp\.com|tripadvisor\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com)\b/i.test(html);
}

function extractNavigationLabels(html: string, visibleText: string, linkButtonText: string[]): string[] {
  const labels = new Set<string>();
  const combined = `${extractAttributeValues(html, "href").join(" ")} ${linkButtonText.join(" ")} ${visibleText.slice(0, 1800)}`.toLowerCase();

  for (const phrase of navigationPhrases) {
    if (combined.includes(phrase)) {
      labels.add(phrase);
    }
  }

  return Array.from(labels);
}

function extractJsonLdSummary(html: string): { types: string[]; names: string[] } {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const types = new Set<string>();
  const names = new Set<string>();

  for (const script of scripts) {
    const content = script.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    const parsed = safeJsonParse(content);

    for (const item of flattenJsonLd(parsed)) {
      const type = getJsonString(item["@type"]);
      const name = getJsonString(item.name);
      if (type) types.add(type);
      if (name) names.add(name);
    }
  }

  return { types: Array.from(types), names: Array.from(names) };
}

function inferLikelyIndustry(text: string, title: string, schemaTypes: string[]): string {
  const combined = `${text} ${title} ${schemaTypes.join(" ")}`.toLowerCase();

  if (/\b(restaurant|pizza|pizzeria|cafe|bar|grill|bistro|bakery|menu|reservations?|order online|takeout|delivery)\b/.test(combined)) {
    return "restaurant";
  }

  if (/\b(dentist|dental|clinic|doctor|patient|appointment|chiropractor|medical|therapy)\b/.test(combined)) {
    return "clinic";
  }

  if (/\b(contractor|roofing|plumbing|hvac|electrician|landscaping|remodeling|construction|repair|estimate|service area)\b/.test(combined)) {
    return "local_service";
  }

  if (/\b(salon|spa|hair|nails|massage|appointment|book online)\b/.test(combined)) {
    return "salon";
  }

  if (/\b(lawyer|attorney|law firm|legal|consultation)\b/.test(combined)) {
    return "law";
  }

  if (/\b(real estate|realtor|broker|listings|property)\b/.test(combined)) {
    return "real_estate";
  }

  if (schemaTypes.some((type) => /localbusiness|professionalservice|homeservice/i.test(type))) {
    return "local_service";
  }

  return "unknown";
}

function looksBrokenOrEmpty(visibleText: string, html: string): boolean {
  const combined = `${visibleText} ${html}`.toLowerCase();
  const placeholderCount = [
    "coming soon",
    "under construction",
    "lorem ipsum",
    "add your text",
    "insert text",
    "no content",
    "empty section",
  ].filter((phrase) => combined.includes(phrase)).length;

  return placeholderCount > 0;
}

function findOldCopyrightYear(html: string): number | null {
  const currentYear = new Date().getFullYear();
  const matches = html.match(/(?:copyright|&copy;|©)[\s\S]{0,160}?(?:19|20)\d{2}|(?:19|20)\d{2}[\s\S]{0,160}?(?:copyright|&copy;|©)/gi) ?? [];
  const years = matches
    .flatMap((text) => text.match(/(?:19|20)\d{2}/g) ?? [])
    .map((year) => Number(year))
    .filter((year) => Number.isInteger(year) && year <= currentYear);

  if (years.length === 0) return null;

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

function hasAnyNavigation(labels: string[], targets: string[]): boolean {
  return targets.some((target) => labels.includes(target));
}

function containsAny(value: string, phrases: string[]): boolean {
  return phrases.some((phrase) => value.includes(phrase));
}

function countTag(html: string, tagName: string): number {
  return html.match(new RegExp(`<${tagName}\\b`, "gi"))?.length ?? 0;
}

function countWords(text: string): number {
  return text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g)?.length ?? 0;
}

function flattenJsonLd(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record, ...flattenJsonLd(record["@graph"])];
  }
  return [];
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getJsonString(value: unknown): string {
  if (typeof value === "string") return normalizeText(value);
  if (Array.isArray(value)) return value.map(getJsonString).filter(Boolean).join(", ");
  return "";
}

function getAttribute(tag: string, name: string): string {
  const quoted = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  if (quoted?.[1]) return quoted[1];

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

function clamp(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function clampQuality(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)));
}
