import { automaticSite, siteKey } from './classifier.js';

function titleStem(title) {
  return String(title || '').trim().replace(/\s+/g, ' ')
    .split(/\s*[|｜·•：:]\s*|\s+[—–-]\s+/)[0].trim();
}

export function nameSelectedGroup(tabs) {
  const sites = tabs.map(tab => automaticSite(tab.url));
  if (sites[0] && sites.every(site => site?.site === sites[0].site)) {
    return { title: sites[0].group, color: sites[0].color };
  }
  const stems = tabs.map(tab => titleStem(tab.title));
  if (stems[0]?.length >= 2 && stems.every(stem => stem.toLowerCase() === stems[0].toLowerCase())) {
    return { title: stems[0].slice(0, 24), color: 'blue' };
  }
  const firstSite = siteKey(tabs[0].url)?.split('.')[0];
  const lead = stems[0] || firstSite || '选中网页';
  return { title: `${lead.slice(0, 18)} 等${tabs.length}页`, color: 'blue' };
}

export async function groupSelectedTabs(api, tabIds) {
  const ids = [...new Set(tabIds)];
  if (ids.length < 2) throw new Error('请先选中至少两个网页标签');
  const tabs = await Promise.all(ids.map(id => api.tabs.get(id)));
  const windowId = tabs[0].windowId;
  if (tabs.some(tab => tab.windowId !== windowId)) throw new Error('只能合并同一窗口中的网页');
  if (tabs.some(tab => tab.pinned || (tab.groupId ?? -1) !== -1)) {
    throw new Error('只能合并未分组、未固定的标签');
  }
  const { title, color } = nameSelectedGroup(tabs);
  const groupId = await api.tabs.group({ tabIds: ids });
  await api.tabGroups.update(groupId, { title, color });
  return { groupId, windowId, title, tabs };
}
