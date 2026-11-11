import { classifyTab, createRule, pageKey } from './classifier.js';
import { organizeTab, placeTabInGroup, planLegacyCleanup } from './manager.js';
import { recordDecision, recordFeedback, listFeedbackAfter, listDecisionsAfter, listDecisions, countFeedback, countDecisions, restoreFeedback, restoreDecision, setRecordListener, setFallbackWriter } from './feedback-store.js';
import { createFeedbackMonitor } from './feedback-monitor.js';
import { createNativeSync } from './native-sync.js';
import { ensureSyncAlarm } from './sync-alarm.js';
import { groupSelectedTabs } from './manual-group.js';
import { createHighlightGrouper } from './highlight-grouper.js';
import { createVersionUpdate, inferLegacyGroups, matchesManagedGroup, planExistingTabs } from './version-update.js';

const tasks = new Map();
const windowTasks = new Map();
let statePromise;
let persistQueue = Promise.resolve();
const feedbackMonitor = createFeedbackMonitor(chrome);
const nativeSync = createNativeSync(chrome, { listFeedbackAfter, listDecisionsAfter, countFeedback, countDecisions });
const nativeSyncEnabled = chrome.runtime.getManifest?.().permissions?.includes('nativeMessaging') ?? true;
const versionUpdate = createVersionUpdate(chrome);
const FALLBACK_PREFIX = 'feedbackFallback:';
let recoveryPromise;
let updateTask;
setFallbackWriter(async (stream, record) => {
  await chrome.storage.local.set({ [`${FALLBACK_PREFIX}${record.id}`]: { stream, record } });
  return record;
});
async function recoverFallback() {
  if (recoveryPromise) return recoveryPromise;
  recoveryPromise = (async () => {
    const stored = await chrome.storage.local.get(null);
    for (const [key, value] of Object.entries(stored).filter(([key]) => key.startsWith(FALLBACK_PREFIX))) {
      await (value.stream === 'events' ? restoreFeedback(value.record) : restoreDecision(value.record));
      await chrome.storage.local.remove(key);
    }
  })().finally(() => { recoveryPromise = null; });
  return recoveryPromise;
}
const syncSafely = () => recoverFallback().then(() => nativeSync.run())
  .catch(error => console.warn('本机反馈同步待重试：', error.message));
if (nativeSyncEnabled) setRecordListener(syncSafely);
if (nativeSyncEnabled && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'feedback-sync') syncSafely(); });
  ensureSyncAlarm(chrome.alarms).catch(console.error);
}
if (nativeSyncEnabled) syncSafely();
const monitoredApi = {
  tabs: {
    get: id => chrome.tabs.get(id),
    query: query => chrome.tabs.query(query),
    group: async info => {
      feedbackMonitor.expectTabMove(info.tabIds, info.groupId ?? '*');
      return chrome.tabs.group(info);
    },
    ungroup: async tabId => {
      feedbackMonitor.expectTabMove(tabId, -1);
      return chrome.tabs.ungroup(tabId);
    },
  },
  tabGroups: {
    query: query => chrome.tabGroups.query(query),
    update: async (id, info) => {
      if (info.title !== undefined) feedbackMonitor.expectGroupRename(id, info.title);
      const result = await chrome.tabGroups.update(id, info);
      if (info.title !== undefined) {
        const state = await loadState();
        if (state.autoGroupTitles[id] !== undefined) {
          const group = (await chrome.tabGroups.query({})).find(item => item.id === id);
          state.autoGroupTitles[id] = { title: info.title, windowId: group?.windowId };
        }
      }
      return result;
    },
  },
};
feedbackMonitor.load().catch(console.error);

function loadState() {
  statePromise ??= Promise.all([
    chrome.storage.local.get({ rules: [], autoManaged: null, autoGroupTitles: {}, manualOverrides: {} }),
    chrome.storage.session.get({ managed: {} }),
  ]).then(([local, session]) => ({
    rules: local.rules,
    managed: local.autoManaged ?? session.managed,
    autoGroupTitles: local.autoGroupTitles,
    manualOverrides: local.manualOverrides,
  }));
  return statePromise;
}

function enqueue(tabId, job) {
  const previous = tasks.get(tabId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(job);
  tasks.set(tabId, next);
  next.finally(() => { if (tasks.get(tabId) === next) tasks.delete(tabId); }).catch(() => {});
  return next;
}

function enqueueWindow(windowId, job) {
  const previous = windowTasks.get(windowId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(job);
  windowTasks.set(windowId, next);
  next.finally(() => { if (windowTasks.get(windowId) === next) windowTasks.delete(windowId); }).catch(() => {});
  return next;
}

async function persistManaged(state) {
  const activeGroups = new Set(Object.values(state.managed));
  const groups = await chrome.tabGroups.query({});
  for (const group of groups) {
    if (activeGroups.has(group.id) && state.autoGroupTitles[group.id] === undefined) {
      state.autoGroupTitles[group.id] = { title: group.title || '', windowId: group.windowId };
    }
  }
  for (const id of Object.keys(state.autoGroupTitles)) {
    if (!activeGroups.has(Number(id))) delete state.autoGroupTitles[id];
  }
  const managed = { ...state.managed };
  const titles = { ...state.autoGroupTitles };
  const overrides = { ...state.manualOverrides };
  persistQueue = persistQueue.catch(() => {}).then(async () => {
    await chrome.storage.local.set({ autoManaged: managed, autoGroupTitles: titles, manualOverrides: overrides });
    await chrome.storage.session.set({ managed });
  });
  await persistQueue;
}

async function classifyOne(tabId, { force = false, api = monitoredApi } = {}) {
  const state = await loadState();
  if (!force && chrome.runtime.getManifest && (await versionUpdate.status()).pending) return false;
  let tab;
  try { tab = await chrome.tabs.get(tabId); } catch { return false; }
  return enqueueWindow(tab.windowId, async () => {
    const current = await chrome.tabs.get(tabId);
    const override = state.manualOverrides[tabId];
    if (override?.page === pageKey(current.url) && override.groupId === current.groupId) return false;
    if (override) delete state.manualOverrides[tabId];
    if (current.groupId >= 0 && state.managed[tabId] === current.groupId) {
      const group = (await chrome.tabGroups.query({ windowId: current.windowId })).find(item => item.id === current.groupId);
      const members = await chrome.tabs.query({ groupId: current.groupId });
      if (!matchesManagedGroup(group, state.autoGroupTitles[current.groupId])
        || members.some(item => state.managed[item.id] !== group.id)) {
        for (const member of members) delete state.managed[member.id];
      }
    }
    const changed = await organizeTab(api, current, state.rules, state.managed);
    await persistManaged(state);
    await feedbackMonitor.refreshWindow(tab.windowId);
    if (changed && !classifyTab(current, state.rules)) {
      const updated = await chrome.tabs.get(tabId);
      if (updated.groupId >= 0) {
        const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
        const group = groups.find(item => item.id === updated.groupId);
        const members = await chrome.tabs.query({ groupId: updated.groupId });
        if (group && members.length >= 2) await recordDecision({ groupId: group.id, title: group.title, tabs: members });
      }
    }
    return changed;
  });
}

async function groupManualSelection(ids) {
  const first = await chrome.tabs.get(ids[0]);
  return enqueueWindow(first.windowId, async () => {
    const state = await loadState();
    const { groupId, windowId, title, tabs } = await groupSelectedTabs(monitoredApi, ids);
    for (const tab of tabs) delete state.managed[tab.id];
    for (const tab of tabs) delete state.manualOverrides[tab.id];
    await persistManaged(state);
    await feedbackMonitor.refreshWindow(windowId);
    await recordDecision({ groupId, title, reason: 'manual-selection', tabs });
    await recordFeedback({ kind: 'manual_group_created', source: 'browser', before: '未分组', after: title, groupId, tabs });
  });
}

const highlightGrouper = createHighlightGrouper({
  query: windowId => chrome.tabs.query({ windowId, highlighted: true }),
  group: ids => groupManualSelection(ids).catch(error => console.info('多选标签未成组：', error.message)),
});
chrome.tabs.onHighlighted?.addListener(highlightGrouper.onHighlighted);

chrome.tabs.onCreated.addListener(tab => {
  if (tab.id && tab.url) enqueue(tab.id, () => classifyOne(tab.id)).catch(console.error);
});

chrome.tabs.onAttached.addListener(tabId => {
  enqueue(tabId, async () => {
    const state = await loadState();
    delete state.managed[tabId]; // Group IDs from the previous window no longer apply.
    delete state.manualOverrides[tabId];
    await persistManaged(state);
    await classifyOne(tabId);
  }).catch(console.error);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url !== undefined || changeInfo.title !== undefined) {
    enqueue(tabId, () => classifyOne(tabId)).catch(console.error);
  } else if (changeInfo.groupId !== undefined) {
    enqueue(tabId, async () => {
      const state = await loadState();
      const userMoved = await feedbackMonitor.tabChanged(tabId, changeInfo.groupId);
      if (userMoved) {
        const moved = await chrome.tabs.get(tabId);
        state.manualOverrides[tabId] = { page: pageKey(moved.url), groupId: changeInfo.groupId };
        const previousGroup = state.managed[tabId];
        if (previousGroup !== undefined) {
          for (const [id, groupId] of Object.entries(state.managed)) {
            if (groupId === previousGroup) delete state.managed[id];
          }
        }
      }
      if (state.managed[tabId] !== undefined && state.managed[tabId] !== changeInfo.groupId) {
        delete state.managed[tabId];
      }
      await persistManaged(state);
    }).catch(console.error);
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  enqueue(tabId, async () => {
    const state = await loadState();
    delete state.managed[tabId];
    delete state.manualOverrides[tabId];
    await persistManaged(state);
    await feedbackMonitor.removeTab(tabId);
  }).catch(console.error);
});

chrome.tabGroups.onUpdated?.addListener(group => {
  feedbackMonitor.groupChanged(group).catch(console.error);
});

chrome.runtime.onInstalled?.addListener(details => {
  versionUpdate.installed(details).catch(console.error);
});

async function applyVersionUpdateOnce() {
  if (!(await versionUpdate.status()).pending) return { changed: 0, skippedGroups: 0 };
  const state = await loadState();
  const [tabs, groups] = await Promise.all([chrome.tabs.query({}), chrome.tabGroups.query({})]);
  if (groups.some(group => !state.autoGroupTitles[group.id])) {
    const decisions = await listDecisions().catch(() => []);
    const legacy = inferLegacyGroups(tabs, groups, decisions, state.autoGroupTitles);
    Object.assign(state.managed, legacy.managed);
    Object.assign(state.autoGroupTitles, legacy.groupTitles);
  }
  const plan = planExistingTabs(tabs, groups, state.managed, state.autoGroupTitles, state.manualOverrides);
  const allowed = new Set(plan.managedGroupIds);
  for (const tab of tabs) {
    if (tab.groupId >= 0 && !allowed.has(tab.groupId)) delete state.managed[tab.id];
  }
  await persistManaged(state);
  const api = {
    ...monitoredApi,
    tabs: {
      ...monitoredApi.tabs,
      group: async info => {
        const id = await monitoredApi.tabs.group(info);
        allowed.add(id);
        return id;
      },
    },
    tabGroups: {
      ...monitoredApi.tabGroups,
      query: async query => (await monitoredApi.tabGroups.query(query)).filter(group => allowed.has(group.id)),
    },
  };
  let changed = 0;
  for (const id of plan.tabIds) {
    if (await enqueue(id, () => classifyOne(id, { force: true, api }))) changed += 1;
  }
  await versionUpdate.applied();
  return { changed, skippedGroups: plan.skippedGroups };
}

function applyVersionUpdate() {
  updateTask ??= applyVersionUpdateOnce().finally(() => { updateTask = null; });
  return updateTask;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    const state = await loadState();
    if (message.type === 'updateStatus') return versionUpdate.status();
    if (message.type === 'applyVersionUpdate') return applyVersionUpdate();
    if (message.type === 'syncNow') {
      if (!nativeSyncEnabled) throw new Error('本机同步仅开发者版可用');
      await recoverFallback();
      return { sync: await nativeSync.run() };
    }
    if (message.type === 'state') return { rules: state.rules };
    if (message.type === 'saveRule') {
      const tab = await chrome.tabs.get(message.tabId);
      const groups = await chrome.tabGroups.query({ windowId: tab.windowId });
      const before = groups.find(group => group.id === tab.groupId)?.title || '未分组';
      const rule = createRule(tab, message.scope, message.group, message.color, message.keyword);
      state.rules = [...state.rules.filter(item => !(item.type === rule.type && item.pattern === rule.pattern)), rule];
      await chrome.storage.local.set({ rules: state.rules });
      await enqueue(tab.id, async () => {
        await placeTabInGroup(monitoredApi, tab, rule, state.managed);
        await persistManaged(state);
        await feedbackMonitor.refreshWindow(tab.windowId);
      });
      const updated = await chrome.tabs.get(tab.id);
      await recordFeedback({ kind: 'rule_saved', source: 'popup', before, after: rule.group, groupId: updated.groupId, scope: rule.type, tabs: [tab] });
      return { rule };
    }
    if (message.type === 'removeRule') {
      const removed = state.rules.find(rule => rule.id === message.id);
      state.rules = state.rules.filter(rule => rule.id !== message.id);
      await chrome.storage.local.set({ rules: state.rules });
      if (removed) await recordFeedback({ kind: 'rule_removed', source: 'popup', before: removed.group, after: '规则已删除', scope: removed.type, note: removed.pattern });
      return { rules: state.rules };
    }
    if (message.type === 'renameGroup') {
      const group = await chrome.tabGroups.get(message.groupId);
      const title = String(message.title || '').trim();
      if (!title) throw new Error('组名不能为空');
      const tabs = await chrome.tabs.query({ groupId: group.id });
      await monitoredApi.tabGroups.update(group.id, { title });
      await feedbackMonitor.refreshWindow(group.windowId);
      if (group.title !== title) await recordFeedback({ kind: 'group_renamed', source: 'popup', before: group.title || '未命名', after: title, groupId: group.id, tabs });
      return { title };
    }
    if (message.type === 'organizeWindow') {
      let changed = 0;
      await enqueueWindow(message.windowId, async () => {
        const [tabs, groups] = await Promise.all([
          chrome.tabs.query({ windowId: message.windowId }),
          chrome.tabGroups.query({ windowId: message.windowId }),
        ]);
        for (const plan of planLegacyCleanup(groups, tabs)) {
          const affected = tabs.filter(tab => plan.tabIds.includes(tab.id));
          await monitoredApi.tabs.ungroup(plan.tabIds);
          for (const id of plan.tabIds) delete state.managed[id];
          await persistManaged(state);
          await recordFeedback({ kind: 'group_reorganized', source: 'popup', before: plan.title, after: '未分组', groupId: plan.groupId, tabs: affected });
          changed += plan.tabIds.length;
        }
        await feedbackMonitor.refreshWindow(message.windowId);
      });
      const tabs = await chrome.tabs.query({ windowId: message.windowId });
      for (const tab of tabs) {
        if (await enqueue(tab.id, () => classifyOne(tab.id))) changed += 1;
      }
      return { changed };
    }
    throw new Error('未知操作');
  })().then(result => sendResponse({ ok: true, ...result }), error => sendResponse({ ok: false, error: error.message }));
  return true;
});
