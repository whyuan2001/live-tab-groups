export function mergeRecords(events, decisions) {
  return [
    ...events.map(item => ({ type: 'event', item })),
    ...decisions.map(item => ({ type: 'decision', item })),
  ].sort((a, b) => String(b.item.time || '').localeCompare(String(a.item.time || '')));
}

export function filterRecords(records, filter) {
  return filter === 'all' ? records : records.filter(record => record.type === filter);
}

export function groupRecordsByDay(records) {
  const days = new Map();
  for (const record of records) {
    const day = String(record.item.time || '').slice(0, 10) || '日期未知';
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(record);
  }
  return [...days].map(([day, entries]) => ({ day, entries }));
}
