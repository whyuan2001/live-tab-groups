const WEB_PROTOCOLS = new Set(['http:', 'https:']);
const PRIORITY = { page: 3, site: 2, title: 1 };

export function pageKey(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!WEB_PROTOCOLS.has(url.protocol)) return null;
    return `${url.origin}${url.pathname}`;
  } catch {
    return null;
  }
}

export function siteKey(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return WEB_PROTOCOLS.has(url.protocol) ? url.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

const SITE_NAMES = {
  'figma.com': ['Figma', 'purple'],
  'github.com': ['GitHub', 'grey'],
  'feishu.cn': ['飞书', 'blue'],
  'notion.so': ['Notion', 'grey'],
  'yuque.com': ['语雀', 'green'],
};

export function automaticSite(rawUrl) {
  const host = siteKey(rawUrl)?.replace(/^www\./, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.includes(':')) return null;
  const known = Object.entries(SITE_NAMES).find(([domain]) => host === domain || host.endsWith(`.${domain}`));
  if (known) return { site: known[0], group: known[1][0], color: known[1][1] };
  const parts = host.split('.');
  if (parts.length < 2) return null;
  const name = parts.at(-2);
  if (!name || name.length < 2) return null;
  return { site: host, group: name[0].toUpperCase() + name.slice(1), color: 'blue' };
}

export function createRule(tab, type, group, color, keyword = '') {
  const name = String(group || '').trim();
  if (!name) throw new Error('标签组名称不能为空');
  const pattern = type === 'page' ? pageKey(tab.url) : type === 'site' ? siteKey(tab.url) : type === 'title' ? String(keyword).trim().toLowerCase() : null;
  if (!pattern) throw new Error('当前网页无法创建该范围的规则');
  return { id: crypto.randomUUID(), type, pattern, group: name, color, createdAt: Date.now() };
}

export function classifyTab(tab, rules = []) {
  const page = pageKey(tab.url);
  if (!page) return null;
  const site = siteKey(tab.url);
  const title = String(tab.title || '').toLowerCase();
  let best = null;
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const pattern = String(rule.pattern || '').toLowerCase();
    const matches = rule.type === 'page' ? page.toLowerCase() === pattern
      : rule.type === 'site' ? site === pattern
      : rule.type === 'title' ? Boolean(pattern) && title.includes(pattern)
      : false;
    if (!matches) continue;
    if (!best || PRIORITY[rule.type] > PRIORITY[best.rule.type] || (PRIORITY[rule.type] === PRIORITY[best.rule.type] && i > best.index)) {
      best = { rule, index: i };
    }
  }
  return best?.rule || null;
}

export function shouldManageTab(tab, managedGroupId) {
  if (!tab || tab.pinned || !pageKey(tab.url)) return false;
  const groupId = tab.groupId ?? -1;
  return groupId === -1 || groupId === managedGroupId;
}
