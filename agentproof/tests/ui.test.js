import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("repair workflow uses unique container and detail panel IDs", () => {
  const ids = [...html.matchAll(/\\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, "HTML element IDs must be unique");
  assert.match(html, /id="repairWorkflow"/);
  assert.match(html, /id="repairPlan"/);
});

test("verified diagnosis reveals the repair workflow", () => {
  const diagnosisRenderer = app.slice(app.indexOf("function renderDiagnosis"), app.indexOf("picker.addEventListener"));
  assert.match(diagnosisRenderer, /\\$\\("#repairWorkflow"\\)\\.hidden = false/);
});
