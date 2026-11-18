import http from "node:http";
import { verifyGumroadLicense } from "./gumroad.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Request too large"), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function createApp({ env = process.env, fetchImpl = fetch, now = Date.now } = {}) {
  const rate = new Map();
  const allowedOrigin = env.ALLOWED_ORIGIN || "https://zopair.github.io";

  return http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin === allowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    }
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");

    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    const ip = req.socket.remoteAddress || "unknown";
    const slot = rate.get(ip) || { start: now(), count: 0 };
    if (now() - slot.start > WINDOW_MS) {
      slot.start = now();
      slot.count = 0;
    }
    slot.count += 1;
    rate.set(ip, slot);
    if (slot.count > MAX_REQUESTS_PER_WINDOW) {
      res.writeHead(429, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "rate_limited" }));
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify({
          ok: true,
          service: "agentproof-api",
          licenseVerificationConfigured: Boolean(env.GUMROAD_DIAGNOSIS_PRODUCT_ID || env.GUMROAD_PRODUCT_ID),
        }));
      return;
    }

    if (req.method === "POST" && req.url === "/api/licenses/verify") {
      try {
        const raw = await readBody(req);
        const input = JSON.parse(raw || "{}");
        const result = await verifyGumroadLicense({
          licenseKey: input.licenseKey,
          productId: env.GUMROAD_DIAGNOSIS_PRODUCT_ID || env.GUMROAD_PRODUCT_ID,
          fetchImpl
        });
        res.writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify({ valid: result.valid, reason: result.reason || null }));
      } catch (error) {
        const status = error.statusCode || (error.message.includes("not configured") ? 503 : 502);
        res.writeHead(status, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: status === 503 ? "license_verification_not_configured" : status === 413 ? "request_too_large" : "verification_unavailable" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
  });
}
