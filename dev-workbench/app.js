import { mergeRecords, filterRecords, groupRecordsByDay } from './model.js';

const $ = selector => document.querySelector(selector);
let snapshot;
let records = [];
const requestedFilter = new URLSearchParams(location.search).get('filter');
const activeFilter = ['event', 'decision'].includes(requestedFilter) ? requestedFilter : 'all';

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function detailRow(list, label, value) {
  if (value === null || value === undefined || value === '') return;
  list.append(element('dt', '', label), element('dd', '', value));
}

function formatTime(time) {
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

const eventNames = {
  group_renamed: '标签组改名', group_reorganized: '标签组调整', tab_moved: '标签移动', manual_group_created: '手动建组',
  rule_saved: '保存规则', rule_removed: '删除规则', setting_changed: '设置变更',
};
const decisionReasons = { 'same-site': '同网站自动分组', 'manual-selection': '多选后自动命名' };

function renderRecord({ type, item }) {
  const details = element('details', 'record');
  const summary = element('summary');
  const isDecision = type === 'decision';
  summary.append(
    element('span', 'recordType', isDecision ? '自动决策' : '操作记录'),
    element('span', 'recordTitle', isDecision ? (item.title || '未命名标签组') : (eventNames[item.kind] || item.kind || '操作')),
    element('time', 'recordTime', formatTime(item.time)),
  );
  const body = element('div', 'recordBody');
  const list = element('dl');
  detailRow(list, '分组', isDecision ? item.title : `${item.before ?? '—'} → ${item.after ?? '—'}`);
  if (isDecision) detailRow(list, '原因', decisionReasons[item.reason] || item.reason || '自动分组');
  else detailRow(list, '记录通道', `${item.source || '未知'} · 操作者未确认`);
  detailRow(list, '分组策略', item.groupingVersion);
  detailRow(list, '命名策略', item.namingVersion);
  detailRow(list, '网页数量', item.tabs?.length ?? 0);
  body.append(list);
  if (item.tabs?.length) {
    const tabs = element('ul', 'tabList');
    for (const tab of item.tabs) tabs.append(element('li', '', tab.title || tab.site || tab.page || '未命名网页'));
    body.append(tabs);
  }
  details.append(summary, body);
  return details;
}

function renderActivity() {
  const filtered = filterRecords(records, activeFilter);
  const shown = filtered.slice(0, 100);
  $('#listCount').textContent = `显示 ${shown.length} / ${filtered.length} 条`;
  const list = $('#activityList');
  list.replaceChildren();
  if (!shown.length) { list.append(element('p', 'empty', '暂无记录。')); return; }
  for (const [index, group] of groupRecordsByDay(shown).entries()) {
    const day = element('details', 'dayGroup');
    if (index === 0) day.open = true;
    day.append(element('summary', '', `${group.day} · ${group.entries.length} 条`));
    const entries = element('div', 'dayEntries');
    for (const record of group.entries) entries.append(renderRecord(record));
    day.append(entries);
    list.append(day);
  }
}

function renderReleases(releases) {
  const container = $('#releases');
  container.replaceChildren();
  for (const item of releases) {
    const row = element('div', 'release');
    const info = element('div');
    info.append(element('p', '', item.summary), element('small', '', `${item.status} · 分组策略 ${item.groupingVersion} · 命名策略 ${item.namingVersion}`));
    row.append(element('strong', 'releaseVersion', item.version), info);
    container.append(row);
  }
}

async function load() {
  const response = await fetch('/api/data', { cache: 'no-store' });
  if (!response.ok) throw new Error(`读取失败（${response.status}）`);
  snapshot = await response.json();
  records = mergeRecords(snapshot.events, snapshot.decisions);
  $('#eventCount').textContent = String(snapshot.events.length);
  $('#decisionCount').textContent = String(snapshot.decisions.length);
  $('#currentVersion').textContent = snapshot.releases[0]?.version || '—';
  $('#collectedCount').textContent = String(snapshot.events.length + snapshot.decisions.length);
  $('#candidateCount').textContent = String(snapshot.workflow.candidates);
  $('#reviewCount').textContent = String(snapshot.workflow.review?.approved || 0);
  $('#reviewStatus').textContent = snapshot.workflow.review
    ? `已确认 ${snapshot.workflow.review.approved} 条，待审核 ${snapshot.workflow.review.pending} 条，排除 ${snapshot.workflow.review.rejected} 条。`
    : '尚未生成审核队列；候选仍需人工核对。';
  $('#fixtureCount').textContent = String(snapshot.workflow.fixtures);
  $('#versionSummary').textContent = `当前 ${snapshot.releases[0]?.version || '未知'}`;
  $('#status').textContent = snapshot.invalid
    ? `本机镜像已读取；${snapshot.invalid} 行格式异常。`
    : '本机镜像已读取；数据仅在这台电脑上显示。';
  renderActivity();
  renderReleases(snapshot.releases);
}

for (const button of document.querySelectorAll('[data-filter]')) {
  const active = button.dataset.filter === activeFilter;
  button.classList.toggle('active', active);
  if (active) button.setAttribute('aria-current', 'page');
}

$('#export').addEventListener('click', () => {
  if (!snapshot) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `live-tab-groups-workbench-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

load().catch(error => { $('#status').textContent = `工作台无法读取：${error.message}`; });
