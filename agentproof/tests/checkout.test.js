import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const DIAGNOSIS_URL = "https://zopair.gumroad.com/l/ctoshy";

test("main page directs paid diagnosis CTAs to the published diagnosis product", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, new RegExp(DIAGNOSIS_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Unlock (?:the )?full diagnosis[^<]*|Unlock diagnosis[^<]*/i);
  assert.doesNotMatch(html, /NEW DIAGNOSIS PRODUCT · NOT YET PUBLISHED|DIAGNOSIS CHECKOUT · ACTIVATION IN PROGRESS/);
});

test("documentation describes the diagnosis product as published and links to checkout", async () => {
  const html = await readFile(new URL("../docs.html", import.meta.url), "utf8");
  assert.ok(html.includes(DIAGNOSIS_URL));
  assert.doesNotMatch(html, /draft created in Gumroad but not published yet|draft product is being separated/i);
});
