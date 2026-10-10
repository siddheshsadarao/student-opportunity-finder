import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceBySource } from '../src/utils/sourceDiversity.js';

test('large sources do not displace other available providers in the first round', () => {
  const items = Array.from({ length: 30 }, (_, id) => ({ id, source: 'unstop', isExternal: true }));
  items.push({ id: 31, source: 'devfolio', isExternal: true }, { id: 32, source: 'greenhouse', isExternal: true });
  assert.deepEqual(balanceBySource(items, 3).map((item) => item.source), ['unstop', 'devfolio', 'greenhouse']);
});
