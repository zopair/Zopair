import test from "node:test";
import assert from "node:assert/strict";
import { scanSourceFiles, summarizePublicFindings } from "../src/scanner.js";

test("free summary exposes only severity counts and no finding metadata", () => {
  const findings = scanSourceFiles([{ name: "app.js", content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";\neval(userInput);' }]);
  const summary = summarizePublicFindings(findings);
  assert.equal(summary.total, findings.length);
  assert.ok(summary.high + summary.medium + summary.low === summary.total);
  assert.deepEqual(Object.keys(summary).sort(), ["high", "low", "medium", "total"]);
  assert.equal(JSON.stringify(summary).includes("app.js"), false);
  assert.equal(JSON.stringify(summary).includes("AP-"), false);
});

test("scanner detects representative secret and dangerous execution patterns", () => {
  const findings = scanSourceFiles([{ name: "server.js", content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";\neval(req.query.code);' }]);
  assert.ok(findings.some(item => item.severity === "high"));
  assert.ok(findings.some(item => item.severity === "medium"));
});

test("scanner ignores unsupported binary and empty inputs safely", () => {
  assert.deepEqual(scanSourceFiles([]), []);
  assert.deepEqual(scanSourceFiles([{ name: "image.png", content: "binary" }]), []);
});

test("paid diagnosis redacts credential-like source evidence", () => {
  const findings = scanSourceFiles([{
    name: "server.js",
    content: 'const token = "ghp_abcdefghijklmnopqrstuvwxyz123456";\nfetch(url, { headers: { authorization: "Bearer abcdefghijklmnopqrstuvwxyz123456" } });'
  }]);
  const sensitive = findings.filter(item => item.ruleId === "SEC-001" || item.ruleId === "SEC-002");
  assert.equal(sensitive.length, 2);
  for (const finding of sensitive) {
    assert.doesNotMatch(finding.evidence, /ghp_abcdefghijklmnopqrstuvwxyz123456|Bearer abcdefghijklmnopqrstuvwxyz123456/);
    assert.match(finding.evidence, /redacted/i);
  }
});
