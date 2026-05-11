export type BuilderName =
  | "wix"
  | "squarespace"
  | "godaddy"
  | "weebly"
  | "wordpress"
  | "shopify"
  | "webflow"
  | "framer"
  | "custom"
  | "unknown";

export type BuilderConfidence = "high" | "medium" | "low";

export type WebsiteStatus =
  | "analyzed"
  | "needs_manual_review"
  | "fetch_failed"
  | "blocked"
  | "invalid_url";

export type ReviewStatus =
  | "Needs Review"
  | "Approved"
  | "Rejected"
  | "Contacted"
  | "Replied"
  | "Won"
  | "Lost"
  | "Needs Manual Review"
  | "Not Qualified";

export type IssueUrgency = "Low" | "Medium" | "High";

export type IssueCategory = "CTA" | "SEO" | "Contact" | "UX" | "Trust" | "Speed" | "Conversion" | "Content" | "Local";

export type PriorityLevel = "Low" | "Medium" | "High";
export type ScoreConfidence = "high" | "medium" | "low";

export interface LeadRecord {
  business_name: string;
  website_url: string;
  industry: string;
  location: string;
  email: string;
}

export interface BuilderDetection {
  builder: BuilderName;
  confidence: BuilderConfidence;
  evidence: string[];
}

export interface BusinessIdentity {
  name: string;
  confidence: BuilderConfidence;
  source: string;
  industry: string;
  location: string;
}

export interface WebsiteSignals {
  title: string;
  metaDescription: string;
  ogSiteName: string;
  ogTitle: string;
  applicationName: string;
  wordCount: number;
  textExcerpt: string;
  h1Text: string[];
  h2Text: string[];
  linkButtonText: string[];
  logoAltText: string[];
  phoneNumbers: string[];
  emails: string[];
  hasClearCta: boolean;
  hasHeroHeadline: boolean;
  hasCtaAboveFold: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasBookingOrContactButton: boolean;
  hasContactFormOrPage: boolean;
  hasAddressOrLocation: boolean;
  hasMapOrLocationSection: boolean;
  hasMenuServicesProducts: boolean;
  hasOnlineOrdering: boolean;
  hasReservations: boolean;
  hasHours: boolean;
  hasDeliveryPickup: boolean;
  hasReviewsOrTestimonials: boolean;
  hasSocialLinks: boolean;
  hasTrustSignals: boolean;
  hasNavigation: boolean;
  hasViewportMeta: boolean;
  oldCopyrightYear: number | null;
  weakTitle: boolean;
  weakMetaDescription: boolean;
  veryThinContent: boolean;
  unclearNavigation: boolean;
  tooManyCtas: boolean;
  brokenOrEmptySections: boolean;
  scriptCount: number;
  imageCount: number;
  genericPhrases: string[];
  corporateSignals: string[];
  navigationLabels: string[];
  schemaTypes: string[];
  schemaNames: string[];
  likelyIndustry: string;
}

export interface WebsiteIssue {
  key: string;
  label: string;
  detail: string;
  evidence: string;
  weight: number;
  issue: string;
  why_it_matters: string;
  suggested_fix: string;
  urgency: IssueUrgency;
  category: IssueCategory;
}

export interface ScoreBreakdown {
  overall_score: number;
  website_quality_score: number;
  score_confidence: ScoreConfidence;
  cta_score: number;
  seo_score: number;
  contact_visibility_score: number;
  design_ux_score: number;
  conversion_score: number;
  trust_signal_score: number;
  lead_fit_score: number;
  score_summary: string;
  top_3_reasons_for_score: string[];
  priority_level: PriorityLevel;
}

export interface ScreenshotCapture {
  desktop_screenshot_path: string;
  mobile_screenshot_path: string;
  error?: string;
}

export interface WebsiteScanResult {
  lead: LeadRecord;
  normalizedUrl: string;
  finalUrl: string;
  status: WebsiteStatus;
  success: boolean;
  error?: string;
  statusCode?: number;
  isJavaScriptRendered: boolean;
  renderNote?: string;
  builder: BuilderDetection;
  businessIdentity: BusinessIdentity;
  signals: WebsiteSignals;
  issues: WebsiteIssue[];
  websiteScore: number;
  scoreBreakdown: ScoreBreakdown;
  screenshots: ScreenshotCapture;
}

export interface AiCrmFields {
  business_name: string;
  website_url: string;
  industry: string;
  detected_builder: string;
  builder_confidence: string;
  business_name_confidence: string;
  business_name_source: string;
  is_javascript_rendered: boolean;
  overall_score: number;
  website_quality_score: number;
  score_confidence: ScoreConfidence;
  cta_score: number;
  seo_score: number;
  contact_visibility_score: number;
  design_ux_score: number;
  conversion_score: number;
  trust_signal_score: number;
  lead_fit_score: number;
  priority_level: PriorityLevel;
  main_issue: string;
  issues: WebsiteIssue[];
  score_summary: string;
  top_3_reasons_for_score: string[];
  business_impact: string;
  personalized_hook: string;
  recommended_offer: string;
  friendly_email: string;
  direct_email: string;
  premium_email: string;
  recommended_email_version: "friendly" | "direct" | "premium";
  outreach_copy_review: string;
  copy_score: number;
  email_reviews: Record<string, EmailCopyReview>;
  copy_improvements: string[];
  crm_stage: string;
  qualified: boolean;
  qualification_reason: string;
}

export interface EmailCopyReview {
  copy_score: number;
  strengths: string[];
  risks: string[];
  improvement_suggestions: string[];
  best_version_recommendation: string;
}

export interface OutreachResult extends LeadRecord {
  status: ReviewStatus;
  analysis_status: WebsiteStatus;
  detected_builder: string;
  builder_confidence: string;
  business_name_confidence: string;
  business_name_source: string;
  is_javascript_rendered: boolean;
  website_score: number;
  overall_score: number;
  website_quality_score: number;
  score_confidence: ScoreConfidence;
  cta_score: number;
  seo_score: number;
  contact_visibility_score: number;
  design_ux_score: number;
  conversion_score: number;
  trust_signal_score: number;
  lead_fit_score: number;
  priority_level: PriorityLevel;
  main_issue: string;
  issues: WebsiteIssue[];
  secondary_issues: string[];
  score_summary: string;
  top_3_reasons_for_score: string[];
  business_impact: string;
  personalized_hook: string;
  recommended_offer: string;
  friendly_email: string;
  direct_email: string;
  premium_email: string;
  recommended_email_version: "friendly" | "direct" | "premium";
  cold_email_subject: string;
  cold_email_body: string;
  outreach_copy_review: string;
  copy_score: number;
  email_reviews: Record<string, EmailCopyReview>;
  copy_improvements: string[];
  qualified: boolean;
  qualification_reason: string;
  crm_stage: string;
  notes: string;
  desktop_screenshot_path: string;
  mobile_screenshot_path: string;
  analysis_date: string;
  opt_out_status: string;
}
