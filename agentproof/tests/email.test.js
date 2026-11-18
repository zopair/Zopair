import test from "node:test";
import assert from "node:assert/strict";
import { createEmailDraft } from "../src/email.js";

test("creates a mailto draft addressed to the customer with report handoff details", () => {
  const draft = createEmailDraft({
    email: "customer@example.com",
    report: {
      format: "agentproof-diagnosis-v1",
      reportId: "AP-20261118-ABCDE",
      generatedAt: "2026-11-18T10:30:00.000Z",
      filesScanned: 4,
      ruleCount: 8,
      summary: { total: 3, high: 1, medium: 1, low: 1 }
    }
  });
  const url = new URL(draft);
  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, "customer@example.com");
  const params = new URLSearchParams(url.search);
  assert.equal(params.get("subject"), "Your AgentProof diagnosis report");
  assert.match(params.get("body"), /AP-20261118-ABCDE/);
  assert.match(params.get("body"), /agentproof-diagnosis-.*\.json/);
  assert.match(params.get("body"), /agentproof-diagnosis-.*\.csv/);
  assert.match(params.get("body"), /attach/i);
});

test("encodes email addresses and report text safely", () => {
  const draft = createEmailDraft({
    email: "qa+reports@example.com",
    report: {
      format: "agentproof-diagnosis-v1",
      reportId: "AP & QA",
      generatedAt: "2026-11-18T10:30:00.000Z",
      filesScanned: 1,
      ruleCount: 8,
      summary: { total: 0, high: 0, medium: 0, low: 0 }
    }
  });
  assert.match(draft, /^mailto:qa%2Breports@example\.com\?/);
  assert.match(new URLSearchParams(draft.split("?")[1]).get("body"), /AP & QA/);
});

test("rejects invalid recipients and malformed report payloads", () => {
  const report = { format: "agentproof-diagnosis-v1", summary: { total: 0, high: 0, medium: 0, low: 0 } };
  assert.throws(() => createEmailDraft({ email: "not-an-email", report }), /valid email/i);
  assert.throws(() => createEmailDraft({ email: "customer@example.com", report: {} }), /valid diagnosis report/i);
});
