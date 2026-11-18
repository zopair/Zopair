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
    assert.equal(Object.hasOwn(body, "reportEmailConfigured"), false);
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

test("email API endpoint is removed; email preparation is browser-local", async () => {
  await withServer({ env: { GUMROAD_PRODUCT_ID: "product-1" } }, async base => {
    const response = await fetch(base + "/api/reports/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "customer@example.com" })
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });
});
