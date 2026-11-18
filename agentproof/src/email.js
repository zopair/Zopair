const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createEmailDraft({ email, report }) {
  const recipient = typeof email === "string" ? email.trim() : "";
  if (recipient.length > 254 || !EMAIL_PATTERN.test(recipient)) throw new Error("Enter a valid email address.");
  if (!report || report.format !== "agentproof-diagnosis-v1" || !report.summary) throw new Error("A valid diagnosis report is required.");
  const summary = report.summary;
  const reportId = String(report.reportId || "report");
  const body = [
    "Your AgentProof Professional Diagnosis report is ready.", "",
    "Report ID: " + reportId,
    "Issued: " + String(report.generatedAt || "Not specified"),
    "Files scanned: " + Number(report.filesScanned || 0),
    "Configured checks: " + Number(report.ruleCount || 0),
    "Findings: " + Number(summary.total || 0) + " (High: " + Number(summary.high || 0) + ", Medium: " + Number(summary.medium || 0) + ", Low: " + Number(summary.low || 0) + ")", "",
    "Please attach the two report files downloaded by AgentProof:",
    "- agentproof-diagnosis-" + reportId + ".json",
    "- agentproof-diagnosis-" + reportId + ".csv", "",
    "Next step: Share this report with the developer who created or maintains your code and request review and remediation.",
    "AgentProof provides diagnostic guidance only and does not modify source code.", "",
    "This is a heuristic diagnostic report, not a guarantee or formal security certification."
  ].join("\n");
  const params = new URLSearchParams({ subject: "Your AgentProof diagnosis report", body });
  return "mailto:" + encodeURIComponent(recipient) + "?" + params.toString();
}
