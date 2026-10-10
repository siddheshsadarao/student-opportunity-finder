import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDeadline, deadlineLabel } from '../../frontend/src/utils/format.js';

test('deadline display keeps published time in IST without inventing a cutoff', () => {
  assert.match(formatDeadline('2026-10-09T18:29:00Z'), /11:59.*pm IST/i);
  assert.doesNotMatch(formatDeadline('2026-10-09'), /IST|am|pm/);
  assert.equal(formatDeadline(null), 'Check closing date on source website');
  assert.equal(formatDeadline('bad-date'), 'Check closing date on source website');
  assert.equal(deadlineLabel(null), 'Check deadline');
  assert.equal(deadlineLabel('2000-01-01T00:00:00Z'), 'Closed');
});
