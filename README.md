# Web Design Outreach Analyzer

A Node.js + TypeScript sales intelligence dashboard for reviewing public business websites, finding design and conversion issues, creating respectful outreach copy, and exporting CRM-ready records.

This is not a CRM matcher. Any valid public website URL you provide is analyzed first, saved, and displayed. Qualification happens after analysis, and `qualified=false` results stay visible for review.

The tool does not send emails, does not connect directly to a CRM, and does not bypass captchas, logins, paywalls, blocked pages, robots restrictions, rate limits, or security systems. If a page is blocked or unavailable, it is saved as `fetch_failed`, `blocked`, or `needs_manual_review`.

## Setup

```bash
cd web-design-outreach
npm install
cp .env.example .env
```

Add your OpenAI API key to `.env` if you want AI-generated analysis:

```bash
OPENAI_API_KEY=your_api_key_here
OPENAI_MODEL=gpt-4o-mini
```

The analyzer still runs without an OpenAI key and writes fallback local analysis.

For JavaScript-rendered pages and screenshots, install the Playwright browser once:

```bash
npx playwright install chromium
```

## Dashboard Method

Start the browser dashboard:

```bash
npm run preview
```

Open:

```text
http://localhost:3000
```

After building, `npm start` serves the same dashboard from `dist/server.js`.

Use the dashboard to:

- paste a URL into `Analyze Website URL`
- optionally enter business name, industry, location, or email
- click `Analyze Website`
- review screenshots, builder/CMS, scores, issues, outreach emails, status, and notes
- export CSV/JSON or print a client report

The dashboard has separate inputs:

- `Analyze Website URL` runs analysis and saves a new result.
- `Search analyzed results` only filters already analyzed websites.

## CSV Upload From Dashboard

Use the `Bulk CSV Upload` panel in the dashboard.

CSV columns:

```csv
business_name,website_url,industry,location,email
Example Business,https://example-business.test/,Example Industry,Example Location,hello@example-business.test
```

The dashboard analyzes rows one by one and continues if one website fails.

## CLI Method

Analyze one URL:

```bash
npm run dev -- --url https://example-business.test/
```

Analyze one URL with context:

```bash
npm run dev -- --url https://example-business.test/ --business "Example Business" --industry "Example Industry" --location "Example Location"
```

Analyze a CSV:

```bash
npm run dev -- --csv data/leads.csv
```

If no argument is provided, the CLI reads `data/leads.csv`:

```bash
npm run dev
```

If `data/leads.csv` is empty, old results are cleared and the dashboard shows:

```text
No websites analyzed yet. Paste a URL above and click Analyze Website.
```

Optional rate limit override:

```bash
FETCH_DELAY_MS=5000 npm run dev -- --csv data/leads.csv
```

## Vercel Deployment

This project includes `api/index.js` and `vercel.json` so Vercel runs the dashboard through a Node.js Function. Set `OPENAI_API_KEY` and, optionally, `OPENAI_MODEL` in the Vercel project environment variables.

On Vercel, generated results and screenshots are written to `/tmp` because deployment files are not persistent writable storage. That keeps the function from crashing, but data can be lost on cold starts or new deployments. Use a database or Vercel storage product if you need permanent hosted results.

## Output Files

Results are saved to:

```text
data/results.json
data/results.csv
reports/index.html
data/screenshots/
```

The CLI overwrites `data/results.json` and `data/results.csv` on each run so stale sample data does not remain. Dashboard URL analysis appends new reviewed websites.

## Static Report

Regenerate the HTML report:

```bash
npm run report
```

Open `reports/index.html` directly for review-only mode. Use `npm run preview` when you want dashboard actions such as Analyze Website, status saving, notes saving, CSV upload, and export endpoints.

## Scores

Scores are `1` to `100`.

For `overall_score`, `100` means a stronger redesign opportunity and `1` means a weak redesign opportunity.

Score categories:

- `overall_score`
- `cta_score`
- `seo_score`
- `contact_visibility_score`
- `design_ux_score`
- `conversion_score`
- `trust_signal_score`
- `lead_fit_score`

The dashboard also shows `priority_level`, `score_summary`, and the top reasons behind the score.

## Analyzed vs Qualified

`analysis_status` describes what happened while reviewing the public website:

- `analyzed`
- `needs_manual_review`
- `fetch_failed`
- `blocked`
- `invalid_url`

`status` is the manual review workflow:

- `Needs Review`
- `Approved`
- `Rejected`
- `Contacted`
- `Replied`
- `Won`
- `Lost`
- `Needs Manual Review`
- `Not Qualified`

`qualified=true` only when:

- `analysis_status` is `analyzed`
- `overall_score` is `70` or higher
- at least one high or medium urgency issue exists
- the website appears to be a realistic web design outreach prospect

`qualified=false` results are still saved and displayed. Fetch failures, blocked pages, invalid URLs, low-score sites, corporate/large-brand sites, and manual-review cases remain visible.

## What The Analyzer Checks

The analyzer reviews public homepage signals only:

- likely builder/CMS: Wix, Squarespace, GoDaddy, Weebly, Shopify, WordPress, Webflow, Framer, custom, or unknown
- weak or missing CTA
- missing phone/contact visibility
- weak SEO title/meta description
- poor homepage clarity
- very low visible text
- generic or outdated wording
- missing booking/contact path
- missing trust signals
- old copyright year
- heavy JavaScript-rendered homepage signs
- broken or unclear navigation

It also captures desktop and mobile screenshots when Playwright can render the page.

## Outreach Review

Each result includes:

- friendly email
- direct email
- premium email
- recommended email version
- copy score and review
- risks and improvement suggestions

Review every record and email before contacting anyone. The app prepares outreach copy only; it does not send emails.

## Exports

From the dashboard:

- `Export CSV`
- `Export JSON`
- `Copy CRM Row`
- `Print Report`

Exports are ready for manual import into HubSpot, GoHighLevel, Pipedrive, Airtable, or another CRM.

## Commands

```bash
npm run dev
npm run dev -- --url https://example-business.test/
npm run dev -- --csv data/leads.csv
npm run report
npm run preview
npm run build
npm start
```
