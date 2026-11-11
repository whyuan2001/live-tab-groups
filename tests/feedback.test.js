import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFeedbackEvent, makeDecision, recordFeedback, recordDecision, isUserRename, isUserMove, coalesceRenameFragments, setFallbackWriter } from '../feedback-store.js';

test('feedback keeps the correction and strips URL queries', () => {
  const event = makeFeedbackEvent({
    kind: 'rule_saved', source: 'popup', before: 'Figma', after: '设计', scope: 'site',
    tabs: [{ title: '设计文件', url: 'https://www.figma.com/file/1?token=secret#view' }],
  }, 1762252800000);
  assert.equal(event.kind, 'rule_saved');
  assert.equal(event.before, 'Figma');
  assert.equal(event.after, '设计');
  assert.equal(event.tabs[0].page, 'https://www.figma.com/file/1');
  assert.equal(event.tabs[0].site, 'www.figma.com');
  assert.equal(event.tabs[0].url, undefined);
});

test('only external group name changes count as user renames', () => {
  assert.equal(isUserRename('www.figma.com', 'Figma', 'Figma'), false);
  assert.equal(isUserRename('Figma', 'Figma', null), false);
  assert.equal(isUserRename('Figma', '设计', null), true);
});

test('manual tab movement excludes expected automatic grouping', () => {
  assert.equal(isUserMove(4, 7, 7), false);
  assert.equal(isUserMove(4, 7, null), true);
  assert.equal(isUserMove(4, 4, null), false);
});

test('legacy character-by-character rename events collapse without losing their raw steps', () => {
  const at = '2026-11-04T08:40:37.000Z';
  const steps = [
    { seq: 1, kind: 'group_renamed', source: 'chrome', before: 'Figma 验证', after: 'F', time: at, tabs: [{ site: 'figma.com' }] },
    { seq: 2, kind: 'group_renamed', source: 'chrome', before: 'F', after: 'Fi', time: at, tabs: [{ site: 'figma.com' }] },
    { seq: 3, kind: 'group_renamed', source: 'chrome', before: 'Fi', after: 'Fig', time: at, tabs: [{ site: 'figma.com' }] },
    { seq: 4, kind: 'group_renamed', source: 'chrome', before: 'Fig', after: 'Figma', time: at, tabs: [{ site: 'figma.com' }] },
  ];
  const result = coalesceRenameFragments(steps);
  assert.equal(result.length, 1);
  assert.equal(result[0].before, 'Figma 验证');
  assert.equal(result[0].after, 'Figma');
  assert.equal(result[0].mergedFrom.length, 4);
});

test('automatic decision records proposed name, strategy and member context', () => {
  const decision = makeDecision({ groupId: 7, title: 'Figma', reason: 'same-site', tabs: [
    { title: 'A', url: 'https://www.figma.com/file/1?secret=1' },
    { title: 'B', url: 'https://www.figma.com/file/2' },
  ] }, 1762252800000);
  assert.equal(decision.title, 'Figma');
  assert.equal(decision.groupingVersion, '1.0.0');
  assert.equal(decision.namingVersion, '1.1.0');
  assert.equal(decision.tabs.length, 2);
  assert.equal(decision.tabs[0].page, 'https://www.figma.com/file/1');
});

test('user feedback records both independent strategy versions', () => {
  const event = makeFeedbackEvent({ kind: 'group_renamed', before: 'Figma', after: '设计' });
  assert.equal(event.groupingVersion, '1.0.0');
  assert.equal(event.namingVersion, '1.1.0');
});

test('reorganizing a mixed legacy group is recorded as one user correction', () => {
  const event = makeFeedbackEvent({ kind: 'group_reorganized', source: 'popup', before: '127.0.0.1', after: '未分组', tabs: [
    { title: '招聘', url: 'http://127.0.0.1:3000/jobs' },
    { title: '计费', url: 'http://127.0.0.1:4000/billing' },
  ] });
  assert.equal(event.kind, 'group_reorganized');
  assert.equal(event.tabs.length, 2);
});

test('failed local recording does not reject the browser operation', async () => {
  const errors = [];
  const failingWrite = async () => { throw new Error('storage unavailable'); };
  assert.equal(await recordFeedback({ kind: 'group_renamed' }, failingWrite, error => errors.push(error)), null);
  assert.equal(await recordDecision({ title: 'Figma' }, failingWrite, error => errors.push(error)), null);
  assert.equal(errors.length, 2);
});

test('a failed primary write keeps the correction in emergency storage', async () => {
  const stored = [];
  setFallbackWriter(async (stream, record) => { stored.push({ stream, record }); return record; });
  try {
    const event = await recordFeedback({ kind: 'group_renamed', before: '错误', after: 'Figma' }, undefined, () => {});
    assert.equal(event.after, 'Figma');
    assert.equal(stored[0].stream, 'events');
    assert.equal(stored[0].record.id, event.id);
  } finally { setFallbackWriter(null); }
});
