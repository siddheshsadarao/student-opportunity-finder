import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('resume signatures match allowed extensions, not client MIME claims', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'sof-signature-test-'));
  process.env.RESUME_STORAGE_DIR = temp;
  try {
    const { validResumeSignature } = await import('../src/middleware/resumeUpload.js');
    for (const [extension, header] of [
      ['.pdf', Buffer.from('%PDF-1.7')], ['.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
      ['.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
      ['.jpg', Buffer.from([0xff, 0xd8, 0xff])], ['.jpeg', Buffer.from([0xff, 0xd8, 0xff])],
      ['.webp', Buffer.from('RIFF0000WEBP')],
    ]) {
      assert.equal(validResumeSignature(extension, header), true, extension);
      assert.equal(validResumeSignature(extension, Buffer.from('<html>')), false, extension);
    }
    assert.equal(validResumeSignature('.svg', Buffer.from('<svg>')), false);
    assert.equal(validResumeSignature('.webp', Buffer.from('RIFF0000WAVE')), false);
    assert.equal(validResumeSignature('.png', Buffer.alloc(0)), false);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
