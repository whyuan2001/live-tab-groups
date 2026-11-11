import test from 'node:test';
import assert from 'node:assert/strict';

test('one update click reorganizes known automatic groups across windows and preserves manual groups', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  const tabs = new Map([
    [1, { id: 1, windowId: 1, url: 'https://example.com/a', title: 'A', groupId: 7, pinned: false }],
    [2, { id: 2, windowId: 1, url: 'https://example.com/b', title: 'B', groupId: 7, pinned: false }],
    [3, { id: 3, windowId: 2, url: 'https://example.org/a', title: 'C', groupId: 8, pinned: false }],
    [4, { id: 4, windowId: 2, url: 'https://example.org/b', title: 'D', groupId: 8, pinned: false }],
    [5, { id: 5, windowId: 2, url: 'https://manual.com/a', title: 'M', groupId: 9, pinned: false }],
    [6, { id: 6, windowId: 2, url: 'https://custom.com/a', title: 'C1', groupId: 11, pinned: false }],
    [7, { id: 7, windowId: 2, url: 'https://custom.com/b', title: 'C2', groupId: 11, pinned: false }],
  ]);
  const groups = [
    { id: 7, windowId: 1, title: 'Old One', color: 'blue' },
    { id: 8, windowId: 2, title: 'Old Two', color: 'blue' },
    { id: 9, windowId: 2, title: 'My Group', color: 'red' },
    { id: 11, windowId: 2, title: 'User Renamed', color: 'red' },
  ];
  const local = {
    rules: [
      { id: 'a', type: 'site', pattern: 'example.com', group: 'New One', color: 'green' },
      { id: 'b', type: 'site', pattern: 'example.org', group: 'New Two', color: 'green' },
      { id: 'c', type: 'site', pattern: 'custom.com', group: 'New Three', color: 'green' },
    ],
    appliedProductVersion: '0.11.0', autoManaged: { 1: 7, 2: 7, 3: 8, 4: 8, 6: 11, 7: 11 },
    autoGroupTitles: {
      7: { title: 'Old One', windowId: 1 },
      8: { title: 'Old Two', windowId: 2 },
      11: { title: 'Old Three', windowId: 2 },
    },
  };
  const session = { managed: {} };
  let nextGroup = 12;
  globalThis.chrome = {
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'), onAttached: event('attached'),
      async get(id) { return tabs.get(id); },
      async query(query = {}) { return [...tabs.values()].filter(tab =>
        (query.windowId == null || tab.windowId === query.windowId)
        && (query.groupId == null || tab.groupId === query.groupId)); },
      async group({ tabIds, groupId }) {
        const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
        const id = groupId ?? nextGroup++;
        for (const tabId of ids) tabs.get(tabId).groupId = id;
        if (groupId == null) groups.push({ id, windowId: tabs.get(ids[0]).windowId, title: '', color: 'grey' });
        return id;
      },
      async ungroup(id) { tabs.get(id).groupId = -1; },
    },
    tabGroups: {
      async query(query = {}) { return groups.filter(group => query.windowId == null || group.windowId === query.windowId); },
      async update(id, info) { Object.assign(groups.find(group => group.id === id), info); },
    },
    runtime: { getManifest: () => ({ version: '0.12.0' }), onMessage: event('message'), onInstalled: event('installed') },
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await import('../background.js');
    const message = type => new Promise(resolve => listeners.message({ type }, null, resolve));
    assert.equal((await message('updateStatus')).pending, true);
    const result = await message('applyVersionUpdate');
    assert.equal(result.ok, true);
    assert.equal(result.skippedGroups, 2);
    assert.equal(groups.find(group => group.id === tabs.get(1).groupId).title, 'New One');
    assert.equal(groups.find(group => group.id === tabs.get(3).groupId).title, 'New Two');
    assert.equal(tabs.get(5).groupId, 9);
    assert.equal(groups.find(group => group.id === 9).title, 'My Group');
    assert.equal(tabs.get(6).groupId, 11);
    assert.equal(groups.find(group => group.id === 11).title, 'User Renamed');
    assert.equal((await message('updateStatus')).pending, false);
    assert.equal(session.observedTabs?.[1], tabs.get(1).groupId);
    tabs.get(1).groupId = -1;
    listeners.updated(1, { groupId: -1 }, tabs.get(1));
    for (let i = 0; i < 30 && !local.manualOverrides?.[1]; i += 1) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(local.manualOverrides?.[1]?.groupId, -1);
    listeners.installed({ reason: 'update', previousVersion: '0.11.0' });
    for (let i = 0; i < 30 && !(await message('updateStatus')).pending; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal((await message('updateStatus')).pending, true);
    assert.equal((await message('applyVersionUpdate')).ok, true);
    assert.equal(tabs.get(1).groupId, -1);
  } finally {
    console.error = originalError;
    delete globalThis.chrome;
  }
});
