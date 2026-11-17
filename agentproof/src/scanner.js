const RULES = [
  { id: "SEC-001", severity: "high", title: "Potential hard-coded secret", regex: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:api[_-]?key|client[_-]?secret|password)\s*[:=]\s*["'][^"']{8,})/i },
  { id: "SEC-002", severity: "high", title: "Possible credential in authorization header", regex: /authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+\/-]{16,}/i },
  { id: "CODE-001", severity: "medium", title: "Dynamic code execution", regex: /\beval\s*\(|\bnew\s+Function\s*\(/i },
  { id: "CODE-002", severity: "medium", title: "Potential unsafe HTML injection", regex: /\.innerHTML\s*=/i },
  { id: "CODE-003", severity: "medium", title: "Potential shell command execution", regex: /\b(?:exec|execSync|spawn|spawnSync)\s*\(/i },
  { id: "CODE-004", severity: "medium", title: "TLS certificate verification disabled", regex: /rejectUnauthorized\s*:\s*false/i },
  { id: "CODE-005", severity: "medium", title: "Potential SQL string concatenation", regex: /(?:SELECT|INSERT|UPDATE|DELETE)[^;\n]*\+\s*[A-Za-z_$]/i },
  { id: "QUALITY-001", severity: "low", title: "Debug output left in source", regex: /\bconsole\.(?:log|debug)\s*\(/i }
];
const EXTENSIONS = /\.(?:js|jsx|mjs|cjs|ts|tsx|py|php|rb|go|java|kt|cs|cpp|c|h|hpp|rs|swift|vue|svelte|html|css|json|yml|yaml|sh|sql)$/i;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 500;

export function scanSourceFiles(files) {
  if (!Array.isArray(files)) throw new TypeError("files must be an array");
  if (files.length > MAX_FILES) throw new RangeError("Maximum 500 source files per scan");
  let totalBytes = 0;
  const findings = [];
  for (const file of files) {
    if (!file || typeof file.name !== "string" || typeof file.content !== "string") continue;
    if (!EXTENSIONS.test(file.name)) continue;
    const bytes = new TextEncoder().encode(file.content).length;
    if (bytes > MAX_FILE_BYTES) continue;
    totalBytes += bytes;
    if (totalBytes > MAX_TOTAL_BYTES) throw new RangeError("Project exceeds the 20 MB scan limit");
    const lines = file.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.regex.test(line)) {
          const sensitiveEvidence = rule.id === "SEC-001" || rule.id === "SEC-002";
          findings.push({
            ruleId: rule.id,
            severity: rule.severity,
            title: rule.title,
            file: file.name,
            line: index + 1,
            evidence: sensitiveEvidence
              ? "[redacted: credential-like source line]"
              : line.trim().slice(0, 240)
          });
        }
      }
    });
  }
  return findings;
}

export function summarizePublicFindings(findings) {
  return findings.reduce((summary, finding) => {
    summary.total += 1;
    if (Object.hasOwn(summary, finding.severity)) summary[finding.severity] += 1;
    return summary;
  }, { total: 0, high: 0, medium: 0, low: 0 });
}

export const SCAN_RULE_COUNT = RULES.length;
