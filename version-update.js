import { pageKey } from './classifier.js';

export function createVersionUpdate(api) {
  const current = () => api.runtime.getManifest().version;
  const read = () => api.storage.local.get({ appliedProductVersion: null, pendingProductVersion: null });
  return {
    async installed(details) {
      if (details.reason === 'update' && details.previousVersion !== current()) {
        await api.storage.local.set({ appliedProductVersion: details.previousVersion || null, pendingProductVersion: current() });
      } else if (details.reason === 'install') {
        await api.storage.local.set({ appliedProductVersion: current(), pendingProductVersion: null });
      }
    },
    async status() {
      const saved = await read();
      return { pending: saved.pendingProductVersion === current()
        || Boolean(saved.appliedProductVersion && saved.appliedProductVersion !== current()) };
    },
    async applied() {
      await api.storage.local.set({ appliedProductVersion: current(), pendingProductVersion: null });
    },
  };
}

export function matchesManagedGroup(group, recorded) {
  if (!group || !recorded || typeof recorded !== 'object') return false;
  return recorded.title === group.title && recorded.windowId === group.windowId;
}

export function inferLegacyGroups(tabs, groups, decisions, knownGroupTitles) {
  const managed = {};
  const groupTitles = {};
  for (const group of groups) {
    if (knownGroupTitles[group.id]) continue;
    const members = tabs.filter(tab => tab.groupId === group.id && tab.windowId === group.windowId);
    if (members.length < 2) continue;
    const pages = members.map(tab => pageKey(tab.url)).sort();
    if (pages.some(page => !page)) continue;
    const evidence = decisions.filter(decision => decision.groupId === group.id && decision.title === group.title
      && decision.tabs?.length === members.length
      && JSON.stringify(decision.tabs.map(tab => tab.page).sort()) === JSON.stringify(pages));
    if (!evidence.length || evidence.some(decision => decision.reason === 'manual-selection')) continue;
    for (const tab of members) managed[tab.id] = group.id;
    groupTitles[group.id] = { title: group.title, windowId: group.windowId };
  }
  return { managed, groupTitles };
}

export function planExistingTabs(tabs, groups, managed, groupTitles, manualOverrides = {}) {
  const members = new Map(groups.map(group => [group.id, tabs.filter(tab => tab.groupId === group.id)]));
  const managedGroupIds = groups.filter(group => {
    const groupMembers = members.get(group.id);
    return groupMembers.length > 0 && matchesManagedGroup(group, groupTitles[group.id])
      && groupMembers.every(tab => tab.windowId === group.windowId && managed[tab.id] === group.id);
  }).map(group => group.id);
  const allowed = new Set(managedGroupIds);
  return {
    tabIds: tabs.filter(tab => (tab.groupId === -1 || allowed.has(tab.groupId))
      && !(manualOverrides[tab.id]?.page === pageKey(tab.url)
        && manualOverrides[tab.id]?.groupId === tab.groupId)).map(tab => tab.id),
    managedGroupIds,
    skippedGroups: groups.filter(group => members.get(group.id).length && !allowed.has(group.id)).length,
  };
}
