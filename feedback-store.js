import { pageKey, siteKey } from './classifier.js';

const DATABASE = 'live-tab-groups-feedback';
const STORE = 'events';
const DECISIONS = 'decisions';
const KINDS = new Set(['rule_saved', 'rule_removed', 'group_renamed', 'group_reorganized', 'tab_moved', 'manual_group_created', 'setting_changed']);
export const GROUPING_VERSION = '1.0.0';
export const NAMING_VERSION = '1.1.0';
let databasePromise;
let recordListener = () => {};
let fallbackWriter = null;

export function setRecordListener(listener) {
  recordListener = listener;
}

export function setFallbackWriter(writer) {
  fallbackWriter = writer;
}

function snapshotTab(tab) {
  return { title: String(tab.title || '').slice(0, 300), site: siteKey(tab.url), page: pageKey(tab.url) };
}

export function makeFeedbackEvent(input, now = Date.now()) {
  if (!KINDS.has(input.kind)) throw new Error('未知反馈类型');
  return {
    id: crypto.randomUUID(),
    time: new Date(now).toISOString(),
    kind: input.kind,
    groupId: input.groupId ?? null,
    groupingVersion: GROUPING_VERSION,
    namingVersion: NAMING_VERSION,
    source: input.source || 'browser',
    before: input.before ?? null,
    after: input.after ?? null,
    scope: input.scope ?? null,
    tabs: (input.tabs || []).map(snapshotTab),
    note: input.note || '',
  };
}

export function makeDecision(input, now = Date.now()) {
  return {
    id: crypto.randomUUID(), time: new Date(now).toISOString(),
    groupingVersion: GROUPING_VERSION, namingVersion: NAMING_VERSION,
    groupId: input.groupId,
    title: String(input.title || ''), reason: input.reason || 'same-site',
    tabs: (input.tabs || []).map(snapshotTab),
  };
}

export function isUserRename(before, after, expected) {
  return Boolean(before && after && before !== after && after !== expected);
}

export function isUserMove(before, after, expected) {
  return before !== undefined && before !== after && after !== expected;
}

export function coalesceRenameFragments(events) {
  const output = [];
  for (let i = 0; i < events.length; i += 1) {
    const first = events[i];
    if (first.kind !== 'group_renamed' || first.source !== 'chrome' || first.groupId != null) {
      output.push(first);
      continue;
    }
    const chain = [first];
    while (i + 1 < events.length) {
      const next = events[i + 1];
      const last = chain.at(-1);
      if (next.kind !== 'group_renamed' || next.source !== 'chrome' || next.groupId != null
        || next.before !== last.after
        || new Date(next.time) - new Date(last.time) > 3000
        || JSON.stringify(next.tabs) !== JSON.stringify(first.tabs)) break;
      chain.push(next);
      i += 1;
    }
    const finalName = chain.at(-1).after;
    if (chain.length >= 3 && chain.slice(0, -1).every(event => finalName.startsWith(event.after))) {
      output.push({ ...first, after: finalName, note: '已合并旧版逐字输入记录', mergedFrom: chain });
    } else output.push(...chain);
  }
  return output;
}

function repairOldRenameEvents(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const before = request.result;
      const after = coalesceRenameFragments(before);
      if (after.length === before.length) return;
      const retained = new Set(after.map(event => event.seq));
      for (const event of after) if (event.mergedFrom) store.put(event);
      for (const event of before) if (!retained.has(event.seq)) store.delete(event.seq);
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true });
      if (!request.result.objectStoreNames.contains(DECISIONS)) request.result.createObjectStore(DECISIONS, { keyPath: 'seq', autoIncrement: true });
    };
    request.onsuccess = () => repairOldRenameEvents(request.result).then(() => resolve(request.result), reject);
    request.onerror = () => reject(request.error);
  }).catch(error => { databasePromise = undefined; throw error; });
  return databasePromise;
}

async function appendRecord(storeName, record) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).add(record);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
  try { recordListener(); } catch (error) { console.error(error); }
  return record;
}

export const appendFeedback = input => appendRecord(STORE, makeFeedbackEvent(input));
export const appendDecision = input => appendRecord(DECISIONS, makeDecision(input));

export async function recordFeedback(input, write = appendFeedback, report = console.error) {
  try { return await write(input); } catch (error) {
    report(error);
    if (write === appendFeedback && fallbackWriter) {
      try { return await fallbackWriter('events', makeFeedbackEvent(input)); }
      catch (fallbackError) { report(fallbackError); }
    }
    return null;
  }
}

export async function recordDecision(input, write = appendDecision, report = console.error) {
  try { return await write(input); } catch (error) {
    report(error);
    if (write === appendDecision && fallbackWriter) {
      try { return await fallbackWriter('decisions', makeDecision(input)); }
      catch (fallbackError) { report(fallbackError); }
    }
    return null;
  }
}

async function restoreRecord(storeName, record) {
  const database = await openDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => {
      if (!request.result.some(item => item.id === record.id)) store.add(record);
    };
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export const restoreFeedback = record => restoreRecord(STORE, record);
export const restoreDecision = record => restoreRecord(DECISIONS, record);

export async function listFeedback(limit = 50, offset = 0) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const results = [];
    let skipped = 0;
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) return resolve(results);
      if (skipped++ >= offset) results.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function countFeedback() {
  return countRecords(STORE);
}

export async function countDecisions() {
  return countRecords(DECISIONS);
}

async function countRecords(storeName) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listDecisions() {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(DECISIONS, 'readonly').objectStore(DECISIONS).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listAfter(storeName, seq, limit) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const results = [];
    const request = database.transaction(storeName, 'readonly').objectStore(storeName)
      .openCursor(IDBKeyRange.lowerBound(seq + 1));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || results.length >= limit) return resolve(results);
      results.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export const listFeedbackAfter = (seq, limit = 50) => listAfter(STORE, seq, limit);
export const listDecisionsAfter = (seq, limit = 50) => listAfter(DECISIONS, seq, limit);
