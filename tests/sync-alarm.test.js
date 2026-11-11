import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureSyncAlarm } from '../sync-alarm.js';

test('existing periodic alarm is kept instead of resetting its timer', async () => {
  let created = 0;
  await ensureSyncAlarm({ get: async () => ({ name: 'feedback-sync' }), create: async () => { created += 1; } });
  assert.equal(created, 0);
});

test('missing periodic alarm is created once', async () => {
  let alarm;
  const api = { get: async () => alarm, create: async (name, info) => { alarm = { name, ...info }; } };
  await ensureSyncAlarm(api);
  await ensureSyncAlarm(api);
  assert.deepEqual(alarm, { name: 'feedback-sync', periodInMinutes: 5 });
});
