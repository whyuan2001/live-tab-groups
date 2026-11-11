import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRecords, filterRecords, groupRecordsByDay } from '../dev-workbench/model.js';

test('workbench combines activity chronologically and filters by record type', () => {
  const records = mergeRecords(
    [{ id: 'e0', time: '2026-11-08T08:00:00Z' }, { id: 'e1', time: '2026-11-09T08:00:00Z' }, { id: 'e2', time: '2026-11-09T10:00:00Z' }],
    [{ id: 'd1', time: '2026-11-09T09:00:00Z' }],
  );
  assert.deepEqual(records.map(record => record.item.id), ['e2', 'd1', 'e1', 'e0']);
  assert.deepEqual(filterRecords(records, 'decision').map(record => record.item.id), ['d1']);
  assert.equal(filterRecords(records, 'all').length, 4);
  assert.deepEqual(groupRecordsByDay(records).map(group => [group.day, group.entries.length]), [['2026-11-09', 3], ['2026-11-08', 1]]);
});
