import { spawnSync } from 'node:child_process';

const API_BASE = process.env.AGENTPROOF_API_URL || 'https://hlzptpre.basicdeploy.com';
const SITE_URL = process.env.AGENTPROOF_SITE_URL || 'https://zopair.github.io/Zopair/';

export function redactUrl(value) {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, url.pathname === '/' ? '' : '/');
  } catch {
    return '[invalid-url]';
  }
}

export function classifyHealth(health) {
  const checks = [
    { id: 'api', status: health?.ok === true ? 'pass' : 'fail' },
    { id: 'gumroad', status: health?.licenseVerificationConfigured === true ? 'pass' : 'fail' }
  ];
  return { status: checks.every((item) => item.status === 'pass') ? 'ready' : 'blocked', checks };
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120_000 });
  return {
    status: result.status === 0 ? 'pass' : 'fail',
    exitCode: result.status ?? 1,
    output: (result.stdout || '').trim().slice(-4000),
    error: (result.stderr || '').trim().slice(-2000)
  };
}

async function checkUrl(url, expected) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: 'follow' });
    return { target: redactUrl(url), status: response.ok && expected(response) ? 'pass' : 'fail', httpStatus: response.status };
  } catch (error) {
    return { target: redactUrl(url), status: 'fail', error: error.name || 'NetworkError' };
  }
}

async function main() {
  const checks = {
    tests: run('npm', ['test']),
    syntax: run('npm', ['run', 'check']),
    site: await checkUrl(SITE_URL, (response) => response.status === 200),
    api: null
  };

  try {
    const response = await fetch(`${API_BASE.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(12_000) });
    const health = response.ok ? await response.json() : null;
    checks.api = { httpStatus: response.status, ...classifyHealth(health) };
  } catch (error) {
    checks.api = { status: 'blocked', error: error.name || 'NetworkError' };
  }

  const required = [checks.tests.status, checks.syntax.status, checks.site.status, checks.api.checks?.[0]?.status, checks.api.checks?.[1]?.status];
  const result = { tool: 'AgentProof Ops Preflight', generatedAt: new Date().toISOString(), status: required.every((item) => item === 'pass') ? checks.api.status : 'blocked', checks };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== 'ready') process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
