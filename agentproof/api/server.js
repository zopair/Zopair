import http from "node:http";
import { verifyGumroadLicense } from "./gumroad.js";
import { summarizePublicFindings, toDiagnosisCsv } from "../src/scanner.js";

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const RESEND_URL = "https://api.resend.com/emails";

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

function normalizeEmailReport(input) {
  const email = typeof input?.email === "string" ? input.email.trim() : "";
  const licenseKey = typeof input?.licenseKey === "string" ? input.licenseKey.trim() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || licenseKey.length < 8 || licenseKey.length > 512) return null;
  const source = input?.report;
  if (!source || source.format !== "agentproof-diagnosis-v1" || !Array.isArray(source.findings) || source.findings.length > 2000) return null;

  const findings = source.findings.map(item => {
    const sensitive = item?.ruleId === "SEC-001" || item?.ruleId === "SEC-002";
    return {
      ruleId: String(item?.ruleId || "").slice(0, 40),
      severity: ["high", "medium", "low"].includes(item?.severity) ? item.severity : "low",
      title: String(item?.title || "").slice(0, 200),
      file: String(item?.file || "").slice(0, 500),
      line: Number.isInteger(item?.line) && item.line > 0 ? item.line : 0,
      evidence: sensitive ? "[redacted: credential-like source line]" : String(item?.evidence || "").slice(0, 500),
      recommendation: String(item?.recommendation || "Review this finding with the developer who maintains the code.").slice(0, 1200)
    };
  });
  return {
    email,
    licenseKey,
    report: {
      format: "agentproof-diagnosis-v1",
      generatedAt: new Date().toISOString(),
      filesScanned: Number.isInteger(source.filesScanned) && source.filesScanned >= 0 ? source.filesScanned : 0,
      summary: summarizePublicFindings(findings),
      findings
    }
  };
}

async function sendDiagnosisEmail({ email, report, env, fetchImpl }) {
  const apiKey = env.RESEND_API_KEY;
  const fromEmail = env.REPORT_FROM_EMAIL;
  if (!apiKey || !fromEmail) throw Object.assign(new Error("Email delivery is not configured"), { statusCode: 503 });

  const json = JSON.stringify(report, null, 2);
  const csv = toDiagnosisCsv(report.findings);
  const summary = report.summary;
  const text = [
    "Your AgentProof Professional Diagnosis report is attached.",
    "",
    "Files scanned: " + report.filesScanned,
    "Findings: " + summary.total + " (High: " + summary.high + ", Medium: " + summary.medium + ", Low: " + summary.low + ")",
    "",
    "Next step: Share this report with the developer who created or maintains your code and request review and remediation.",
    "Suggested remediation guidance is included per finding. AgentProof does not modify your source code.",
    "",
    "This is a heuristic diagnostic report, not a guarantee or formal security certification."
  ].join("\n");

  const response = await fetchImpl(RESEND_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "AgentProof Reports <" + fromEmail + ">",
      to: [email],
      subject: "Your AgentProof diagnosis report",
      text,
      attachments: [
        { filename: "agentproof-diagnosis.json", content: Buffer.from(json).toString("base64") },
        { filename: "agentproof-diagnosis.csv", content: Buffer.from(csv).toString("base64") }
      ]
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("Email provider rejected the report");
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
          reportEmailConfigured: Boolean(env.RESEND_API_KEY && env.REPORT_FROM_EMAIL)
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

    if (req.method === "POST" && req.url === "/api/reports/email") {
      try {
        const input = JSON.parse(await readBody(req) || "{}");
        const normalized = normalizeEmailReport(input);
        if (!normalized) {
          res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid_report_request" }));
          return;
        }
        const license = await verifyGumroadLicense({
          licenseKey: normalized.licenseKey,
          productId: env.GUMROAD_DIAGNOSIS_PRODUCT_ID || env.GUMROAD_PRODUCT_ID,
          fetchImpl
        });
        if (!license.valid) {
          res.writeHead(403, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "license_not_valid" }));
          return;
        }
        await sendDiagnosisEmail({ ...normalized, env, fetchImpl });
        res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ sent: true }));
      } catch (error) {
        const status = error.statusCode || (error.message.includes("not configured") ? 503 : error.statusCode === 413 ? 413 : 502);
        res.writeHead(status, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: status === 503 ? "email_delivery_not_configured" : status === 413 ? "request_too_large" : "email_delivery_failed" }));
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not_found" }));
  });
}
