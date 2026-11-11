import test from 'node:test';
import assert from 'node:assert/strict';
import { createHighlightGrouper } from '../highlight-grouper.js';

test('highlighted tabs group after the selection settles, without a popup click', async () => {
  const callbacks = [];
  const timers = new Map();
  let nextId = 0;
  const selected = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const grouper = createHighlightGrouper({
    query: async () => selected,
    group: async ids => callbacks.push(ids),
    setTimer: callback => { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimer: id => timers.delete(id),
  });
  grouper.onHighlighted({ windowId: 4, tabIds: [1, 2] });
  grouper.onHighlighted({ windowId: 4, tabIds: [1, 2, 3] });
  assert.equal(timers.size, 1);
  await [...timers.values()][0]();
  assert.deepEqual(callbacks, [[1, 2, 3]]);
});

test('selection changed before the timer fires does not create a group', async () => {
  const callbacks = [];
  let timer;
  const grouper = createHighlightGrouper({
    query: async () => [{ id: 1 }],
    group: async ids => callbacks.push(ids),
    setTimer: callback => { timer = callback; return 1; },
    clearTimer: () => {},
  });
  grouper.onHighlighted({ windowId: 4, tabIds: [1, 2] });
  await timer();
  assert.deepEqual(callbacks, []);
});
