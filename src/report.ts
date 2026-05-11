import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getReportOutputPath } from "./runtimePaths.js";
import { defaultJsonOutputPath, getResultId, readResultsFile, reviewStatuses } from "./workflow.js";
import type { EmailCopyReview, OutreachResult, WebsiteIssue } from "./types.js";

interface DashboardStats {
  total: number;
  qualified: number;
  needsReview: number;
  notQualifiedButAnalyzed: number;
  fetchFailed: number;
  optedOut: number;
  averageScore: string;
}

const defaultInputPath = defaultJsonOutputPath;
const defaultOutputPath = getReportOutputPath();

export async function generateHtmlReport(
  inputPath = defaultInputPath,
  outputPath = defaultOutputPath,
): Promise<void> {
  const absoluteOutputPath = path.resolve(outputPath);
  const html = await renderHtmlReport(inputPath);

  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, html, "utf8");

  console.log(`Saved HTML report to ${path.relative(process.cwd(), absoluteOutputPath)}`);
  console.log("Open reports/index.html in your browser to review the outreach dashboard.");
}

export async function renderHtmlReport(inputPath = defaultInputPath): Promise<string> {
  const results = await readResultsFile(inputPath);
  const stats = buildStats(results);

  return buildHtml(results, stats);
}

function buildStats(results: OutreachResult[]): DashboardStats {
  const scored = results.filter((result) => Number.isFinite(result.overall_score) && result.overall_score > 0);

  return {
    total: results.length,
    qualified: results.filter((result) => result.qualified).length,
    needsReview: results.filter((result) => result.status === "Needs Review").length,
    notQualifiedButAnalyzed: results.filter((result) => result.analysis_status === "analyzed" && !result.qualified).length,
    fetchFailed: results.filter((result) => result.analysis_status === "fetch_failed").length,
    optedOut: results.filter((result) => isOptedOut(result.opt_out_status)).length,
    averageScore:
      scored.length > 0
        ? String(Math.round(scored.reduce((total, result) => total + result.overall_score, 0) / scored.length))
        : "N/A",
  };
}

function buildHtml(results: OutreachResult[], stats: DashboardStats): string {
  const generatedAt = new Date().toLocaleString();
  const cards = results.length > 0 ? results.map(renderResultCard).join("\n") : renderEmptyState();
  const statusOptions = reviewStatuses
    .map((status) => `<option value="${escapeAttribute(status)}">${escapeHtml(status)}</option>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Web Design Outreach Analyzer</title>
  <style>
    :root {
      --bg: #f5f7fb;
      --surface: #ffffff;
      --surface-soft: #f8fafc;
      --text: #162033;
      --muted: #64748b;
      --border: #dbe4ee;
      --border-strong: #b9c6d8;
      --accent: #2563eb;
      --accent-soft: #dbeafe;
      --red: #dc2626;
      --red-soft: #fee2e2;
      --amber: #b45309;
      --amber-soft: #fef3c7;
      --green: #15803d;
      --green-soft: #dcfce7;
      --shadow: 0 18px 48px rgba(22, 32, 51, 0.08);
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.5;
    }

    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }

    .shell {
      width: min(1240px, calc(100% - 32px));
      margin: 0 auto;
      padding: 34px 0 54px;
    }

    .topbar {
      display: grid;
      gap: 8px;
      margin-bottom: 20px;
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 4vw, 3rem);
      line-height: 1.05;
      letter-spacing: 0;
    }

    .subtitle {
      margin: 0;
      max-width: 760px;
      color: var(--muted);
      font-size: 1.03rem;
    }

    .generated {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(6, minmax(126px, 1fr));
      gap: 12px;
      margin: 22px 0;
    }

    .stat,
    .panel,
    .result-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }

    .stat {
      padding: 14px;
      min-height: 96px;
    }

    .stat span {
      display: block;
      color: var(--muted);
      font-size: 0.74rem;
      font-weight: 800;
      line-height: 1.25;
      text-transform: uppercase;
    }

    .stat strong {
      display: block;
      margin-top: 8px;
      font-size: 1.8rem;
      line-height: 1;
    }

    .panel {
      padding: 16px;
      margin: 16px 0;
    }

    .panel-title {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 12px;
    }

    .panel-title h2 {
      margin: 0;
      font-size: 1rem;
    }

    .panel-title p {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .analyze-grid {
      display: grid;
      grid-template-columns: minmax(240px, 1.4fr) repeat(4, minmax(120px, 1fr)) auto;
      gap: 10px;
      align-items: end;
    }

    .filter-grid {
      display: grid;
      grid-template-columns: minmax(240px, 1fr) 190px 180px auto;
      gap: 10px;
      align-items: end;
    }

    .export-row,
    .upload-row,
    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 800;
    }

    input,
    select,
    textarea,
    button {
      width: 100%;
      min-height: 42px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 9px 11px;
      color: var(--text);
      background: var(--surface);
      font: inherit;
    }

    textarea {
      min-height: 94px;
      resize: vertical;
    }

    button,
    .export-link {
      display: inline-flex;
      justify-content: center;
      align-items: center;
      width: auto;
      min-height: 40px;
      border: 1px solid var(--accent);
      border-radius: 8px;
      padding: 9px 14px;
      background: var(--accent);
      color: #ffffff;
      cursor: pointer;
      font-weight: 800;
      text-decoration: none;
      white-space: nowrap;
    }

    button.secondary,
    .export-link.secondary {
      border-color: var(--border);
      background: var(--surface-soft);
      color: var(--text);
    }

    button.danger {
      border-color: var(--red);
      background: var(--red-soft);
      color: var(--red);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.72;
    }

    .status-message {
      min-height: 22px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 0.93rem;
    }

    .status-message.error { color: var(--red); font-weight: 800; }
    .status-message.success { color: var(--green); font-weight: 800; }

    .results {
      display: grid;
      gap: 16px;
      margin-top: 18px;
    }

    .result-card {
      padding: 18px;
      border-left: 6px solid var(--accent);
    }

    .result-card[data-priority="high"] { border-left-color: var(--red); }
    .result-card[data-priority="medium"] { border-left-color: var(--amber); }
    .result-card[data-priority="low"] { border-left-color: var(--green); }

    .card-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
      margin-bottom: 14px;
    }

    .business h2 {
      margin: 0 0 6px;
      font-size: 1.3rem;
      line-height: 1.2;
      letter-spacing: 0;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .badges {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      min-width: 260px;
    }

    .remove-message {
      min-height: 28px;
      color: var(--muted);
      font-size: 0.82rem;
      font-weight: 800;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      border-radius: 999px;
      padding: 4px 10px;
      background: var(--accent-soft);
      color: #1d4ed8;
      font-size: 0.74rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .badge.high { background: var(--red-soft); color: var(--red); }
    .badge.medium { background: var(--amber-soft); color: var(--amber); }
    .badge.low { background: var(--green-soft); color: var(--green); }

    .section-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    details {
      background: var(--surface-soft);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
    }

    details[open] summary { margin-bottom: 10px; }

    summary {
      cursor: pointer;
      font-weight: 900;
      color: var(--text);
    }

    .facts,
    .scores {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }

    .fact,
    .score-box,
    .issue-card,
    .email-box,
    .screenshot-box {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
    }

    .fact span,
    .score-box span {
      display: block;
      color: var(--muted);
      font-size: 0.72rem;
      font-weight: 900;
      text-transform: uppercase;
    }

    .fact strong,
    .score-box strong {
      display: block;
      margin-top: 4px;
      overflow-wrap: anywhere;
    }

    .score-box strong {
      font-size: 1.35rem;
    }

    .score-summary,
    .plain-text {
      margin: 10px 0 0;
      color: var(--text);
    }

    .reason-list,
    .compact-list {
      margin: 8px 0 0;
      padding-left: 18px;
    }

    .issue-stack,
    .email-stack,
    .screenshot-grid {
      display: grid;
      gap: 10px;
    }

    .issue-card h3,
    .email-box h3 {
      margin: 0 0 6px;
      font-size: 0.96rem;
    }

    .issue-card p,
    .email-box p {
      margin: 5px 0;
    }

    .issue-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 8px;
    }

    .email-body {
      margin: 8px 0 10px;
      white-space: pre-wrap;
    }

    .recommended {
      border-color: #93c5fd;
      box-shadow: 0 0 0 2px var(--accent-soft);
    }

    .screenshot-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .screenshot-card {
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }

    .screenshot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--border);
    }

    .screenshot-header h3 {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 800;
      color: var(--muted);
    }

    .preview-container {
      position: relative;
      background: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 20px;
      overflow: hidden;
    }

    .desktop-preview-frame {
      width: 100%;
      max-width: 640px;
      height: 360px;
      background: #fff;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.1);
      overflow: hidden;
    }

    .mobile-preview-frame {
      width: 220px;
      height: 460px;
      background: #fff;
      border: 8px solid #111827;
      border-radius: 32px;
      box-shadow: 0 15px 35px rgba(0,0,0,0.15);
      overflow: hidden;
      position: relative;
    }

    .preview-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }

    .view-btn-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0.2);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 10px;
      opacity: 0;
      transition: opacity 0.2s;
      cursor: pointer;
    }

    .preview-container:hover .view-btn-overlay {
      opacity: 1;
    }

    /* Modal Styles */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.95);
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 1000;
      padding: 20px;
      visibility: hidden;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .modal-backdrop.active {
      visibility: visible;
      opacity: 1;
    }

    .modal-content {
      background: var(--surface);
      width: 96vw;
      height: 92vh;
      max-width: 1400px;
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .modal-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-tabs {
      display: flex;
      gap: 8px;
      padding: 12px 24px;
      background: var(--surface-soft);
      border-bottom: 1px solid var(--border);
    }

    .tab-btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 700;
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      width: auto;
      min-height: auto;
    }

    .tab-btn.active {
      background: var(--accent);
      color: #fff;
    }

    .viewer-body-preview {
      height: calc(92vh - 120px);
      overflow: hidden;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #f8fafc;
      padding: 20px;
    }

    .viewer-image-preview {
      display: block;
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: top center;
      margin: 0 auto;
      box-shadow: 0 10px 30px rgba(0,0,0,0.1);
    }

    .viewer-body-fullpage {
      height: calc(92vh - 120px);
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      background: #f8fafc;
      padding: 40px;
    }

    .viewer-image-fullpage {
      display: block;
      width: 100%;
      max-width: 1200px;
      height: auto;
      object-fit: contain;
      object-position: top center;
      margin: 0 auto;
      box-shadow: 0 20px 50px rgba(0,0,0,0.1);
    }

    .mobile-frame {
      width: 390px;
      max-width: 90vw;
      height: min(844px, calc(92vh - 140px));
      overflow: hidden;
      border-radius: 28px;
      border: 8px solid #111827;
      background: #111827;
      margin: 0 auto;
    }

    .mobile-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }

    .mobile-frame-scroll {
      width: 390px;
      max-width: 90vw;
      height: calc(92vh - 140px);
      overflow-y: auto;
      overflow-x: hidden;
      border-radius: 28px;
      border: 8px solid #111827;
      background: #111827;
      margin: 0 auto;
    }

    .mobile-frame-scroll img {
      width: 100%;
      height: auto;
      display: block;
    }

    .close-modal {
      background: transparent;
      border: none;
      color: var(--muted);
      font-size: 1.5rem;
      cursor: pointer;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .modal-footer {
      padding: 12px 24px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 16px;
      justify-content: flex-end;
    }

    .footer-link {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--accent);
    }

    .screenshot-title h3 {
      margin: 0;
      font-size: 0.96rem;
    }

    .screenshot-title a {
      font-size: 0.82rem;
      font-weight: 800;
      white-space: nowrap;
    }

    .unavailable {
      display: grid;
      place-items: center;
      min-height: 180px;
      color: var(--muted);
      background: #eef2f7;
      border-radius: 6px;
      text-align: center;
      padding: 18px;
    }

    .edit-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin-top: 10px;
    }

    .edit-grid label {
      display: grid;
      gap: 6px;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 800;
    }

    .edit-grid .full-width {
      grid-column: 1 / -1;
    }

    .edit-grid input[type="checkbox"] {
      width: auto;
      min-height: auto;
      margin-right: 8px;
    }

    .edit-grid .checkbox-label {
      display: flex;
      align-items: center;
      flex-direction: row;
      cursor: pointer;
    }

    .save-message {
      grid-column: 1 / -1;
      min-height: 20px;
      color: var(--muted);
      font-size: 0.88rem;
    }

    .empty {
      padding: 32px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--muted);
      text-align: center;
    }

    @media (max-width: 1100px) {
      .stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .analyze-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }

    @media (max-width: 820px) {
      .stats,
      .section-grid,
      .filter-grid,
      .facts,
      .scores,
      .screenshot-grid,
      .notes-grid {
        grid-template-columns: 1fr;
      }

      .card-head {
        grid-template-columns: 1fr;
      }

      .badges {
        justify-content: flex-start;
        min-width: 0;
      }
    }

    @media (max-width: 560px) {
      .shell {
        width: min(100% - 22px, 1240px);
        padding-top: 24px;
      }

      .analyze-grid {
        grid-template-columns: 1fr;
      }

      .panel,
      .result-card,
      .stat {
        padding: 12px;
      }
    }

    @media print {
      .analyze-panel,
      .filter-panel,
      .export-panel,
      .button-row,
      .notes-grid button,
      .status-message,
      .save-message {
        display: none !important;
      }

      body { background: #ffffff; }
      .shell { width: 100%; padding: 0; }
      .result-card, .panel, .stat { box-shadow: none; break-inside: avoid; }
      details { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <h1>Web Design Outreach Analyzer</h1>
      <p class="subtitle">Website opportunity scoring, visual review, and outreach copy preparation.</p>
      <div class="generated">Generated ${escapeHtml(generatedAt)}</div>
    </header>

    <section class="stats" aria-label="Dashboard stats">
      ${renderStat("Total Websites Analyzed", stats.total)}
      ${renderStat("Qualified Outreach Prospects", stats.qualified)}
      ${renderStat("Needs Review", stats.needsReview)}
      ${renderStat("Not Qualified But Analyzed", stats.notQualifiedButAnalyzed)}
      ${renderStat("Fetch Failed", stats.fetchFailed)}
      ${renderStat("Average Opportunity Score", stats.averageScore)}
    </section>

    <section class="panel analyze-panel" aria-label="Analyze website">
      <div class="panel-title">
        <div>
          <h2>Analyze Website URL</h2>
          <p>Paste one public website URL. The result is saved and shown below.</p>
        </div>
      </div>
      <div class="analyze-grid">
        <label>
          Analyze Website URL
          <input id="analyzeUrlInput" type="url" placeholder="Paste a website URL to analyze">
        </label>
        <label>
          Business
          <input id="businessInput" type="text" placeholder="Optional">
        </label>
        <label>
          Industry
          <input id="industryInput" type="text" placeholder="Optional">
        </label>
        <label>
          Location
          <input id="locationInput" type="text" placeholder="Optional">
        </label>
        <label>
          Email
          <input id="emailInput" type="email" placeholder="Optional">
        </label>
        <button id="analyzeButton" type="button">Analyze Website</button>
      </div>
      <div class="status-message" id="analyzeStatus" role="status" aria-live="polite"></div>
    </section>

    <section class="panel upload-panel" aria-label="Upload CSV">
      <div class="panel-title">
        <div>
          <h2>Bulk CSV Upload</h2>
          <p>CSV columns: business_name, website_url, industry, location, email.</p>
        </div>
      </div>
      <div class="upload-row">
        <input id="csvUploadInput" type="file" accept=".csv,text/csv">
        <button id="csvUploadButton" type="button" class="secondary">Analyze CSV</button>
      </div>
      <div class="status-message" id="uploadStatus" role="status" aria-live="polite"></div>
    </section>

    <section class="panel export-panel" aria-label="Exports">
      <div class="panel-title">
        <div>
          <h2>Exports</h2>
          <p>Download CRM-ready files or print the current client review report.</p>
        </div>
      </div>
      <div class="export-row">
        <a class="export-link" href="/api/export/csv">Export CSV</a>
        <a class="export-link secondary" href="/api/export/json">Export JSON</a>
        <button id="printReportButton" type="button" class="secondary">Print Report</button>
      </div>
    </section>

    <section class="panel filter-panel" aria-label="Filters">
      <div class="filter-grid">
        <label>
          Search analyzed results
          <input id="searchInput" type="search" placeholder="Search analyzed websites">
        </label>
        <label>
          Status
          <select id="statusFilter">
            <option value="">All statuses</option>
            ${statusOptions}
          </select>
        </label>
        <label>
          Priority
          <select id="priorityFilter">
            <option value="">All priorities</option>
            <option value="high">High priority</option>
            <option value="medium">Medium priority</option>
            <option value="low">Low priority</option>
          </select>
        </label>
        <button id="clearFiltersButton" type="button" class="secondary">Clear Filters</button>
      </div>
    </section>

    <section class="results" id="resultsGrid" aria-live="polite">
      ${cards}
    </section>

    <datalist id="offerSuggestions">
      <option value="Full redesign">
      <option value="Mobile-first redesign">
      <option value="Landing page">
      <option value="Booking/contact flow improvement">
      <option value="SEO cleanup">
      <option value="Speed + conversion fix">
    </datalist>

    <div class="status-message" id="dashboardMessage" role="status" aria-live="polite"></div>
    <div class="empty" id="noMatches" hidden>No websites match the current filters. Clear filters to see all analyzed websites.</div>
  </main>

  <div class="modal-backdrop" id="screenshotModal">
    <div class="modal-content">
      <div class="modal-header">
        <h2 id="modalTitle">Screenshot Viewer</h2>
        <button type="button" class="close-modal" id="closeModal">&times;</button>
      </div>
      <div class="modal-tabs" id="modalTabs"></div>
      <div class="viewer-container" id="viewerContainer"></div>
      <div class="modal-footer">
        <a href="#" target="_blank" class="footer-link" id="viewRawLink">Open in New Tab</a>
        <a href="#" download class="footer-link" id="downloadLink">Download</a>
      </div>
    </div>
  </div>

  <script>
    const analyzeUrlInput = document.querySelector("#analyzeUrlInput");
    const businessInput = document.querySelector("#businessInput");
    const industryInput = document.querySelector("#industryInput");
    const locationInput = document.querySelector("#locationInput");
    const emailInput = document.querySelector("#emailInput");
    const analyzeButton = document.querySelector("#analyzeButton");
    const analyzeStatus = document.querySelector("#analyzeStatus");
    const csvUploadInput = document.querySelector("#csvUploadInput");
    const csvUploadButton = document.querySelector("#csvUploadButton");
    const uploadStatus = document.querySelector("#uploadStatus");
    const searchInput = document.querySelector("#searchInput");
    const statusFilter = document.querySelector("#statusFilter");
    const priorityFilter = document.querySelector("#priorityFilter");
    const clearFiltersButton = document.querySelector("#clearFiltersButton");
    const printReportButton = document.querySelector("#printReportButton");
    const resultsGrid = document.querySelector("#resultsGrid");
    const dashboardMessage = document.querySelector("#dashboardMessage");
    let cards = Array.from(document.querySelectorAll(".result-card"));
    const noMatches = document.querySelector("#noMatches");
    const analysisSteps = [
      "Fetching website",
      "Rendering page",
      "Capturing screenshots",
      "Detecting website signals",
      "Scoring opportunity",
      "Writing outreach copy",
      "Saving result"
    ];

    function setStatus(element, message, type = "") {
      element.textContent = message;
      element.className = type ? "status-message " + type : "status-message";
    }

    function isFullHttpUrl(value) {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }

    function startStepTicker(element, prefix = "Analyzing website") {
      let index = 0;
      setStatus(element, prefix + "... " + analysisSteps[index]);
      return window.setInterval(() => {
        index = Math.min(index + 1, analysisSteps.length - 1);
        setStatus(element, prefix + "... " + analysisSteps[index]);
      }, 1400);
    }

    async function postAnalyze(payload) {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Analysis failed. Please try again.");
      }

      return data;
    }

    async function analyzeWebsiteFromDashboard() {
      const websiteUrl = analyzeUrlInput.value.trim();

      if (!isFullHttpUrl(websiteUrl)) {
        setStatus(analyzeStatus, "Invalid URL. Please enter a full URL starting with http:// or https://", "error");
        return;
      }

      analyzeButton.disabled = true;
      const ticker = startStepTicker(analyzeStatus);

      try {
        await postAnalyze({
          website_url: websiteUrl,
          business_name: businessInput.value.trim(),
          industry: industryInput.value.trim(),
          location: locationInput.value.trim(),
          email: emailInput.value.trim(),
        });
        window.clearInterval(ticker);
        setStatus(analyzeStatus, "Analysis saved. Refreshing dashboard...", "success");
        window.location.reload();
      } catch (error) {
        window.clearInterval(ticker);
        setStatus(analyzeStatus, error.message || "Analysis failed. Make sure npm run preview is running, then try again.", "error");
      } finally {
        analyzeButton.disabled = false;
      }
    }

    async function analyzeUploadedCsv() {
      const file = csvUploadInput.files && csvUploadInput.files[0];

      if (!file) {
        setStatus(uploadStatus, "Choose a CSV file first.", "error");
        return;
      }

      const text = await file.text();
      const rows = parseCsv(text).filter((row) => isFullHttpUrl((row.website_url || "").trim()));

      if (rows.length === 0) {
        setStatus(uploadStatus, "No valid website rows found. URLs must start with http:// or https://", "error");
        return;
      }

      csvUploadButton.disabled = true;

      try {
        for (let index = 0; index < rows.length; index += 1) {
          const row = rows[index];
          setStatus(uploadStatus, "Analyzing " + (index + 1) + " of " + rows.length + ": " + row.website_url);
          await postAnalyze(row);
        }

        setStatus(uploadStatus, "CSV analysis saved. Refreshing dashboard...", "success");
        window.location.reload();
      } catch (error) {
        setStatus(uploadStatus, error.message || "CSV analysis failed.", "error");
      } finally {
        csvUploadButton.disabled = false;
      }
    }

    function parseCsv(text) {
      const lines = text.split(/\\r?\\n/).filter((line) => line.trim());
      if (lines.length < 2) return [];
      const headers = splitCsvLine(lines[0]).map((header) => header.trim());
      return lines.slice(1).map((line) => {
        const values = splitCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = (values[index] || "").trim();
        });
        return row;
      });
    }

    function splitCsvLine(line) {
      const values = [];
      let current = "";
      let quoted = false;

      for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && quoted && next === '"') {
          current += '"';
          index += 1;
        } else if (char === '"') {
          quoted = !quoted;
        } else if (char === "," && !quoted) {
          values.push(current);
          current = "";
        } else {
          current += char;
        }
      }

      values.push(current);
      return values;
    }

    function applyFilters() {
      const query = searchInput.value.trim().toLowerCase();
      const status = statusFilter.value.toLowerCase();
      const priority = priorityFilter.value;
      let visibleCount = 0;

      for (const card of cards) {
        const matchesSearch = !query || card.dataset.search.includes(query);
        const matchesStatus = !status || card.dataset.status === status;
        const matchesPriority = !priority || card.dataset.priority === priority;
        const shouldShow = matchesSearch && matchesStatus && matchesPriority;
        card.hidden = !shouldShow;

        if (shouldShow) visibleCount += 1;
      }

      noMatches.hidden = cards.length === 0 || visibleCount !== 0;
    }

    function clearFilters() {
      searchInput.value = "";
      statusFilter.value = "";
      priorityFilter.value = "";
      applyFilters();
    }

    async function removeCardResult(card) {
      if (!window.confirm("Remove this website from results?")) {
        return;
      }

      const removeButton = card.querySelector(".remove-result");
      const removeMessage = card.querySelector(".remove-message");
      if (removeButton) removeButton.disabled = true;
      if (removeMessage) removeMessage.textContent = "Removing...";
      setStatus(dashboardMessage, "");

      try {
        const response = await fetch("/api/results/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: card.dataset.id }),
        });
        const data = await response.json();

        if (!response.ok || !data.success || !data.removed) {
          throw new Error(data.error || "Unable to remove website.");
        }

        card.remove();
        cards = cards.filter((item) => item !== card);

        if (cards.length === 0) {
          resultsGrid.innerHTML = '<div class="empty">No websites analyzed yet. Paste a URL above and click Analyze Website.</div>';
        }

        setStatus(dashboardMessage, "Website removed", "success");
        applyFilters();
      } catch (error) {
        if (removeButton) removeButton.disabled = false;
        if (removeMessage) removeMessage.textContent = error.message || "Unable to remove website.";
        setStatus(dashboardMessage, error.message || "Unable to remove website.", "error");
      }
    }

    async function saveCardChanges(card) {
      const saveMessage = card.querySelector(".save-message");
      const id = card.dataset.id;
      
      const updates = {
        business_name: card.querySelector(".edit-business-name").value.trim(),
        industry: card.querySelector(".edit-industry").value.trim(),
        location: card.querySelector(".edit-location").value.trim(),
        email: card.querySelector(".edit-email").value.trim(),
        status: card.querySelector(".edit-status").value,
        crm_stage: card.querySelector(".edit-crm-stage").value.trim(),
        qualified: card.querySelector(".edit-qualified").checked,
        opt_out_status: card.querySelector(".edit-opt-out-status").value.trim(),
        main_issue: card.querySelector(".edit-main-issue").value.trim(),
        recommended_offer: card.querySelector(".edit-recommended-offer").value.trim(),
        cold_email_subject: card.querySelector(".edit-cold-email-subject").value.trim(),
        notes: card.querySelector(".edit-notes").value.trim(),
        cold_email_body: card.querySelector(".edit-cold-email-body").value.trim(),
        friendly_email: card.querySelector(".edit-friendly-email").value.trim(),
        direct_email: card.querySelector(".edit-direct-email").value.trim(),
        premium_email: card.querySelector(".edit-premium-email").value.trim(),
      };

      saveMessage.textContent = "Saving changes...";

      try {
        const response = await fetch("/api/results/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, ...updates }),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Unable to save changes.");
        }

        saveMessage.textContent = "Changes saved";
        
        // Update dashboard state (simple approach: reload or surgical DOM update)
        // For a demo, surgical DOM update of labels/badges is better
        card.dataset.status = updates.status.toLowerCase();
        const statusBadge = card.querySelector(".status-badge");
        if (statusBadge) statusBadge.textContent = updates.status;
        
        const qBadge = card.querySelector(".badge[class*='qualified']");
        if (qBadge) {
          qBadge.textContent = updates.qualified ? "Qualified" : "Not Qualified";
          qBadge.className = "badge " + (updates.qualified ? "low" : "medium");
        }

        const h2 = card.querySelector("h2");
        if (h2) h2.textContent = updates.business_name || "Unknown Website";

        // Update search text
        const searchText = [
          updates.business_name,
          card.querySelector("a[href]")?.href || "",
          updates.industry,
          updates.location,
          updates.status,
          updates.main_issue,
        ].join(" ").toLowerCase();
        card.dataset.search = searchText;

        setTimeout(() => {
          saveMessage.textContent = "";
          card.querySelector("details:has(.edit-grid)").open = false;
        }, 1500);

      } catch (error) {
        saveMessage.textContent = error.message || "Unable to save changes.";
      }
    }

    function cancelCardEdit(card) {
      card.querySelector("details:has(.edit-grid)").open = false;
      card.querySelector(".save-message").textContent = "";
    }

    let currentModalData = null;

    function openScreenshotModal(trigger) {
      const { type, preview, full, business } = trigger.dataset;
      currentModalData = { type, preview, full, business };
      
      const modal = document.getElementById("screenshotModal");
      const title = document.getElementById("modalTitle");
      const tabs = document.getElementById("modalTabs");
      
      title.textContent = business + " - " + (type.charAt(0).toUpperCase() + type.slice(1)) + " Screenshot";
      
      tabs.innerHTML = '<button type="button" class="tab-btn active" data-view="preview">Preview (Above Fold)</button>' +
                       '<button type="button" class="tab-btn" data-view="full">Full Page</button>';
      
      renderModalView("preview");
      modal.classList.add("active");
      document.body.style.overflow = "hidden";
    }

    function renderModalView(view) {
      const container = document.getElementById("viewerContainer");
      const viewRawLink = document.getElementById("viewRawLink");
      const downloadLink = document.getElementById("downloadLink");
      const { type, preview, full } = currentModalData;
      
      const src = view === "preview" ? preview : full;
      const isMobile = type === "mobile";
      
      if (view === "preview") {
        container.className = "viewer-body-preview";
        if (isMobile) {
          container.innerHTML = '<div class="mobile-frame"><img src="' + src + '" alt="Mobile Preview"></div>';
        } else {
          container.innerHTML = '<img src="' + src + '" class="viewer-image-preview" alt="Desktop Preview">';
        }
      } else {
        container.className = "viewer-body-fullpage";
        if (isMobile) {
          container.innerHTML = '<div class="mobile-frame-scroll"><img src="' + src + '" alt="Mobile Full Page"></div>';
        } else {
          container.innerHTML = '<img src="' + src + '" class="viewer-image-fullpage" alt="Desktop Full Page">';
        }
        container.scrollTop = 0;
      }
      
      viewRawLink.href = src;
      downloadLink.href = src;
      downloadLink.download = src.split("/").pop();
      
      document.querySelectorAll("#modalTabs .tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.view === view);
      });
    }

    async function handleRecapture(button) {
      const { id, url } = button.dataset;
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = "↺...";
      
      try {
        const response = await fetch("/api/screenshots/recapture", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, website_url: url }),
        });
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          throw new Error(data.error || "Recapture failed.");
        }
        
        setStatus(dashboardMessage, "Screenshots updated. Refreshing...", "success");
        setTimeout(() => window.location.reload(), 1000);
      } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        setStatus(dashboardMessage, error.message, "error");
      }
    }

    function closeModal() {
      const modal = document.getElementById("screenshotModal");
      modal.classList.remove("active");
      document.body.style.overflow = "";
      currentModalData = null;
    }

    async function copyText(text, button) {
      try {
        await navigator.clipboard.writeText(text);
        const original = button.textContent;
        button.textContent = "Copied!";
        window.setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        window.prompt("Copy this text:", text);
      }
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;

      if (button.matches("#analyzeButton")) {
        analyzeWebsiteFromDashboard();
      } else if (button.matches("#csvUploadButton")) {
        analyzeUploadedCsv();
      } else if (button.matches("#clearFiltersButton")) {
        clearFilters();
      } else if (button.matches("#printReportButton")) {
        window.print();
      } else if (button.matches(".save-changes")) {
        saveCardChanges(button.closest(".result-card"));
      } else if (button.matches(".cancel-edit")) {
        cancelCardEdit(button.closest(".result-card"));
      } else if (button.closest(".open-modal-trigger")) {
        openScreenshotModal(button.closest(".open-modal-trigger"));
      } else if (button.matches("#closeModal") || button.matches("#screenshotModal")) {
        closeModal();
      } else if (button.closest("#modalTabs") && button.matches(".tab-btn")) {
        renderModalView(button.dataset.view);
      } else if (button.matches(".recapture-btn")) {
        handleRecapture(button);
      } else if (button.matches(".remove-result")) {
        removeCardResult(button.closest(".result-card"));
      } else if (button.matches(".copy-email")) {
        const target = document.getElementById(button.dataset.copyTarget);
        copyText(target ? target.textContent.trim() : "", button);
      } else if (button.matches(".copy-crm")) {
        copyText(button.dataset.crm || "", button);
      }
    });

    analyzeUrlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        analyzeWebsiteFromDashboard();
      }
    });
    searchInput.addEventListener("input", applyFilters);
    statusFilter.addEventListener("change", applyFilters);
    priorityFilter.addEventListener("change", applyFilters);
  </script>
</body>
</html>`;
}

function renderStat(label: string, value: string | number): string {
  return `<article class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></article>`;
}

function renderResultCard(result: OutreachResult): string {
  const id = getResultId(result);
  const priorityClass = result.priority_level.toLowerCase();
  const websiteLink = result.website_url
    ? `<a href="${escapeAttribute(result.website_url)}" target="_blank" rel="noreferrer">${escapeHtml(result.website_url)}</a>`
    : "No URL recorded";
  const searchText = [
    result.business_name,
    result.website_url,
    result.industry,
    result.location,
    result.status,
    result.analysis_status,
    result.priority_level,
    result.detected_builder,
    result.main_issue,
    result.issues.map((issue) => issue.issue).join(" "),
  ].join(" ").toLowerCase();
  const crmRow = buildCrmRow(result);

  return `<article class="result-card" data-id="${escapeAttribute(id)}" data-search="${escapeAttribute(searchText)}" data-status="${escapeAttribute(result.status.toLowerCase())}" data-priority="${escapeAttribute(priorityClass)}">
  <div class="card-head">
    <div class="business">
      <h2>${escapeHtml(result.business_name || "Unknown Website")}</h2>
      <div class="meta">
        <span>${websiteLink}</span>
        <span>${escapeHtml(result.industry || "Industry not specified")}</span>
        <span>${escapeHtml(result.location || "Location not specified")}</span>
        <span>Name confidence: ${escapeHtml(result.business_name_confidence || "low")}</span>
        <span>Name source: ${escapeHtml(result.business_name_source || "unknown")}</span>
      </div>
    </div>
    <div class="badges">
      <span class="badge ${escapeAttribute(priorityClass)}">${escapeHtml(result.priority_level)} Priority</span>
      <span class="badge status-badge">${escapeHtml(result.status)}</span>
      <span class="badge">${escapeHtml(formatLabel(result.analysis_status))}</span>
      <span class="badge ${result.qualified ? "low" : "medium"}">${result.qualified ? "Qualified" : "Not Qualified"}</span>
      <button type="button" class="danger remove-result">Remove</button>
      <span class="remove-message" aria-live="polite"></span>
    </div>
  </div>

  <div class="section-grid">
    <details open>
      <summary>Overview</summary>
      <div class="facts">
        ${renderFact("Website", stripProtocol(result.website_url))}
        ${renderFact("Business Name", result.business_name || "Unknown Website")}
        ${renderFact("Name Confidence", result.business_name_confidence || "low")}
        ${renderFact("Name Source", result.business_name_source || "unknown")}
        ${renderFact("Builder/CMS", `${result.detected_builder} (${result.builder_confidence})`)}
        ${renderFact("Industry", result.industry || "Not specified")}
        ${renderFact("Location", result.location || "Not specified")}
        ${renderFact("CRM Stage", result.crm_stage)}
        ${renderFact("Opt-out", result.opt_out_status)}
        ${renderFact("JavaScript Rendered", result.is_javascript_rendered ? "Yes" : "No")}
        ${renderFact("Analyzed", result.analysis_date || "Not available")}
      </div>
      <p class="plain-text"><strong>Main issue:</strong> ${escapeHtml(result.main_issue)}</p>
      <p class="plain-text"><strong>Qualification:</strong> ${escapeHtml(result.qualification_reason)}</p>
      <p class="plain-text"><strong>Business impact:</strong> ${escapeHtml(result.business_impact || "No impact summary recorded.")}</p>
    </details>

    <details open>
      <summary>Scores</summary>
      <div class="scores">
        ${renderScore("Redesign Opportunity", result.overall_score)}
        ${renderScore("Website Quality", result.website_quality_score)}
        ${renderScore("Score Confidence", result.score_confidence)}
        ${renderScore("CTA", result.cta_score)}
        ${renderScore("SEO", result.seo_score)}
        ${renderScore("Contact Visibility", result.contact_visibility_score)}
        ${renderScore("Design/UX", result.design_ux_score)}
        ${renderScore("Conversion", result.conversion_score)}
        ${renderScore("Trust Signals", result.trust_signal_score)}
        ${renderScore("Lead Fit", result.lead_fit_score)}
      </div>
      <p class="score-summary">${escapeHtml(result.score_summary)}</p>
      ${renderStringList(result.top_3_reasons_for_score, "reason-list")}
    </details>

    <details open>
      <summary>Issues</summary>
      <div class="issue-stack">
        ${renderIssues(result.issues)}
      </div>
    </details>

    <details open>
      <summary>Screenshots</summary>
      <div class="screenshot-grid">
        ${renderScreenshotCard(result, "Desktop", "desktop")}
        ${renderScreenshotCard(result, "Mobile", "mobile")}
      </div>
    </details>

    <details open>
      <summary>Outreach Copy</summary>
      <p class="plain-text"><strong>Recommended:</strong> ${escapeHtml(formatLabel(result.recommended_email_version))}</p>
      <p class="plain-text"><strong>Subject:</strong> ${escapeHtml(result.cold_email_subject)}</p>
      <div class="email-stack">
        ${renderEmailBox(result, "friendly", result.friendly_email)}
        ${renderEmailBox(result, "direct", result.direct_email)}
        ${renderEmailBox(result, "premium", result.premium_email)}
      </div>
      <p class="plain-text"><strong>Overall copy review:</strong> ${escapeHtml(result.outreach_copy_review || "Review manually before sending.")}</p>
    </details>

    <details>
      <summary>Edit Details</summary>
      <div class="edit-grid">
        <label>
          Business Name
          <input type="text" class="edit-business-name" value="${escapeAttribute(result.business_name)}">
        </label>
        <label>
          Industry
          <input type="text" class="edit-industry" value="${escapeAttribute(result.industry)}">
        </label>
        <label>
          Location
          <input type="text" class="edit-location" value="${escapeAttribute(result.location)}">
        </label>
        <label>
          Email
          <input type="email" class="edit-email" value="${escapeAttribute(result.email)}">
        </label>
        <label>
          Status
          <select class="edit-status">
            ${renderReviewStatusOptions(result.status)}
          </select>
        </label>
        <label>
          CRM Stage
          <input type="text" class="edit-crm-stage" value="${escapeAttribute(result.crm_stage)}">
        </label>
        <label class="checkbox-label">
          <input type="checkbox" class="edit-qualified" ${result.qualified ? "checked" : ""}>
          Qualified Outreach Prospect
        </label>
        <label>
          Opt-out Status
          <input type="text" class="edit-opt-out-status" value="${escapeAttribute(result.opt_out_status)}">
        </label>
        <label class="full-width">
          Main Issue
          <input type="text" class="edit-main-issue" value="${escapeAttribute(result.main_issue)}">
        </label>
        <label class="full-width">
          Recommended Offer
          <input type="text" class="edit-recommended-offer" value="${escapeAttribute(result.recommended_offer)}" list="offerSuggestions">
        </label>
        <label class="full-width">
          Cold Email Subject
          <input type="text" class="edit-cold-email-subject" value="${escapeAttribute(result.cold_email_subject)}">
        </label>
        <label class="full-width">
          Notes
          <textarea class="edit-notes" placeholder="Add review notes">${escapeHtml(result.notes)}</textarea>
        </label>
        <label class="full-width">
          Cold Email Body
          <textarea class="edit-cold-email-body">${escapeHtml(result.cold_email_body)}</textarea>
        </label>
        <label class="full-width">
          Friendly Email
          <textarea class="edit-friendly-email">${escapeHtml(result.friendly_email)}</textarea>
        </label>
        <label class="full-width">
          Direct Email
          <textarea class="edit-direct-email">${escapeHtml(result.direct_email)}</textarea>
        </label>
        <label class="full-width">
          Premium Email
          <textarea class="edit-premium-email">${escapeHtml(result.premium_email)}</textarea>
        </label>
        <div class="button-row full-width">
          <button type="button" class="save-changes">Save Changes</button>
          <button type="button" class="secondary cancel-edit">Cancel</button>
        </div>
        <div class="save-message" aria-live="polite"></div>
      </div>
    </details>

    <details>
      <summary>CRM Export</summary>
      <div class="button-row">
        <button type="button" class="copy-crm" data-crm="${escapeAttribute(crmRow)}">Copy CRM Row</button>
        <a class="export-link secondary" href="/api/export/csv">Export CSV</a>
        <a class="export-link secondary" href="/api/export/json">Export JSON</a>
        <button type="button" class="secondary" onclick="window.print()">Print Report</button>
      </div>
    </details>
  </div>
</article>`;
}

function renderFact(label: string, value: string): string {
  return `<div class="fact"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function renderScore(label: string, score: number | string): string {
  return `<div class="score-box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(score || 0))}</strong></div>`;
}

function renderIssues(issues: WebsiteIssue[]): string {
  if (issues.length === 0) {
    return '<div class="issue-card"><h3>No specific issue found</h3><p>Manual review may still be useful before contacting this business.</p></div>';
  }

  return issues
    .map((issue) => {
      const urgencyClass = issue.urgency.toLowerCase();
      return `<article class="issue-card">
        <div class="issue-meta">
          <span class="badge ${escapeAttribute(urgencyClass)}">${escapeHtml(issue.urgency)}</span>
          <span class="badge">${escapeHtml(issue.category)}</span>
        </div>
        <h3>${escapeHtml(issue.issue || issue.label)}</h3>
        <p>${escapeHtml(issue.detail || issue.evidence)}</p>
        <p><strong>Evidence:</strong> ${escapeHtml(issue.evidence || issue.detail)}</p>
        <p><strong>Why it matters:</strong> ${escapeHtml(issue.why_it_matters)}</p>
        <p><strong>Suggested fix:</strong> ${escapeHtml(issue.suggested_fix)}</p>
      </article>`;
    })
    .join("");
}

function renderScreenshotCard(result: OutreachResult, label: string, type: "desktop" | "mobile"): string {
  const previewPath = type === "desktop" ? result.desktop_preview_screenshot_path : result.mobile_preview_screenshot_path;
  const fullPath = type === "desktop" ? result.desktop_full_screenshot_path : result.mobile_full_screenshot_path;
  const frameClass = type === "desktop" ? "desktop-preview-frame" : "mobile-preview-frame";
  
  if (!previewPath || previewPath.includes("skinny") || !previewPath.includes("preview")) {
    return `
      <div class="screenshot-card">
        <div class="screenshot-header"><h3>${escapeHtml(label)} Preview</h3></div>
        <div class="preview-container" style="flex-direction: column; gap: 10px;">
          <p class="muted">Preview unavailable or legacy format.</p>
          <button type="button" class="secondary recapture-btn" 
            data-id="${escapeAttribute(result.id)}" 
            data-url="${escapeAttribute(result.website_url)}">Re-capture Screenshots</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="screenshot-card">
      <div class="screenshot-header">
        <h3>${escapeHtml(label)} Preview</h3>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="tab-btn recapture-btn" title="Re-capture"
            data-id="${escapeAttribute(result.id)}" 
            data-url="${escapeAttribute(result.website_url)}">↺</button>
          <button type="button" class="tab-btn open-modal-trigger" 
            data-type="${type}" 
            data-preview="${escapeAttribute(previewPath)}" 
            data-full="${escapeAttribute(fullPath)}"
            data-business="${escapeAttribute(result.business_name)}">View</button>
        </div>
      </div>
      <div class="preview-container open-modal-trigger" 
        data-type="${type}" 
        data-preview="${escapeAttribute(previewPath)}" 
        data-full="${escapeAttribute(fullPath)}"
        data-business="${escapeAttribute(result.business_name)}">
        <div class="${frameClass}">
          <img src="${escapeAttribute(previewPath)}" alt="${escapeAttribute(label)} preview" class="preview-img" loading="lazy">
        </div>
        <div class="view-btn-overlay">
          <button type="button">Open Full Viewer</button>
        </div>
      </div>
    </div>
  `;
}

function getScreenshotSrc(screenshotPath: string): string {
  if (!screenshotPath) return "";
  const normalized = screenshotPath.replace(/\\/g, "/");
  if (normalized.startsWith("/screenshots/")) return normalized;
  if (normalized.startsWith("data/screenshots/")) return normalized.replace(/^data\/screenshots\//, "/screenshots/");
  if (normalized.startsWith("/data/screenshots/")) return normalized.replace(/^\/data\/screenshots\//, "/screenshots/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function renderEmailBox(result: OutreachResult, version: "friendly" | "direct" | "premium", body: string): string {
  const review = result.email_reviews[version];
  const id = `${getResultId(result)}-${version}`.replace(/[^a-z0-9_-]/gi, "_");
  const recommendedClass = result.recommended_email_version === version ? " recommended" : "";

  return `<article class="email-box${recommendedClass}">
    <h3>${escapeHtml(formatLabel(version))} Email${result.recommended_email_version === version ? " - Recommended" : ""}</h3>
    <div class="email-body" id="${escapeAttribute(id)}">${escapeHtml(body || "No email generated.")}</div>
    <div class="button-row">
      <button type="button" class="secondary copy-email" data-copy-target="${escapeAttribute(id)}">Copy ${escapeHtml(formatLabel(version))} Email</button>
    </div>
    ${renderEmailReview(review)}
  </article>`;
}

function renderEmailReview(review?: EmailCopyReview): string {
  if (!review) {
    return '<p class="plain-text">No copy review recorded.</p>';
  }

  return `<div class="facts">
    ${renderFact("Copy Score", String(review.copy_score))}
    ${renderFact("Recommendation", review.best_version_recommendation)}
  </div>
  <p class="plain-text"><strong>Strengths:</strong></p>
  ${renderStringList(review.strengths, "compact-list")}
  <p class="plain-text"><strong>Risks:</strong></p>
  ${renderStringList(review.risks, "compact-list")}
  <p class="plain-text"><strong>Improvements:</strong></p>
  ${renderStringList(review.improvement_suggestions, "compact-list")}`;
}

function renderStringList(items: string[], className: string): string {
  if (!items || items.length === 0) {
    return "";
  }

  return `<ul class="${escapeAttribute(className)}">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReviewStatusOptions(current: string): string {
  return reviewStatuses
    .map((status) => `<option value="${escapeAttribute(status)}"${status === current ? " selected" : ""}>${escapeHtml(status)}</option>`)
    .join("");
}

function renderEmptyState(): string {
  return '<div class="empty">No websites analyzed yet. Paste a URL above and click Analyze Website.</div>';
}

function buildCrmRow(result: OutreachResult): string {
  return [
    result.business_name,
    result.website_url,
    result.industry,
    result.location,
    String(result.overall_score),
    result.priority_level,
    result.status,
    result.main_issue,
    result.recommended_email_version,
    result.cold_email_body,
  ]
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .join("\t");
}

function isOptedOut(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === "opted out" || normalized.includes("unsubscribed") || normalized.includes("do not contact");
}

function stripProtocol(value: string): string {
  return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function formatLabel(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const entryPoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";

if (import.meta.url === entryPoint) {
  generateHtmlReport().catch((error: unknown) => {
    console.error(getErrorMessage(error));
    process.exitCode = 1;
  });
}
