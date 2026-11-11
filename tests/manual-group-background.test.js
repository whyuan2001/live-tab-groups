import test from 'node:test';
import assert from 'node:assert/strict';

test('multi-select creates a protected group in the background without popup', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const tabs = new Map([
    [1, { id: 1, windowId: 3, url: 'https://one.example/a', title: 'One', groupId: -1, pinned: false }],
    [2, { id: 2, windowId: 3, url: 'https://two.example/b', title: 'Two', groupId: -1, pinned: false }],
  ]);
  const groups = [];
  const local = { rules: [] };
  const session = { managed: {} };
  globalThis.chrome = {
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'), onAttached: event('attached'), onHighlighted: event('highlighted'),
      async get(id) { return tabs.get(id); },
      async query(query) { return [...tabs.values()].filter(tab => (query.windowId == null || tab.windowId === query.windowId) && (query.groupId == null || tab.groupId === query.groupId)); },
      async group({ tabIds }) { for (const id of tabIds) tabs.get(id).groupId = 12; groups.push({ id: 12, windowId: 3, title: '', color: 'grey' }); return 12; },
      async ungroup() { throw new Error('manual group should stay grouped'); },
    },
    tabGroups: {
      async query(query) { return groups.filter(group => query.windowId == null || group.windowId === query.windowId); },
      async update(id, info) { Object.assign(groups.find(group => group.id === id), info); },
    },
    runtime: { onMessage: event('message') },
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    await import('../background.js');
    listeners.highlighted({ windowId: 3, tabIds: [1, 2] });
    await new Promise(resolve => setTimeout(resolve, 750));
    assert.deepEqual([...tabs.values()].map(tab => tab.groupId), [12, 12]);
    assert.equal(groups[0].title, 'One 等2页');
    assert.equal(Object.values(local).find(value => value.stream === 'decisions')?.record.reason, 'manual-selection');
    assert.deepEqual(session.managed, {});
  } finally {
    console.warn = originalWarn;
    delete globalThis.chrome;
  }
});
