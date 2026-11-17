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

test("report email endpoint verifies the paid license and sends JSON and CSV attachments", async () => {
  let sentPayload;
  await withServer({
    env: { GUMROAD_PRODUCT_ID: "product-1", RESEND_API_KEY: "test-resend-key", REPORT_FROM_EMAIL: "reports@example.com" },
    fetchImpl: async (url, options) => {
      if (url === "https://api.gumroad.com/v2/licenses/verify") {
        const body = new URLSearchParams(options.body);
        assert.equal(body.get("license_key"), "valid-license-key");
        return new Response(JSON.stringify({ success: true, purchase: { product_id: "product-1", refunded: false } }), { status: 200 });
      }
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
        licenseKey: "valid-license-key",
        report: {
          format: "agentproof-diagnosis-v1",
          reportId: "AP-20261117120000-ABCDE",
          generatedAt: "2026-11-17T12:00:00.000Z",
          ruleCount: 8,
          summary: { total: 1, high: 1, medium: 0, low: 0 },
          filesScanned: 3,
          findings: [{ ruleId: "SEC-001", severity: "high", title: "Potential hard-coded secret", file: "app.js", line: 4, evidence: "ghp_abcdefghijklmnopqrstuvwxyz123456", recommendation: "Rotate the credential.", suggestedCode: "const token = process.env.TOKEN;" }]
        }
      })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: true });
    assert.equal(sentPayload.to[0], "customer@example.com");
    assert.equal(sentPayload.from, "AgentProof Reports <reports@example.com>");
    assert.equal(sentPayload.attachments.length, 2);
    assert.deepEqual(sentPayload.attachments.map(x => x.filename).sort(), ["agentproof-diagnosis.csv", "agentproof-diagnosis.json"]);
    const json = Buffer.from(sentPayload.attachments.find(x => x.filename.endsWith(".json")).content, "base64").toString();
    assert.match(json, /AP-20261117120000-ABCDE/);
    assert.match(json, /"ruleCount": 8/);
    assert.match(json, /redacted: credential-like source line/);
    assert.match(json, /const token = process.env.TOKEN/);
    assert.doesNotMatch(json, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
    const csv = Buffer.from(sentPayload.attachments.find(x => x.filename.endsWith(".csv")).content, "base64").toString();
    assert.match(csv, /Rotate the credential/);
    assert.match(csv, /const token = process.env.TOKEN/);
    assert.doesNotMatch(csv, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  });
});

test("report email endpoint validates the customer email and requires mail configuration", async () => {
  await withServer({
    env: { GUMROAD_PRODUCT_ID: "product-1" },
    fetchImpl: async () => new Response(JSON.stringify({ success: true, purchase: { product_id: "product-1", refunded: false } }), { status: 200 })
  }, async base => {
    const missing = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com", licenseKey: "valid-license-key", report: { format: "agentproof-diagnosis-v1", findings: [] } })
    });
    assert.equal(missing.status, 503);
    assert.deepEqual(await missing.json(), { error: "email_delivery_not_configured" });

    const invalid = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", licenseKey: "valid-license-key", report: { format: "agentproof-diagnosis-v1", findings: [] } })
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), { error: "invalid_report_request" });
  });
});

test("report email endpoint refuses delivery for an invalid Gumroad purchase", async () => {
  await withServer({
    env: { GUMROAD_PRODUCT_ID: "product-1", RESEND_API_KEY: "test-resend-key", REPORT_FROM_EMAIL: "reports@example.com" },
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 })
  }, async base => {
    const response = await fetch(base + "/api/reports/email", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com", licenseKey: "invalid-license-key", report: { format: "agentproof-diagnosis-v1", findings: [] } })
    });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "license_not_valid" });
  });
});
