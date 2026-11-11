import { countDecisions, countFeedback, listDecisions, listFeedback, listFeedbackAfter, listDecisionsAfter } from './feedback-store.js';
import { describeEventOrigin, releases } from './history-model.js';

const $ = selector => document.querySelector(selector);
const labels = { rule_saved: '纠正分类', rule_removed: '删除规则', group_renamed: '改写组名', group_reorganized: '拆分错误旧组', tab_moved: '移动标签页', manual_group_created: '手动建组', setting_changed: '设置变化' };
let loaded = [];
let offset = 0;
const PAGE_SIZE = 50;
renderReleases();

async function renderRules() {
  const container = $('#rules');
  const response = await chrome.runtime.sendMessage({ type: 'state' });
  if (!response?.ok) throw new Error(response?.error || '无法读取规则');
  container.replaceChildren();
  if (!response.rules.length) { container.textContent = '暂无纠正规则。'; return; }
  for (const rule of [...response.rules].reverse()) {
    const article = document.createElement('article');
    article.className = 'ruleRow';
    const title = document.createElement('strong');
    title.textContent = rule.group || '未命名组';
    const scope = document.createElement('small');
    scope.textContent = `${rule.type || '未知范围'} · ${rule.pattern || '无匹配条件'}`;
    article.append(title, scope);
    container.append(article);
  }
}

function renderReleases() {
  const container = $('#releases');
  container.replaceChildren();
  for (const release of releases) {
    const article = document.createElement('article');
    article.className = 'event release';
    const title = document.createElement('strong');
    title.textContent = `产品版本 ${release.version} · ${release.status}`;
    const summary = document.createElement('p');
    summary.textContent = release.summary;
    const versions = document.createElement('p');
    versions.className = 'meta';
    versions.textContent = `分组策略 ${release.groupingVersion} · 命名策略 ${release.namingVersion}`;
    article.append(title, summary, versions);
    container.append(article);
  }
}

async function renderDecisions() {
  const container = $('#decisions');
  const decisions = await listDecisions();
  container.replaceChildren();
  if (!decisions.length) { container.textContent = '暂无自动分组决策记录。'; return; }
  for (const decision of decisions.slice(-50).reverse()) {
    const article = document.createElement('article');
    article.className = 'event';
    const title = document.createElement('strong');
    title.textContent = decision.title || '未命名组';
    const context = document.createElement('p');
    context.className = 'meta';
    const time = decision.time ? new Date(decision.time).toLocaleString('zh-CN') : '时间未记录';
    context.textContent = `${time} · ${decision.tabs?.length || 0} 个网页 · 分组策略 ${decision.groupingVersion || decision.strategyVersion || '旧版未标注'} · 命名策略 ${decision.namingVersion || '旧版未标注'}`;
    article.append(title, context);
    container.append(article);
  }
}

function render() {
  const container = $('#events');
  container.replaceChildren();
  const selected = $('#kind').value;
  const events = selected ? loaded.filter(event => event.kind === selected) : loaded;
  if (!events.length) { container.textContent = loaded.length ? '当前筛选没有记录。' : '还没有修改记录。'; return; }
  for (const event of events) {
    const article = document.createElement('article');
    article.className = 'event';
    const head = document.createElement('div');
    head.className = 'eventHeader';
    const kind = document.createElement('span');
    kind.textContent = `${labels[event.kind] || event.kind} · ${describeEventOrigin(event)}`;
    const time = document.createElement('time');
    time.dateTime = event.time;
    time.textContent = new Date(event.time).toLocaleString('zh-CN');
    head.append(kind, time);
    const change = document.createElement('div');
    change.className = 'change';
    const before = document.createElement('span');
    before.className = 'before';
    before.textContent = event.before || '—';
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '→';
    const after = document.createElement('strong');
    after.textContent = event.after || '—';
    change.append(before, arrow, after);
    const meta = document.createElement('div');
    meta.className = 'meta';
    const tabInfo = event.tabs?.map(tab => `${tab.title || '网页'} (${tab.site || '内部页面'})`).join('、');
    meta.textContent = [event.scope && `范围：${event.scope}`, tabInfo, event.note].filter(Boolean).join(' · ');
    article.append(head, change, meta);
    container.append(article);
  }
}

async function loadMore() {
  const page = await listFeedback(PAGE_SIZE, offset);
  loaded.push(...page);
  offset += page.length;
  $('#more').hidden = page.length < PAGE_SIZE;
  render();
}

$('#kind').addEventListener('change', async () => {
  if ($('#kind').value && !$('#more').hidden) {
    loaded = await listFeedback(await countFeedback());
    offset = loaded.length;
    $('#more').hidden = true;
  }
  render();
});
$('#more').addEventListener('click', () => loadMore().catch(error => { $('#status').textContent = error.message; }));
async function renderSyncStatus() {
  const saved = await chrome.storage.local.get(null);
  const cursor = saved.nativeSyncCursor || { events: 0, decisions: 0 };
  const emergencyCount = Object.keys(saved).filter(key => key.startsWith('feedbackFallback:')).length;
  const [pendingEvents, pendingDecisions] = await Promise.all([
    listFeedbackAfter(cursor.events || 0, 1), listDecisionsAfter(cursor.decisions || 0, 1),
  ]);
  const status = saved.nativeSyncStatus;
  if (emergencyCount) {
    $('#syncStatus').textContent = `${emergencyCount} 条记录已在 Chrome 应急暂存，正在自动恢复并同步。`;
  } else if (status?.state === 'retrying') {
    $('#syncStatus').textContent = `本机同步稍后自动重试；Chrome 中的记录已保留。原因：${status.error}`;
  } else if (pendingEvents.length || pendingDecisions.length) {
    $('#syncStatus').textContent = '有新记录待自动同步；Chrome 中的记录已保留。';
  } else if (status?.state === 'ok') {
    $('#syncStatus').textContent = `已自动同步 · ${new Date(status.time).toLocaleString('zh-CN')}`;
  } else {
    $('#syncStatus').textContent = '尚无同步状态；记录仍保存在 Chrome 中。';
  }
}
chrome.storage.onChanged?.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key === 'nativeSyncStatus' || key === 'nativeSyncCursor' || key.startsWith('feedbackFallback:'))) renderSyncStatus().catch(console.error);
});
renderSyncStatus().catch(error => { $('#syncStatus').textContent = `无法检查同步状态：${error.message}`; });
chrome.runtime.sendMessage({ type: 'syncNow' }).catch(() => {}).finally(() => renderSyncStatus().catch(console.error));
$('#export').addEventListener('click', async () => {
  try {
    const [events, decisions] = await Promise.all([listFeedback(await countFeedback()), listDecisions()]);
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 2, exportedAt: new Date().toISOString(), events, decisions }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `live-tab-groups-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { $('#status').textContent = error.message; }
});

Promise.all([countFeedback(), countDecisions(), loadMore()]).then(([count, decisions]) => {
  $('#total').textContent = String(count);
  $('#decisionTotal').textContent = String(decisions);
}).catch(error => { $('#status').textContent = error.message; });
renderRules().catch(error => { $('#rules').textContent = `无法读取规则：${error.message}`; });
renderDecisions().catch(error => { $('#decisions').textContent = `无法读取自动决策：${error.message}`; });
