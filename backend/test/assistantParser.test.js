import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAssistantRequest } from '../src/services/assistantParser.js';

test('parses category and city without treating the city as a keyword requirement', () => {
  assert.deepEqual(parseAssistantRequest('Hackathons in Pune'), {
    category: 'hackathon', mode: null, location: 'pune', deadlineDays: null, terms: [],
  });
});

test('parses skills, mode, location and deadline window together', () => {
  assert.deepEqual(parseAssistantRequest('remote Python internship near Mumbai within a week'), {
    category: 'internship', mode: 'Remote', location: 'mumbai', deadlineDays: 7, terms: ['python'],
  });
});

test('recognizes a city from the live location options without a preposition', () => {
  const result = parseAssistantRequest('Python internship Pune', ['Pune, Maharashtra', 'Remote']);
  assert.equal(result.location, 'Pune');
  assert.equal(result.terms.includes('pune'), false);
  assert.equal(result.terms.includes('python'), true);
});

test('does not invent filters for a broad request', () => {
  assert.deepEqual(parseAssistantRequest('show me opportunities'), {
    category: null, mode: null, location: null, deadlineDays: null, terms: [],
  });
});

test('removes deadline helper words from searchable keywords', () => {
  const result = parseAssistantRequest('data science internship in Pune within 7 days');
  assert.equal(result.location, 'pune');
  assert.equal(result.terms.includes('within'), false);
  assert.equal(result.terms.includes('days'), false);
});
