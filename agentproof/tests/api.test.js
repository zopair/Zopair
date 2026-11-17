import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../api/server.js";

async function withServer(options, run) {
  const server = createApp(options);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try { await run("http://127.0.0.1:" + address.port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("health endpoint reports service and license configuration without secrets", async () => {
  await withServer({ env: { GUMROAD_PRODUCT_ID: "public-product-id" } }, async base => {
    const response = await fetch(base + "/health");
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.licenseVerificationConfigured, true);
    assert.equal(JSON.stringify(body).includes("public-product-id"), false);
  });
});

test("license endpoint fails closed until product id is configured", async () => {
  await withServer({ env: {} }, async base => {
    const response = await fetch(base + "/api/licenses/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ licenseKey: "valid-license-key" })
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "license_verification_not_configured" });
  });
});

test("license endpoint returns only a boolean and generic reason", async () => {
  await withServer({
    env: { GUMROAD_PRODUCT_ID: "product-1" },
    fetchImpl: async () => new Response(JSON.stringify({ success: true, purchase: { product_id: "product-1", refunded: false } }), { status: 200 })
  }, async base => {
    const response = await fetch(base + "/api/licenses/verify", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ licenseKey: "valid-license-key" })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { valid: true, reason: null });
  });
});

test("license endpoint rejects cross-origin browser requests without granting CORS", async () => {
  await withServer({ env: { GUMROAD_PRODUCT_ID: "product-1" } }, async base => {
    const response = await fetch(base + "/health", { headers: { Origin: "https://evil.example" } });
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});

test("report email endpoint sends requested diagnosis attachments through Resend", async () => {
  let sentPayload;
  await withServer({
    env: { RESEND_API_KEY: "test-resend-key", REPORT_FROM_EMAIL: "reports@example.com" },
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails");
      assert.equal(options.headers.Authorization, "Bearer test-resend-key");
      sentPayload = JSON.parse(options.body);
      return new Response(JSON.stringify({ id: "email-test-id" }), { status: 200 });
    }
  }, async base => {
    const response = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        report: {
          format: "agentproof-diagnosis-v1",
          generatedAt: "2026-11-17T12:00:00.000Z",
          summary: { total: 1, high: 1, medium: 0, low: 0 },
          filesScanned: 3,
          findings: [{ ruleId: "SEC-001", severity: "high", title: "Potential hard-coded secret", file: "app.js", line: 4, evidence: "[redacted: credential-like source line]", recommendation: "Rotate the credential." }]
        }
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: true });
    assert.equal(sentPayload.to[0], "customer@example.com");
    assert.equal(sentPayload.from, "AgentProof Reports <reports@example.com>");
    assert.equal(sentPayload.attachments.length, 2);
    assert.deepEqual(sentPayload.attachments.map(x => x.filename).sort(), ["agentproof-diagnosis.csv", "agentproof-diagnosis.json"]);
  });
});

test("report email endpoint validates customer email and requires mail configuration", async () => {
  await withServer({ env: {} }, async base => {
    const missing = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com", report: { format: "agentproof-diagnosis-v1", findings: [] } })
    });
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { error: "email_delivery_not_configured" });

    const invalid = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", report: { format: "agentproof-diagnosis-v1", findings: [] } })
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_report_request" });
  });
});
