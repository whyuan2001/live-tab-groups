import test from 'node:test';
import assert from 'node:assert/strict';

test('a tab dragged into a window joins same-site peers without moving manual groups', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const tabs = new Map([
    [1, { id: 1, windowId: 2, url: 'https://www.figma.com/file/a', title: 'A', groupId: -1 }],
    [2, { id: 2, windowId: 2, url: 'https://www.figma.com/file/b', title: 'B', groupId: -1 }],
    [3, { id: 3, windowId: 2, url: 'https://other.com', title: 'Other', groupId: 8 }],
  ]);
  const groups = [{ id: 8, windowId: 2, title: '手动组', color: 'blue' }];
  const local = { enabled: false, rules: [] }; // The removed popup setting must not disable grouping.
  const session = { managed: { 1: 77 } }; // Old window's group ID cannot follow the tab.
  globalThis.chrome = {
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'), onAttached: event('attached'),
      async get(id) { return tabs.get(id); },
      async query(query) { return [...tabs.values()].filter(tab => (query.windowId == null || tab.windowId === query.windowId) && (query.groupId == null || tab.groupId === query.groupId)); },
      async group({ tabIds, groupId }) {
        const id = groupId ?? 10;
        for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) tabs.get(tabId).groupId = id;
        if (!groups.some(group => group.id === id)) groups.push({ id, windowId: 2, title: '', color: 'grey' });
        return id;
      },
      async ungroup(tabIds) { for (const id of Array.isArray(tabIds) ? tabIds : [tabIds]) tabs.get(id).groupId = -1; },
    },
    tabGroups: {
      async query(query) { return groups.filter(group => query.windowId == null || group.windowId === query.windowId); },
      async update(id, info) { Object.assign(groups.find(group => group.id === id), info); },
    },
    runtime: { onMessage: event('message') },
  };
  try {
    await import('../background.js');
    assert.equal(typeof listeners.attached, 'function');
    listeners.attached(1, { newWindowId: 2, newPosition: 1 });
    for (let i = 0; i < 30 && tabs.get(1).groupId === -1; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(tabs.get(1).groupId, 10);
    assert.equal(tabs.get(2).groupId, 10);
    assert.equal(tabs.get(3).groupId, 8);
    assert.equal(groups.find(group => group.id === 10).title, 'Figma');
  } finally { delete globalThis.chrome; }
});
