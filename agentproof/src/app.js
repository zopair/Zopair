import { scanSourceFiles, summarizePublicFindings, SCAN_RULE_COUNT } from "./scanner.js";

const API_BASE = "https://hlzptpre.basicdeploy.com";
const $ = selector => document.querySelector(selector);
const picker = $("#sourceFiles");
const scanButton = $("#scanButton");
const licenseButton = $("#licenseButton");
let selectedFiles = [];
let latestFindings = [];

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
}

picker.addEventListener("change", () => {
  selectedFiles = Array.from(picker.files || []);
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
    latestFindings = scanSourceFiles(sources);
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
  if (!latestFindings.length && Number($("#total").textContent) === 0) {
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
    renderDiagnosis(latestFindings);
  } catch (err) {
    message.textContent = err instanceof Error ? err.message : "Verification unavailable.";
    message.hidden = false;
  } finally {
    licenseButton.disabled = false;
    licenseButton.textContent = "Verify and unlock diagnosis →";
  }
});
