import test from 'node:test';
import assert from 'node:assert/strict';

test('URL update groups an ungrouped tab without touching a manual group', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const tabs = new Map([
    [1, { id: 1, windowId: 1, url: 'https://example.com/a', title: 'A', pinned: false, groupId: -1 }],
    [2, { id: 2, windowId: 1, url: 'https://example.com/b', title: 'B', pinned: false, groupId: 9 }],
  ]);
  const groups = [{ id: 9, windowId: 1, title: '手动分组', color: 'blue' }];
  const local = { enabled: true, rules: [{ id: 'r', type: 'site', pattern: 'example.com', group: '项目', color: 'red' }] };
  const session = { managed: {} };
  globalThis.chrome = {
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'), onAttached: event('attached'),
      async get(id) { return tabs.get(id); },
      async group({ tabIds, groupId }) { const id = groupId ?? 10; tabs.get(tabIds).groupId = id; return id; },
      async ungroup(id) { tabs.get(id).groupId = -1; },
      async query() { return [...tabs.values()]; },
    },
    tabGroups: {
      async query() { return groups; },
      async update(id, info) { groups.push({ id, windowId: 1, ...info }); },
    },
    runtime: { onMessage: event('message') },
  };
  await import('../background.js');
  listeners.updated(1, { url: tabs.get(1).url }, tabs.get(1));
  listeners.updated(2, { url: tabs.get(2).url }, tabs.get(2));
  for (let i = 0; i < 30 && tabs.get(1).groupId === -1; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(tabs.get(1).groupId, 10);
  assert.equal(tabs.get(2).groupId, 9);
  assert.deepEqual(groups.find(group => group.id === 10), { id: 10, windowId: 1, title: '项目', color: 'red' });
  delete globalThis.chrome;
});
