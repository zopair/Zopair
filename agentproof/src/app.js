import { scanSourceFiles, summarizePublicFindings, SCAN_RULE_COUNT } from "./scanner.js";

const $ = selector => document.querySelector(selector);
const picker = $("#sourceFiles");
const scanButton = $("#scanButton");
let selectedFiles = [];

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
    const findings = scanSourceFiles(sources);
    const summary = summarizePublicFindings(findings);
    for (const key of ["total", "high", "medium", "low"]) $("#" + key).textContent = summary[key];
    $("#ruleCount").textContent = SCAN_RULE_COUNT + " HEURISTIC CHECKS";
    $("#scanStatus").textContent = sources.length + " FILES SCANNED";
    $("#results").hidden = false;
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    // Finding objects intentionally remain in memory only; the free UI exposes counts only.
  } catch (err) {
    error.textContent = err instanceof Error ? err.message : "The scan could not be completed.";
    error.hidden = false;
  } finally {
    scanButton.disabled = selectedFiles.length === 0;
    scanButton.textContent = "Run free scan →";
  }
});
