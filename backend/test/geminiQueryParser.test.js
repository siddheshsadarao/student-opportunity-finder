import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssistantRequestWithGemini } from '../src/services/geminiQueryParser.js';
import config from '../src/config/env.js';

test('uses local parsing when no Gemini key is configured', async () => {
  const previous = config.gemini.apiKey;
  config.gemini.apiKey = '';
  try {
    const result = await parseAssistantRequestWithGemini('Remote Python internship in Pune');
    assert.equal(result.provider, 'rules');
    assert.equal(result.parsed.location, 'pune');
    assert.equal(result.parsed.mode, 'Remote');
  } finally {
    config.gemini.apiKey = previous;
  }
});

test('accepts bounded Gemini filters but keeps terms grounded in the user query', async () => {
  const previousKey = config.gemini.apiKey;
  const previousFetch = globalThis.fetch;
  config.gemini.apiKey = 'test-key';
  let requestBody;
  globalThis.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ category: 'internship', mode: 'Remote', location: 'Pune', deadlineDays: 7 }) }] } }] }),
    };
  };
  try {
    const result = await parseAssistantRequestWithGemini('Find a remote Python internship in Pune this week');
    assert.equal(result.provider, 'gemini');
    assert.deepEqual(result.parsed, {
      category: 'internship', mode: 'Remote', location: 'Pune', deadlineDays: 7, terms: ['python'],
    });
    assert.match(requestBody.contents[0].parts[0].text, /Python internship/);
    assert.equal(JSON.stringify(requestBody).includes('resume'), false);
  } finally {
    globalThis.fetch = previousFetch;
    config.gemini.apiKey = previousKey;
  }
});
