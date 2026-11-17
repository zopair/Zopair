import test from "node:test";
import assert from "node:assert/strict";
import { verifyGumroadLicense } from "../api/gumroad.js";

test("license verification fails closed when product configuration is missing", async () => {
  await assert.rejects(
    verifyGumroadLicense({ licenseKey: "abc", productId: "", fetchImpl: async () => { throw new Error("must not call"); } }),
    /not configured/
  );
});

test("license verification accepts only a successful non-refunded Gumroad purchase", async () => {
  const result = await verifyGumroadLicense({
    licenseKey: "valid-key",
    productId: "product-123",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.gumroad.com/v2/licenses/verify");
      const body = new URLSearchParams(options.body);
      assert.equal(body.get("product_id"), "product-123");
      assert.equal(body.get("license_key"), "valid-key");
      assert.equal(body.get("increment_uses_count"), "false");
      return new Response(JSON.stringify({ success: true, purchase: { refunded: false, chargebacked: false, product_id: "product-123" } }), { status: 200 });
    }
  });
  assert.equal(result.valid, true);
});

test("license verification rejects refunded, chargebacked and mismatched purchases", async () => {
  for (const purchase of [
    { refunded: true, product_id: "product-123" },
    { partially_refunded: true, product_id: "product-123" },
    { disputed: true, dispute_won: false, product_id: "product-123" },
    { subscription_ended_at: "2026-01-01", product_id: "product-123" },
    { chargebacked: true, product_id: "product-123" },
    { refunded: false, product_id: "another-product" }
  ]) {
    const result = await verifyGumroadLicense({
      licenseKey: "valid-key",
      productId: "product-123",
      fetchImpl: async () => new Response(JSON.stringify({ success: true, purchase }), { status: 200 })
    });
    assert.equal(result.valid, false);
  }
});

test("license verification allows a dispute that the seller won", async () => {
  const result = await verifyGumroadLicense({
    licenseKey: "valid-key", productId: "product-123",
    fetchImpl: async () => new Response(JSON.stringify({ success: true, purchase: { product_id: "product-123", disputed: true, dispute_won: true } }), { status: 200 })
  });
  assert.equal(result.valid, true);
});

test("license verification rejects malformed provider responses", async () => {
  const result = await verifyGumroadLicense({
    licenseKey: "valid-key",
    productId: "product-123",
    fetchImpl: async () => new Response(JSON.stringify({ success: false }), { status: 200 })
  });
  assert.equal(result.valid, false);
});
