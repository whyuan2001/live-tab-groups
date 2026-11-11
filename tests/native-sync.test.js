import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeSync } from '../native-sync.js';

test('native sync backfills both streams and only advances acknowledged cursors', async () => {
  const saved = {};
  const sent = [];
  const remote = { cursor: { events: 0, decisions: 0 }, count: { events: 0, decisions: 0 } };
  const api = {
    storage: { local: {
      async get(defaults) { return { ...defaults, ...saved }; },
      async set(value) { Object.assign(saved, value); },
    } },
    runtime: { async sendNativeMessage(_host, message) {
      if (message.type === 'status') return { ok: true, ...remote };
      sent.push(message);
      for (const { stream, record } of message.records) { remote.cursor[stream] = record.seq; remote.count[stream] += 1; }
      return { ok: true, processed: message.records.length };
    } },
  };
  const records = {
    events: [{ seq: 1, id: 'e1' }, { seq: 2, id: 'e2' }],
    decisions: [{ seq: 1, id: 'd1' }],
  };
  const sync = createNativeSync(api, {
    listFeedbackAfter: (seq, limit) => records.events.filter(x => x.seq > seq).slice(0, limit),
    listDecisionsAfter: (seq, limit) => records.decisions.filter(x => x.seq > seq).slice(0, limit),
    countFeedback: () => records.events.length,
    countDecisions: () => records.decisions.length,
  }, { batchSize: 1 });
  await sync.run();
  assert.deepEqual(sent.flatMap(x => x.records.map(r => `${r.stream}:${r.record.id}`)), ['events:e1', 'events:e2', 'decisions:d1']);
  assert.deepEqual(saved.nativeSyncCursor, { events: 2, decisions: 1 });
  assert.equal(saved.nativeSyncStatus.state, 'ok');
  await sync.run();
  assert.equal(sent.length, 3);
});

test('failed native delivery keeps cursor so retry resends the same record', async () => {
  let calls = 0;
  const saved = {};
  const api = {
    storage: { local: {
      async get(defaults) { return { ...defaults, ...saved }; },
      async set(value) { Object.assign(saved, value); },
    } },
    runtime: { async sendNativeMessage(_host, message) {
      if (message.type === 'status') return { ok: true, cursor: { events: 0, decisions: 0 }, count: { events: 0, decisions: 0 } };
      if (++calls === 1) throw new Error('host missing');
      return { ok: true, processed: message.records.length };
    } },
  };
  const sync = createNativeSync(api, {
    listFeedbackAfter: seq => [{ seq: 1, id: 'e1' }].filter(x => x.seq > seq),
    listDecisionsAfter: () => [],
    countFeedback: () => 1, countDecisions: () => 0,
  });
  await assert.rejects(sync.run(), /host missing/);
  assert.equal(saved.nativeSyncCursor, undefined);
  assert.equal(saved.nativeSyncStatus.state, 'retrying');
  await sync.run();
  assert.equal(calls, 2);
  assert.deepEqual(saved.nativeSyncCursor, { events: 1, decisions: 0 });
});

test('rejected acknowledgement does not advance cursor', async () => {
  const api = {
    storage: { local: { async get(defaults) { return defaults; }, async set() { throw new Error('should not save'); } } },
    runtime: { async sendNativeMessage(_host, message) { return message.type === 'status'
      ? { ok: true, cursor: { events: 0, decisions: 0 }, count: { events: 0, decisions: 0 } }
      : { ok: false, error: 'invalid' }; } },
  };
  const sync = createNativeSync(api, {
    listFeedbackAfter: () => [{ seq: 1, id: 'e1' }], listDecisionsAfter: () => [],
    countFeedback: () => 1, countDecisions: () => 0,
  });
  await assert.rejects(sync.run(), /invalid/);
});

test('missing local mirror rewinds saved cursor and backfills records automatically', async () => {
  const saved = { nativeSyncCursor: { events: 3, decisions: 0 } };
  const delivered = [];
  const api = {
    storage: { local: {
      async get(defaults) { return { ...defaults, ...saved }; },
      async set(value) { Object.assign(saved, value); },
    } },
    runtime: { async sendNativeMessage(_host, message) {
      if (message.type === 'status') return { ok: true, cursor: { events: 0, decisions: 0 }, count: { events: 0, decisions: 0 } };
      delivered.push(...message.records);
      return { ok: true, processed: message.records.length };
    } },
  };
  const sync = createNativeSync(api, {
    listFeedbackAfter: seq => [1, 2, 3].filter(n => n > seq).map(seq => ({ seq, id: `e${seq}` })),
    listDecisionsAfter: () => [], countFeedback: () => 3, countDecisions: () => 0,
  });
  await sync.run();
  assert.deepEqual(delivered.map(x => x.record.id), ['e1', 'e2', 'e3']);
  assert.equal(saved.nativeSyncCursor.events, 3);
});
