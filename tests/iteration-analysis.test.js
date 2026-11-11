import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeFeedback } from '../iteration-analysis.js';

test('batch analysis links corrections to generation records and groups repeated patterns', () => {
  const exportData = {
    decisions: [
      { id: 'd1', time: '2026-11-04T10:00:00Z', groupId: 7, title: 'Figma', tabs: [{ page: 'https://figma.com/a', site: 'figma.com' }] },
      { id: 'd2', time: '2026-11-04T11:00:00Z', groupId: 8, title: 'GitHub', tabs: [{ page: 'https://github.com/a', site: 'github.com' }] },
    ],
    events: [
      { id: 'e1', time: '2026-11-04T10:30:00Z', kind: 'group_renamed', groupId: 7, before: 'Figma', after: '设计', tabs: [{ page: 'https://figma.com/a', site: 'figma.com' }] },
      { id: 'e2', time: '2026-11-04T11:30:00Z', kind: 'rule_saved', groupId: 8, before: 'GitHub', after: '项目', tabs: [{ page: 'https://github.com/a', site: 'github.com' }] },
      { id: 'e3', time: '2026-11-04T12:00:00Z', kind: 'group_renamed', groupId: 7, before: 'Figma', after: '设计', tabs: [{ page: 'https://figma.com/a', site: 'figma.com' }] },
      { id: 'e4', time: '2026-11-04T12:30:00Z', kind: 'setting_changed', before: '开启', after: '暂停' },
    ],
  };
  const result = analyzeFeedback(exportData);
  assert.deepEqual(result.summary, { generated: 2, corrections: 3, naming: 2, grouping: 1, unmatched: 0 });
  assert.equal(result.cases.find(item => item.eventId === 'e1').decisionId, 'd1');
  assert.equal(result.cases.find(item => item.eventId === 'e2').type, 'grouping');
  assert.equal(result.patterns.find(item => item.type === 'naming').count, 2);
});

test('legacy cleanup remains a candidate even without an earlier generation record', () => {
  const result = analyzeFeedback({ decisions: [], events: [
    { id: 'e1', time: '2026-11-04T10:00:00Z', kind: 'group_reorganized', groupId: 7, before: '127.0.0.1', after: '未分组', tabs: [{ site: '127.0.0.1' }] },
  ] });
  assert.equal(result.summary.unmatched, 1);
  assert.equal(result.cases[0].decisionId, null);
  assert.equal(result.cases[0].type, 'grouping');
});

test('creating a manual group is an operation, not a correction example', () => {
  const result = analyzeFeedback({ decisions: [], events: [
    { id: 'e1', kind: 'manual_group_created', before: '未分组', after: '项目', time: '2026-11-09T10:00:00Z' },
  ] });
  assert.equal(result.summary.corrections, 0);
});
