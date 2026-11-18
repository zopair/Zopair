import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHealth, redactUrl } from '../tools/ops-preflight.mjs';

test('classifies a healthy API as ready without any email provider configuration', () => {
  assert.deepEqual(classifyHealth({ ok: true, licenseVerificationConfigured: true }), {
    status: 'ready',
    checks: [
      { id: 'api', status: 'pass' },
      { id: 'gumroad', status: 'pass' }
    ]
  });
});

test('blocks diagnosis verification when the Gumroad product is not configured', () => {
  assert.equal(classifyHealth({ ok: true, licenseVerificationConfigured: false }).status, 'blocked');
});

test('never prints URL credentials or query strings in diagnostics', () => {
  assert.equal(redactUrl('https://user:pass@example.test/path?token=secret'), 'https://example.test/path');
});
