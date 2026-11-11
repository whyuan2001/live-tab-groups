import { recordFeedback, isUserMove } from './feedback-store.js';
import { createRenameCollector } from './rename-collector.js';

export function createFeedbackMonitor(api) {
  const expectedTabs = new Map();
  const expectedGroups = new Map();
  let statePromise;
  let persistQueue = Promise.resolve();
  const renames = createRenameCollector(async ({ groupId, before, after }) => {
    const tabs = await api.tabs.query({ groupId });
    await recordFeedback({ kind: 'group_renamed', source: 'chrome', before, after, groupId, tabs });
  });

  async function load() {
    statePromise ??= (async () => {
      const saved = await api.storage.session.get({ observedTabs: null, observedGroups: null });
      if (saved.observedTabs && saved.observedGroups) return saved;
      const [tabs, groups] = await Promise.all([api.tabs.query({}), api.tabGroups.query({})]);
      const state = {
        observedTabs: Object.fromEntries(tabs.map(tab => [tab.id, tab.groupId ?? -1])),
        observedGroups: Object.fromEntries(groups.map(group => [group.id, group.title || ''])),
      };
      await api.storage.session.set(state);
      return state;
    })();
    return statePromise;
  }

  async function persist(state) {
    persistQueue = persistQueue.catch(() => {}).then(() => api.storage.session.set({
      observedTabs: { ...state.observedTabs }, observedGroups: { ...state.observedGroups },
    }));
    await persistQueue;
  }

  function expectTabMove(tabIds, groupId = '*') {
    for (const id of Array.isArray(tabIds) ? tabIds : [tabIds]) expectedTabs.set(id, groupId);
  }

  function expectGroupRename(groupId, title) { expectedGroups.set(groupId, title); }

  async function tabChanged(tabId, groupId) {
    const state = await load();
    const beforeId = state.observedTabs[tabId];
    const expected = expectedTabs.get(tabId);
    expectedTabs.delete(tabId);
    state.observedTabs[tabId] = groupId;
    await persist(state);
    if (!isUserMove(beforeId, groupId, expected === '*' ? groupId : expected)) return false;
    let tab;
    try { tab = await api.tabs.get(tabId); } catch { return true; }
    const groups = await api.tabGroups.query({ windowId: tab.windowId });
    await recordFeedback({
      kind: 'tab_moved', source: 'chrome',
      before: groups.find(group => group.id === beforeId)?.title || (beforeId === -1 ? '未分组' : `组 ${beforeId}`),
      after: groups.find(group => group.id === groupId)?.title || (groupId === -1 ? '未分组' : `组 ${groupId}`),
      tabs: [tab],
    });
    return true;
  }

  async function groupChanged(group) {
    const state = await load();
    const before = state.observedGroups[group.id];
    const expected = expectedGroups.get(group.id);
    expectedGroups.delete(group.id);
    state.observedGroups[group.id] = group.title || '';
    await persist(state);
    if (expected !== undefined) { renames.cancel(group.id); return; }
    if (before === undefined || before === (group.title || '')) return;
    renames.observe(group.id, before, group.title || '');
  }

  async function refreshWindow(windowId) {
    const state = await load();
    const [tabs, groups] = await Promise.all([
      api.tabs.query({ windowId }), api.tabGroups.query({ windowId }),
    ]);
    for (const tab of tabs) state.observedTabs[tab.id] = tab.groupId ?? -1;
    for (const group of groups) state.observedGroups[group.id] = group.title || '';
    for (const tab of tabs) expectedTabs.delete(tab.id);
    for (const group of groups) expectedGroups.delete(group.id);
    await persist(state);
  }

  async function removeTab(tabId) {
    const state = await load();
    delete state.observedTabs[tabId];
    expectedTabs.delete(tabId);
    await persist(state);
  }

  return { load, expectTabMove, expectGroupRename, tabChanged, groupChanged, refreshWindow, removeTab };
}
