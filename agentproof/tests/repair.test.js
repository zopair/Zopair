import test from "node:test";
import assert from "node:assert/strict";
import { buildRepairPlan, applyRepairPlan, createBackupManifest } from "../src/repair.js";

test("repair plan only removes standalone console log/debug statements", () => {
  const files = [{ name: "src/app.js", content: 'const value = 1;\n  console.log(value);\nconsole.debug("trace");\nnode.innerHTML = value;\n' }];
  const findings = [
    { ruleId: "QUALITY-001", severity: "low", file: "src/app.js", line: 2 },
    { ruleId: "QUALITY-001", severity: "low", file: "src/app.js", line: 3 },
    { ruleId: "CODE-002", severity: "medium", file: "src/app.js", line: 4 }
  ];
  const plan = buildRepairPlan(files, findings);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].removedLines.length, 2);
  assert.equal(plan.manualFindings.length, 1);
  assert.equal(plan.changes[0].repairedContent, "const value = 1;\nnode.innerHTML = value;\n");
  assert.deepEqual(plan.changes[0].preview, [
    { line: 2, before: "  console.log(value);", after: "Line removed" },
    { line: 3, before: 'console.debug("trace");', after: "Line removed" }
  ]);
});

test("repair plan leaves inline, conditional and multiline console calls untouched", () => {
  const files = [{ name: "app.js", content: 'if (debug) console.log("x");\nconsole.log(\n  value\n);\nconst x = console.log("y");\n' }];
  const findings = [1, 2, 4].map(line => ({ ruleId: "QUALITY-001", file: "app.js", line, severity: "low" }));
  const plan = buildRepairPlan(files, findings);
  assert.equal(plan.changes.length, 0);
  assert.equal(plan.manualFindings.length, 3);
});

test("repair apply is explicit and returns patched file content without mutating inputs", () => {
  const files = [{ name: "app.js", content: 'console.log("remove");\nconst safe = true;\n' }];
  const plan = buildRepairPlan(files, [{ ruleId: "QUALITY-001", file: "app.js", line: 1 }]);
  const output = applyRepairPlan(plan, files);
  assert.equal(output[0].content, "const safe = true;\n");
  assert.match(files[0].content, /console\.log/);
});

test("backup manifest retains exact originals and contains no credentials outside the selected source", () => {
  const files = [{ name: "src/app.js", content: "const token = 'sample';\n" }];
  const manifest = createBackupManifest(files, { createdAt: "2026-11-17T00:00:00.000Z" });
  assert.equal(manifest.files[0].path, "src/app.js");
  assert.equal(manifest.files[0].content, files[0].content);
  assert.equal(manifest.format, "agentproof-backup-v1");
});
