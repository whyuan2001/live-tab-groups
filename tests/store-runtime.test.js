import test from 'node:test';
import assert from 'node:assert/strict';

test('public build does not start developer native backup', async () => {
  const listeners = {};
  const event = name => ({ addListener(callback) { listeners[name] = callback; } });
  let nativeCalls = 0;
  let alarmCalls = 0;
  const local = {};
  const session = {};
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: '1.0.0', permissions: ['tabs', 'tabGroups', 'storage'] }),
      sendNativeMessage: async () => { nativeCalls += 1; return { ok: true }; },
      onMessage: event('message'), onInstalled: event('installed'),
    },
    storage: {
      local: { async get(defaults) { return { ...defaults, ...local }; }, async set(value) { Object.assign(local, value); } },
      session: { async get(defaults) { return { ...defaults, ...session }; }, async set(value) { Object.assign(session, value); } },
    },
    tabs: {
      onCreated: event('created'), onUpdated: event('updated'), onRemoved: event('removed'),
      onAttached: event('attached'), onHighlighted: event('highlighted'),
      async query() { return []; },
    },
    tabGroups: { onUpdated: event('groupUpdated'), async query() { return []; } },
    alarms: {
      onAlarm: event('alarm'),
      async get() { alarmCalls += 1; return null; },
      async create() { alarmCalls += 1; },
    },
  };
  try {
    await import(`../background.js?store-runtime=${Date.now()}`);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(nativeCalls, 0);
    assert.equal(alarmCalls, 0);
    const response = await new Promise(resolve => listeners.message({ type: 'syncNow' }, null, resolve));
    assert.equal(response.ok, false);
    assert.match(response.error, /仅开发者版/);
  } finally {
    delete globalThis.chrome;
  }
});
