import { automaticSite, classifyTab, shouldManageTab, siteKey } from './classifier.js';

export function planLegacyCleanup(groups, tabs) {
  const plans = [];
  for (const group of groups) {
    const title = String(group.title || '').trim().toLowerCase();
    const isLocal = title === 'localhost' || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(title);
    const isDomain = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(title);
    if (!isLocal && !isDomain) continue;
    const members = tabs.filter(tab => tab.groupId === group.id);
    if (!members.length) continue;
    const matches = members.filter(tab => siteKey(tab.url) === title);
    const release = isLocal || matches.length < 2
      ? members
      : members.filter(tab => siteKey(tab.url) !== title);
    if (release.length) plans.push({ groupId: group.id, title: group.title, tabIds: release.map(tab => tab.id) });
  }
  return plans;
}

export async function organizeTab(api, tab, rules, managed) {
  const previousGroupId = managed[tab.id] ?? null;
  const auto = automaticSite(tab.url);
  const windowTabs = auto ? await api.tabs.query({ windowId: tab.windowId }) : [];
  const groups = auto ? await api.tabGroups.query({ windowId: tab.windowId }) : [];
  const legacy = auto && groups.find(group => group.id === tab.groupId && group.title === siteKey(tab.url));
  const legacyMembers = legacy && windowTabs.filter(item => item.groupId === legacy.id);
  const safeLegacy = legacyMembers?.length >= 2 && legacyMembers.every(item => automaticSite(item.url)?.site === auto.site);
  if (safeLegacy) {
    await api.tabGroups.update(legacy.id, { title: auto.group, color: auto.color });
    for (const item of legacyMembers) managed[item.id] = legacy.id;
  }
  if (!shouldManageTab(tab, previousGroupId)) {
    if (safeLegacy) return true;
    if (previousGroupId !== null && tab.groupId !== previousGroupId) delete managed[tab.id];
    return false;
  }

  const rule = classifyTab(tab, rules);
  if (!rule) {
    if (auto) {
      const peers = windowTabs.filter(item => automaticSite(item.url)?.site === auto.site
        && shouldManageTab(item, managed[item.id] ?? null) && !classifyTab(item, rules));
      const existing = groups.find(group => group.title === auto.group
        && windowTabs.filter(item => item.groupId === group.id)
          .every(item => automaticSite(item.url)?.site === auto.site));
      if (peers.length >= 2 || existing) {
        const toMove = peers.filter(item => item.groupId !== existing?.id);
        if (toMove.length) {
          const groupId = await api.tabs.group(existing
            ? { tabIds: toMove.map(item => item.id), groupId: existing.id }
            : { tabIds: toMove.map(item => item.id) });
          if (!existing) await api.tabGroups.update(groupId, { title: auto.group, color: auto.color });
          for (const item of toMove) managed[item.id] = groupId;
          return true;
        }
        if (existing && tab.groupId === existing.id) return false;
      }
    }
    if (previousGroupId !== null && tab.groupId === previousGroupId) {
      await api.tabs.ungroup(tab.id);
      delete managed[tab.id];
      return true;
    }
    return false;
  }

  return placeTabInGroup(api, tab, rule, managed);
}

export async function placeTabInGroup(api, tab, rule, managed) {
  const groups = await api.tabGroups.query({ windowId: tab.windowId });
  const existing = groups.find(group => group.title === rule.group && group.color === rule.color)
    ?? groups.find(group => group.title === rule.group);
  if (existing && tab.groupId === existing.id) {
    managed[tab.id] = existing.id;
    return false;
  }

  const groupId = await api.tabs.group(existing ? { tabIds: tab.id, groupId: existing.id } : { tabIds: tab.id });
  if (!existing) await api.tabGroups.update(groupId, { title: rule.group, color: rule.color });
  managed[tab.id] = groupId;
  return true;
}
