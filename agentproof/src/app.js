import { scanSourceFiles, summarizePublicFindings, toDiagnosisCsv, SCAN_RULE_COUNT } from "./scanner.js";

const API_BASE = "https://hlzptpre.basicdeploy.com";
const $ = selector => document.querySelector(selector);
const picker = $("#sourceFiles");
const scanButton = $("#scanButton");
const licenseButton = $("#licenseButton");
let selectedFiles = [];
let activeSources = [];
let latestFindings = [];
let reportSnapshot = null;
let hasCompletedScan = false;
let hasVerifiedDiagnosis = false;

const REMEDIATION = {
  "SEC-001": "Remove the exposed credential from source history, revoke or rotate it at its provider, and load the replacement from a secret manager or environment variable.",
  "SEC-002": "Remove the hard-coded bearer value, rotate the token, and retrieve credentials from a protected runtime secret store.",
  "CODE-001": "Avoid evaluating untrusted strings. Replace dynamic execution with an allow-listed operation map or a safe parser.",
  "CODE-002": "Prefer textContent or safe DOM construction. If HTML is required, sanitize it with a maintained allow-list sanitizer.",
  "CODE-003": "Avoid shell interpolation. Use a fixed executable with argument arrays, strict input validation and least-privilege execution.",
  "CODE-004": "Enable TLS certificate validation and configure the correct trust chain instead of disabling verification.",
  "CODE-005": "Use parameterized queries and bound parameters; never concatenate untrusted values into SQL statements.",
  "QUALITY-001": "Remove or gate debug output before production and ensure logs do not expose secrets or personal data."
};

function downloadText(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createReport() {
  const generatedAt = new Date().toISOString();
  const findings = latestFindings.map(finding => ({
    ...finding,
    recommendation: REMEDIATION[finding.ruleId] || "Review this finding with the developer who created or maintains the code and request a project-specific correction."
  }));
  return {
    format: "agentproof-diagnosis-v1",
    reportId: "AP-" + generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 7).toUpperCase(),
    generatedAt,
    filesScanned: activeSources.length,
    ruleCount: SCAN_RULE_COUNT,
    summary: summarizePublicFindings(findings),
    findings
  };
}

function ensureReport() {
  if (!reportSnapshot) reportSnapshot = createReport();
  return reportSnapshot;
}

function renderDiagnosis(findings) {
  const report = ensureReport();
  const list = $("#diagnosisList");
  list.replaceChildren();
  for (const finding of report.findings) {
    const card = document.createElement("article");
    card.className = "finding-card";
    const heading = document.createElement("h3");
    heading.textContent = finding.title + " · " + finding.severity.toUpperCase();
    const location = document.createElement("p");
    location.textContent = finding.file + ":" + finding.line + " · " + finding.ruleId;
    const evidence = document.createElement("pre");
    evidence.textContent = finding.evidence;
    const recommendationTitle = document.createElement("strong");
    recommendationTitle.textContent = "Suggested remediation for your developer";
    const recommendation = document.createElement("p");
    recommendation.textContent = finding.recommendation;
    card.append(heading, location, evidence, recommendationTitle, recommendation);
    list.append(card);
  }
  $("#diagnosis").hidden = false;
}

function printDiagnosisCertificate() {
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  const report = ensureReport();
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    $("#reportEmailStatus").textContent = "Allow pop-ups to print or save the certificate as PDF.";
    $("#reportEmailStatus").hidden = false;
    return;
  }
  printWindow.opener = null;
  const rows = report.findings.map(finding => `
    <article class="finding">
      <h3>${escapeHtml(finding.title)} — ${escapeHtml(finding.severity.toUpperCase())}</h3>
      <p><b>Location:</b> ${escapeHtml(finding.file)}:${finding.line} · ${escapeHtml(finding.ruleId)}</p>
      <pre>${escapeHtml(finding.evidence)}</pre>
      <p><b>Suggested remediation for the developer:</b> ${escapeHtml(finding.recommendation)}</p>
    </article>`).join("");
  const status = report.summary.total === 0
    ? "No findings detected within the configured heuristic checks"
    : report.summary.total + " finding(s) detected — developer review required";
  printWindow.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>AgentProof Diagnosis ${escapeHtml(report.reportId)}</title>
    <style>
      body{font:14px/1.6 Arial,sans-serif;color:#17212b;max-width:900px;margin:36px auto;padding:0 24px}
      header{border-bottom:3px solid #176b62;padding-bottom:18px;margin-bottom:24px}
      .brand{font-size:27px;font-weight:800;color:#123e43}.brand span{color:#178b78}
      h1{font-size:25px;margin:18px 0 5px}.meta,.disclaimer{color:#526170;font-size:12px}
      .certificate{border:2px solid #176b62;padding:20px;margin:20px 0;background:#f3faf8}
      .counts{display:flex;gap:25px;flex-wrap:wrap;margin:12px 0}.counts b{font-size:20px}
      .finding{border:1px solid #d6dee5;padding:14px;margin:12px 0;break-inside:avoid}
      .finding h3{font-size:15px;margin:0 0 7px}.finding p{font-size:12px}
      pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f5f7;padding:9px;font-size:11px}
      footer{border-top:1px solid #ccd5dd;margin-top:25px;padding-top:12px;font-size:11px;color:#526170}
      @media print{body{margin:15mm auto}.certificate,.finding{break-inside:avoid}}
    </style></head><body>
    <header><div class="brand">Agent<span>Proof</span></div><div>INSPECT · DIAGNOSE · REPORT</div></header>
    <h1>Code Diagnostic Report & Inspection Certificate</h1>
    <p class="meta">Report ID: ${escapeHtml(report.reportId)} · Issued: ${escapeHtml(new Date(report.generatedAt).toLocaleString())}</p>
    <section class="certificate"><h2>Inspection result</h2><p><b>${escapeHtml(status)}</b></p>
      <div class="counts"><span>Files scanned: <b>${report.filesScanned}</b></span><span>Total: <b>${report.summary.total}</b></span><span>High: <b>${report.summary.high}</b></span><span>Medium: <b>${report.summary.medium}</b></span><span>Low: <b>${report.summary.low}</b></span></div>
      <p>Checks applied: ${report.ruleCount} configured heuristic rules.</p>
    </section>
    <h2>Findings and suggested remediation</h2>${rows || "<p>No findings were detected within the configured checks.</p>"}
    <footer><b>Important:</b> This certificate confirms that the selected files were scanned by AgentProof's configured heuristic checks only. It is not a guarantee of security, compliance certification, or proof that the project is free of vulnerabilities. Give this report to the developer who created or maintains the code and request review and correction. Suggested fixes are guidance only; AgentProof does not modify source code.</footer>
    </body></html>`);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 350);
}

function renderFreeSummary(summary) {
  for (const key of ["total", "high", "medium", "low"]) $("#" + key).textContent = summary[key];
}

picker.addEventListener("change", () => {
  selectedFiles = Array.from(picker.files || []);
  activeSources = [];
  latestFindings = [];
  reportSnapshot = null;
  hasCompletedScan = false;
  hasVerifiedDiagnosis = false;
  $("#diagnosis").hidden = true;
  $("#reportEmailStatus").hidden = true;
  $("#fileMeta").textContent = selectedFiles.length
    ? selectedFiles.length + " file(s) selected · Content stays in this browser"
    : "Supported source formats · JS, TS, Python, Java, Go, PHP, SQL, HTML, CSS and more";
  scanButton.disabled = selectedFiles.length === 0;
  $("#error").hidden = true;
});

scanButton.addEventListener("click", async () => {
  const error = $("#error");
  error.hidden = true;
  scanButton.disabled = true;
  scanButton.textContent = "Scanning locally…";
  try {
    if (selectedFiles.length > 500) throw new Error("Select no more than 500 files per scan.");
    let totalBytes = 0;
    const sources = [];
    for (const file of selectedFiles) {
      if (file.size > 2 * 1024 * 1024) continue;
      totalBytes += file.size;
      if (totalBytes > 20 * 1024 * 1024) throw new Error("Selected source files exceed the 20 MB scan limit.");
      sources.push({ name: file.webkitRelativePath || file.name, content: await file.text() });
    }
    activeSources = sources;
    latestFindings = scanSourceFiles(activeSources);
    reportSnapshot = null;
    hasVerifiedDiagnosis = false;
    hasCompletedScan = true;
    $("#diagnosis").hidden = true;
    $("#licenseError").hidden = true;
    renderFreeSummary(summarizePublicFindings(latestFindings));
    $("#ruleCount").textContent = SCAN_RULE_COUNT + " HEURISTIC CHECKS";
    $("#scanStatus").textContent = sources.length + " FILES SCANNED";
    $("#results").hidden = false;
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : "The scan could not be completed.";
    error.hidden = false;
  } finally {
    scanButton.disabled = selectedFiles.length === 0;
    scanButton.textContent = "Run free scan →";
  }
});

licenseButton.addEventListener("click", async () => {
  const licenseKey = $("#licenseKey").value.trim();
  const message = $("#licenseError");
  message.hidden = true;
  if (!hasCompletedScan) {
    message.textContent = "Run a scan first. Your findings remain in this browser.";
    message.hidden = false;
    return;
  }
  if (!licenseKey) {
    message.textContent = "Enter the license key from your Gumroad receipt.";
    message.hidden = false;
    return;
  }
  licenseButton.disabled = true;
  licenseButton.textContent = "Verifying purchase…";
  try {
    const response = await fetch(API_BASE + "/api/licenses/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error === "license_verification_not_configured"
      ? "Purchase verification is not configured yet. Please try again later."
      : "The license could not be verified. Check the key and try again.");
    if (!result.valid) throw new Error("This license is invalid, refunded, revoked or belongs to another product.");
    hasVerifiedDiagnosis = true;
    renderDiagnosis(latestFindings);
  } catch (err) {
    message.textContent = err instanceof Error ? err.message : "Verification unavailable.";
    message.hidden = false;
  } finally {
    licenseButton.disabled = false;
    licenseButton.textContent = "Verify and unlock diagnosis →";
  }
});

$("#exportDiagnosisJson").addEventListener("click", () => {
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  const report = ensureReport();
  downloadText("agentproof-diagnosis-" + report.reportId + ".json", JSON.stringify(report, null, 2));
});

$("#exportDiagnosisCsv").addEventListener("click", () => {
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  const report = ensureReport();
  downloadText("agentproof-diagnosis-" + report.reportId + ".csv", toDiagnosisCsv(report.findings), "text/csv;charset=utf-8");
});

$("#printCertificate").addEventListener("click", printDiagnosisCertificate);

$("#sendReportEmail").addEventListener("click", async () => {
  const status = $("#reportEmailStatus");
  const email = $("#reportEmail").value.trim();
  status.hidden = true;
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  if (!email) {
    status.textContent = "Enter the email address where you want to receive the report.";
    status.hidden = false;
    return;
  }
  const button = $("#sendReportEmail");
  button.disabled = true;
  button.textContent = "Sending report…";
  try {
    const response = await fetch(API_BASE + "/api/reports/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, licenseKey: $("#licenseKey").value.trim(), report: ensureReport() })
    });
    const result = await response.json();
    if (!response.ok) {
      if (result.error === "email_delivery_not_configured") throw new Error("Email delivery is being configured. Download the report or save the certificate as PDF for now.");
      throw new Error("The report could not be sent. Check the email address and try again.");
    }
    status.textContent = "Report sent to " + email + ". Check your inbox.";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "Email delivery failed.";
  } finally {
    status.hidden = false;
    button.disabled = false;
    button.textContent = "Send report to my email";
  }
});
