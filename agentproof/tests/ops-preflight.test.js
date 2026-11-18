import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHealth, redactUrl } from '../tools/ops-preflight.mjs';

test('classifies a healthy API with email not configured as a partial operational block', () => {
  assert.deepEqual(classifyHealth({ ok: true, licenseVerificationConfigured: true, reportEmailConfigured: false }), {
    status: 'blocked',
    checks: [
      { id: 'api', status: 'pass' },
      { id: 'gumroad', status: 'pass' },
      { id: 'email', status: 'blocked', action: 'Configure RESEND_API_KEY and REPORT_FROM_EMAIL in the API runtime environment.' }
    ]
  });
});

test('classifies a fully configured API as ready', () => {
  assert.equal(classifyHealth({ ok: true, licenseVerificationConfigured: true, reportEmailConfigured: true }).status, 'ready');
});

test('never prints URL credentials or query strings in diagnostics', () => {
  assert.equal(redactUrl('https://user:pass@example.test/path?token=secret'), 'https://example.test/path');
});
