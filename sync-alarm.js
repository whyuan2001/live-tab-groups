export async function ensureSyncAlarm(alarms, name = 'feedback-sync') {
  if (!await alarms.get(name)) await alarms.create(name, { periodInMinutes: 5 });
}
