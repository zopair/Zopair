import test from "node:test";
import assert from "node:assert/strict";
import { checkUrl } from "./check-demo-links.mjs";

test("accepts a successful HTTPS response", async () => {
  const result = await checkUrl("https://example.com", async () => ({
    ok: true,
    status: 200,
    url: "https://example.com/",
  }));

  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
});

test("reports non-success HTTP responses", async () => {
  const result = await checkUrl("https://example.com/missing", async () => ({
    ok: false,
    status: 404,
    url: "https://example.com/missing",
  }));

  assert.equal(result.ok, false);
  assert.equal(result.status, 404);
});

test("rejects non-HTTPS and malformed URLs without making a request", async () => {
  let requested = false;
  const fakeFetch = async () => {
    requested = true;
    throw new Error("fetch should not run");
  };

  const insecure = await checkUrl("http://example.com", fakeFetch);
  const malformed = await checkUrl("not a URL", fakeFetch);

  assert.equal(insecure.ok, false);
  assert.equal(malformed.ok, false);
  assert.equal(requested, false);
});

test("converts network errors into a failed result", async () => {
  const result = await checkUrl("https://example.com", async () => {
    throw new Error("connection refused");
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /connection refused/);
});
