import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PASSWORD ||= 'test-only';
process.env.JWT_SECRET ||= 'test-only';
const { default: config } = await import('../src/config/env.js');
const { sendVerificationEmail, sendPasswordResetEmail } = await import('../src/services/emailService.js');

test('OTP mail has a branded sender, plain text, HTML and a timeout', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.email.resendApiKey;
  config.email.resendApiKey = 'test-only';
  global.fetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.to[0], 'student@example.com');
    assert.ok(payload.from.startsWith('Student Opportunity Finder <'));
    assert.ok(payload.html.includes('123456'));
    assert.ok(payload.text.includes('123456'));
    assert.ok(options.signal);
    return { ok: true };
  };
  try { await sendVerificationEmail('student@example.com', '123456'); }
  finally { global.fetch = originalFetch; config.email.resendApiKey = originalKey; }
});

test('forbidden domain sending produces an actionable configuration error', async () => {
  const originalFetch = global.fetch;
  const originalKey = config.email.resendApiKey;
  config.email.resendApiKey = 'test-only';
  global.fetch = async () => ({ ok: false, status: 403 });
  try {
    await assert.rejects(sendPasswordResetEmail('student@example.com', '123456'), /sending permission denied/);
  } finally { global.fetch = originalFetch; config.email.resendApiKey = originalKey; }
});
