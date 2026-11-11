import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewQueue, summarizeReviewQueue, approvedDataset } from '../review-workflow.js';

test('review queue preserves human decisions and leaves new cases pending', () => {
  const analysis = { cases: [
    { eventId: 'e1', type: 'naming', after: '设计' },
    { eventId: 'e2', type: 'grouping', after: '项目' },
  ] };
  const previous = { cases: [
    { eventId: 'e1', review: { decision: 'approved', note: '确认为误命名' } },
  ] };
  const queue = buildReviewQueue(analysis, previous, '0.11.0');
  assert.equal(queue.productVersion, '0.11.0');
  assert.deepEqual(queue.cases.map(item => item.review.decision), ['approved', 'pending']);
  assert.deepEqual(summarizeReviewQueue(queue), { total: 2, approved: 1, rejected: 0, pending: 1 });
});

test('invalid prior human review is rejected before rewriting the queue', () => {
  assert.throws(() => buildReviewQueue({ cases: [{ eventId: 'e1' }] }, {
    cases: [{ eventId: 'e1', review: { decision: 'publish' } }],
  }, '0.11.0'));
});

test('reviewed cases survive a temporary source gap and only approved cases enter the dataset', () => {
  const previous = { cases: [
    { eventId: 'e1', type: 'naming', after: '设计', review: { decision: 'approved', note: '人工确认' } },
    { eventId: 'e2', type: 'grouping', after: '项目', review: { decision: 'rejected', note: '开发验证' } },
  ] };
  const queue = buildReviewQueue({ cases: [] }, previous, '0.11.0');
  assert.equal(queue.cases.length, 2);
  assert.equal(queue.cases[0].sourceMissing, true);
  assert.deepEqual(approvedDataset(queue).cases.map(item => item.eventId), ['e1']);
});
