import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export async function checkUrl(value, fetchImpl = fetch) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { url: value, ok: false, error: "Invalid URL" };
  }

  if (url.protocol !== "https:") {
    return { url: value, ok: false, error: "Only HTTPS URLs are allowed" };
  }

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    return {
      url: value,
      finalUrl: response.url || url.href,
      status: response.status,
      ok: response.ok,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    };
  } catch (error) {
    return {
      url: value,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const configPath = fileURLToPath(new URL("./demo-links.json", import.meta.url));
  const entries = JSON.parse(await readFile(configPath, "utf8"));
  const results = await Promise.all(
    entries.map(async ({ name, url }) => ({
      name,
      ...(await checkUrl(url)),
    })),
  );

  for (const result of results) {
    const state = result.ok ? "PASS" : "FAIL";
    const detail = result.status ? `HTTP ${result.status}` : result.error;
    process.stdout.write(`[${state}] ${result.name}: ${detail}\n`);
  }

  const failed = results.filter((result) => !result.ok);
  process.stdout.write(`\nChecked ${results.length} demo URLs; ${failed.length} failed.\n`);
  if (failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
