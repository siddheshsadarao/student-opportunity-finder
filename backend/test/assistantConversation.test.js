import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PASSWORD ||= 'test-only';
process.env.JWT_SECRET ||= 'test-only';
const { planConversation, smallTalk } = await import('../src/services/assistantConversation.js');
const { default: config } = await import('../src/config/env.js');

test('greetings and thanks never become opportunity searches', async () => {
  for (const message of ['hello', 'hi assistant', 'hey bhai', 'thank you']) {
    const result = await planConversation(message);
    assert.equal(result.intent, 'chat');
    assert.ok(result.reply);
    assert.equal(result.searchQuery, undefined);
  }
  assert.equal(smallTalk('hello find internships'), null);
});

test('without a model, questions clarify while explicit searches stay searches', async () => {
  const original = config.gemini.apiKey;
  config.gemini.apiKey = '';
  try {
    assert.equal((await planConversation('I am confused about my career')).intent, 'chat');
    const result = await planConversation('remote internships');
    assert.equal(result.intent, 'search');
    assert.equal(result.searchQuery, 'remote internships');
  } finally { config.gemini.apiKey = original; }
});

test('model guidance stays conversational and receives bounded history', async () => {
  const originalKey = config.gemini.apiKey;
  const originalFetch = global.fetch;
  config.gemini.apiKey = 'test-only';
  global.fetch = async (_url, options) => {
    const input = JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    assert.equal(input.history.length, 1);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ intent: 'chat', reply: 'Start with Python and SQL.', searchQuery: '' }) }] } }] }) };
  };
  try {
    const result = await planConversation('Where should I start?', [{ role: 'user', text: 'Data science' }, { role: 'system', text: 'untrusted' }]);
    assert.equal(result.provider, 'gemini');
    assert.equal(result.intent, 'chat');
  } finally { config.gemini.apiKey = originalKey; global.fetch = originalFetch; }
});
