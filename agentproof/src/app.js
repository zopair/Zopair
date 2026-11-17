import { scanSourceFiles, summarizePublicFindings, toDiagnosisCsv, SCAN_RULE_COUNT } from "./scanner.js";
import { buildRepairPlan, applyRepairPlan, createBackupManifest } from "./repair.js";

const API_BASE = "https://hlzptpre.basicdeploy.com";
const $ = selector => document.querySelector(selector);
const picker = $("#sourceFiles");
const scanButton = $("#scanButton");
const licenseButton = $("#licenseButton");
let selectedFiles = [];
let activeSources = [];
let latestFindings = [];
let repairPlan = null;
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

function renderRepairPlan(plan) {
  const summary = $("#repairSummary");
  const manual = $("#manualRepairList");
  const changes = $("#proposedRepairList");
  summary.textContent = plan.summary.linesRemoved + " standalone debug statement(s) can be removed safely across " +
    plan.summary.filesChanged + " file(s). " + plan.summary.manualReview + " finding(s) require manual engineering review.";
  manual.replaceChildren();
  changes.replaceChildren();
  for (const change of plan.changes) {
    const item = document.createElement("li");
    const details = document.createElement("details");
    const summaryLine = document.createElement("summary");
    summaryLine.textContent = change.path + " — " + change.preview.length + " proposed removal(s)";
    details.append(summaryLine);
    for (const preview of change.preview) {
      const entry = document.createElement("div");
      entry.className = "repair-diff-entry";
      const location = document.createElement("strong");
      location.textContent = "Line " + preview.line;
      const beforeLabel = document.createElement("p");
      beforeLabel.textContent = "BEFORE";
      const before = document.createElement("pre");
      before.textContent = preview.before;
      const afterLabel = document.createElement("p");
      afterLabel.textContent = "AFTER";
      const after = document.createElement("pre");
      after.textContent = preview.after;
      entry.append(location, beforeLabel, before, afterLabel, after);
      details.append(entry);
    }
    item.append(details);
    changes.append(item);
  }
  for (const finding of plan.manualFindings) {
    const item = document.createElement("li");
    item.textContent = finding.file + ":" + finding.line + " · " + finding.ruleId + " — " + finding.reason;
    manual.append(item);
  }
  $("#repairApproval").hidden = plan.changes.length === 0;
  $("#repairApprovalCheck").checked = false;
  $("#approveRepairButton").disabled = true;
  $("#repairResult").hidden = true;
  $("#repairPlan").hidden = false;
  $("#repairPlan").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDiagnosis(findings) {
  const list = $("#diagnosisList");
  list.replaceChildren();
  for (const finding of findings) {
    const card = document.createElement("article");
    card.className = "finding-card";
    const heading = document.createElement("h3");
    heading.textContent = finding.title + " · " + finding.severity.toUpperCase();
    const location = document.createElement("p");
    location.textContent = finding.file + ":" + finding.line + " · " + finding.ruleId;
    const evidence = document.createElement("pre");
    evidence.textContent = finding.evidence;
    const recommendation = document.createElement("p");
    recommendation.textContent = REMEDIATION[finding.ruleId] || "Review this finding manually and apply a project-specific secure fix.";
    card.append(heading, location, evidence, recommendation);
    list.append(card);
  }
  $("#diagnosis").hidden = false;
  $("#repairWorkflow").hidden = false;
}

picker.addEventListener("change", () => {
  selectedFiles = Array.from(picker.files || []);
  activeSources = [];
  latestFindings = [];
  hasCompletedScan = false;
  hasVerifiedDiagnosis = false;
  $("#diagnosis").hidden = true;
  $("#repairWorkflow").hidden = true;
  $("#repairPlan").hidden = true;
  $("#fileMeta").textContent = selectedFiles.length
    ? selectedFiles.length + " file(s) selected · Content stays in this browser"
    : "Supported source formats · JS, TS, Python, Java, Go, PHP, Ruby, SQL, HTML, CSS and more";
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
    hasVerifiedDiagnosis = false;
    hasCompletedScan = true;
    $("#diagnosis").hidden = true;
    $("#licenseError").hidden = true;
    const summary = summarizePublicFindings(latestFindings);
    for (const key of ["total", "high", "medium", "low"]) $("#" + key).textContent = summary[key];
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
  const report = {
    format: "agentproof-diagnosis-v1",
    generatedAt: new Date().toISOString(),
    summary: summarizePublicFindings(latestFindings),
    findings: latestFindings
  };
  downloadText("agentproof-diagnosis.json", JSON.stringify(report, null, 2));
});

$("#exportDiagnosisCsv").addEventListener("click", () => {
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  downloadText("agentproof-diagnosis.csv", toDiagnosisCsv(latestFindings), "text/csv;charset=utf-8");
});

$("#repairPlanButton").addEventListener("click", () => {
  if (!hasVerifiedDiagnosis || !hasCompletedScan) return;
  repairPlan = buildRepairPlan(activeSources, latestFindings);
  renderRepairPlan(repairPlan);
});

$("#repairApprovalCheck").addEventListener("change", event => {
  $("#approveRepairButton").disabled = !event.target.checked;
});

$("#approveRepairButton").addEventListener("click", () => {
  if (!hasVerifiedDiagnosis || !repairPlan || !$("#repairApprovalCheck").checked) return;
  const button = $("#approveRepairButton");
  button.disabled = true;
  button.textContent = "Creating backup and applying approved changes…";
  try {
    const backup = createBackupManifest(activeSources);
    downloadText("agentproof-backup-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json", JSON.stringify(backup, null, 2));
    const repairedSources = applyRepairPlan(repairPlan, activeSources);
    for (const [index, change] of repairPlan.changes.entries()) {
      const safeName = change.path.replace(/[\\/]+/g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
      const output = repairedSources.find(file => file.name === change.path);
      downloadText("agentproof-repaired-" + (index + 1) + "-" + safeName, output.content, "text/plain;charset=utf-8");
    }
    const verificationFindings = scanSourceFiles(repairedSources);
    activeSources = repairedSources;
    latestFindings = verificationFindings;
    const summary = summarizePublicFindings(verificationFindings);
    for (const key of ["total", "high", "medium", "low"]) $("#" + key).textContent = summary[key];
    $("#scanStatus").textContent = "POST-REPAIR VERIFICATION";
    renderDiagnosis(verificationFindings);
    const result = $("#repairResult");
    result.hidden = false;
    result.className = summary.total === 0 ? "repair-result repair-result-success" : "repair-result";
    result.textContent = summary.total === 0
      ? "100% — No findings remain within the current heuristic scan scope. Backup and repaired file downloads were generated. Review the downloaded files before replacing project files."
      : "Approved repair applied to " + repairPlan.summary.linesRemoved + " debug statement(s). " + summary.total + " finding(s) remain. Backup and changed files were downloaded; review and replace files manually.";
    $("#repairApproval").hidden = true;
  } catch (error) {
    $("#repairResult").hidden = false;
    $("#repairResult").textContent = "Repair was not completed: " + (error instanceof Error ? error.message : "unknown error");
  } finally {
    button.textContent = "Download backup & apply approved repairs";
  }
});
