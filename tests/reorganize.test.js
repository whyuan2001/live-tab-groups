import test from 'node:test';
import assert from 'node:assert/strict';

test('reorganize button releases a mixed legacy IP group', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const tabs = new Map([
    [1, { id: 1, windowId: 1, url: 'http://127.0.0.1:3000/jobs', title: '招聘', groupId: 7, pinned: false }],
    [2, { id: 2, windowId: 1, url: 'http://127.0.0.1:4000/billing', title: '计费', groupId: 7, pinned: false }],
    [3, { id: 3, windowId: 1, url: 'https://careers.pdd.com/jobs', title: '拼多多招聘', groupId: 7, pinned: false }],
  ]);
  const groups = [{ id: 7, windowId: 1, title: '127.0.0.1', color: 'green' }];
  const local = { enabled: true, rules: [] };
  const session = { managed: {} };
  globalThis.chrome = {
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'), onAttached: event('attached'),
      async get(id) { return tabs.get(id); },
      async query(query) { return [...tabs.values()].filter(tab => (query.windowId == null || tab.windowId === query.windowId) && (query.groupId == null || tab.groupId === query.groupId)); },
      async group() { throw new Error('no group expected'); },
      async ungroup(ids) {
        for (const id of Array.isArray(ids) ? ids : [ids]) tabs.get(id).groupId = -1;
        if (![...tabs.values()].some(tab => tab.groupId === 7)) groups.length = 0;
      },
    },
    tabGroups: { async query(query) { return groups.filter(group => query.windowId == null || group.windowId === query.windowId); } },
    runtime: { onMessage: event('message') },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await import('../background.js');
    const response = await new Promise(resolve => listeners.message({ type: 'organizeWindow', windowId: 1 }, null, resolve));
    assert.equal(response.ok, true);
    assert.equal(response.changed, 3);
    assert.deepEqual([...tabs.values()].map(tab => tab.groupId), [-1, -1, -1]);
  } finally {
    console.error = originalError;
    delete globalThis.chrome;
  }
});
