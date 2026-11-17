import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs.html", import.meta.url), "utf8");

test("diagnosis UI has unique IDs and no code-repair controls", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML element IDs must be unique");
  assert.doesNotMatch(html, /repairWorkflow|repairPlanButton|approveRepairButton|Owner approval/i);
  assert.doesNotMatch(app, /applyRepairPlan|buildRepairPlan|createBackupManifest|approveRepairButton/);
});

test("paid diagnosis provides certificate, report downloads and email delivery", () => {
  for (const id of ["printCertificate", "exportDiagnosisJson", "exportDiagnosisCsv", "reportEmail", "sendReportEmail"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(app, /printDiagnosisCertificate/);
  assert.match(app, /\/api\/reports\/email/);
  assert.match(docs, /developer who created or maintains/i);
});

test("diagnosis recommendations are guidance only and do not alter source files", () => {
  assert.match(app, /REMEDIATION/);
  assert.match(app, /suggestedCode/);
  assert.match(app, /Suggested code example/);
  assert.doesNotMatch(app, /activeSources\s*=\s*repaired|downloadText\([^\n]*repaired/i);
});
