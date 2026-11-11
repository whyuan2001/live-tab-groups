import { organizeTab, planLegacyCleanup } from './manager.js';

async function evaluateOne(fixture) {
  const tabs = fixture.tabs.map(tab => ({ windowId: 1, groupId: -1, pinned: false, ...tab }));
  const groups = (fixture.groups || []).map(group => ({ windowId: 1, color: 'blue', ...group }));
  let nextGroupId = Math.max(0, ...groups.map(group => group.id)) + 1;
  const removeEmptyGroups = () => {
    for (let i = groups.length - 1; i >= 0; i -= 1) {
      if (!tabs.some(tab => tab.groupId === groups[i].id)) groups.splice(i, 1);
    }
  };
  const api = {
    tabs: {
      async query({ windowId }) { return tabs.filter(tab => tab.windowId === windowId); },
      async group({ tabIds, groupId }) {
        const id = groupId ?? nextGroupId++;
        if (groupId == null) groups.push({ id, windowId: 1, title: '', color: 'grey' });
        for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) tabs.find(tab => tab.id === tabId).groupId = id;
        removeEmptyGroups();
        return id;
      },
      async ungroup(tabIds) {
        for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) tabs.find(tab => tab.id === tabId).groupId = -1;
        removeEmptyGroups();
      },
    },
    tabGroups: {
      async query({ windowId }) { return groups.filter(group => group.windowId === windowId); },
      async update(id, info) { Object.assign(groups.find(group => group.id === id), info); },
    },
  };
  const managed = {};
  if (fixture.reorganize) {
    for (const plan of planLegacyCleanup(groups, tabs)) await api.tabs.ungroup(plan.tabIds);
  }
  for (const tab of tabs) await organizeTab(api, tab, fixture.rules || [], managed);
  const normalizeGroups = items => items.map(group => ({ title: group.title, tabIds: [...group.tabIds].sort((a, b) => a - b) }))
    .sort((a, b) => a.title.localeCompare(b.title));
  return {
    groups: normalizeGroups(groups.map(group => ({ title: group.title, tabIds: tabs.filter(tab => tab.groupId === group.id).map(tab => tab.id) }))),
    ungrouped: tabs.filter(tab => tab.groupId === -1).map(tab => tab.id).sort((a, b) => a - b),
  };
}

export async function evaluateCases(fixtures) {
  const failures = [];
  for (const fixture of fixtures) {
    try {
      const actual = await evaluateOne(fixture);
      const expected = {
        groups: fixture.expected.groups.map(group => ({ title: group.title, tabIds: [...group.tabIds].sort((a, b) => a - b) })).sort((a, b) => a.title.localeCompare(b.title)),
        ungrouped: [...fixture.expected.ungrouped].sort((a, b) => a - b),
      };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push({ id: fixture.id, expected, actual });
    } catch (error) { failures.push({ id: fixture.id, error: error.message }); }
  }
  return { total: fixtures.length, passed: fixtures.length - failures.length, failures };
}
