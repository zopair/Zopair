const VERIFY_URL = "https://api.gumroad.com/v2/licenses/verify";

export async function verifyGumroadLicense({ licenseKey, productId, fetchImpl = fetch }) {
  if (!productId) throw new Error("Gumroad product verification is not configured");
  if (typeof licenseKey !== "string" || licenseKey.trim().length < 8 || licenseKey.length > 512) {
    return { valid: false, reason: "invalid_key" };
  }

  const body = new URLSearchParams({
    product_id: productId,
    license_key: licenseKey.trim(),
    increment_uses_count: "false"
  });

  const response = await fetchImpl(VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(8000)
  });

  if (!response.ok) throw new Error("Gumroad verification service unavailable");
  const payload = await response.json();
  if (!payload?.success || !payload?.purchase) return { valid: false, reason: "not_verified" };

  const purchase = payload.purchase;
  const correctProduct = purchase.product_id === productId;
  const lostDispute = Boolean(purchase.disputed && !purchase.dispute_won);\n  const endedSubscription = Boolean(purchase.subscription_ended_at || purchase.subscription_cancelled_at || purchase.subscription_failed_at);\n  const revoked = Boolean(purchase.refunded || purchase.partially_refunded || purchase.chargebacked || lostDispute || endedSubscription);
  if (!correctProduct || revoked) return { valid: false, reason: revoked ? "revoked" : "wrong_product" };

  return {
    valid: true,
    productId,
    purchaseId: typeof purchase.sale_id === "string" ? purchase.sale_id : null
  };
}
