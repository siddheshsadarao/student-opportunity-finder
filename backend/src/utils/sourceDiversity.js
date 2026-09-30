/**
 * Round-robin results by source while preserving each source's own ranking.
 *
 * The input should already be sorted by relevance/popularity. Sources are
 * ordered by their best item's position, then we take one item from each in
 * turn. A large feed can therefore add depth without filling the whole page.
 */
export function balanceBySource(items, limit = items.length) {
  const groups = new Map();

  items.forEach((item) => {
    const key = item.isExternal === false ? '__manual__' : item.source || '__manual__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const queues = [...groups.values()];
  const balanced = [];
  let round = 0;

  while (balanced.length < limit) {
    let added = false;
    for (const queue of queues) {
      if (round < queue.length) {
        balanced.push(queue[round]);
        added = true;
        if (balanced.length === limit) break;
      }
    }
    if (!added) break;
    round += 1;
  }

  return balanced;
}

export default balanceBySource;
