import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCases } from '../strategy-eval.js';

test('fixed evaluation detects a naming regression in the real grouping manager', async () => {
  const input = { id: 'figma-pair', tabs: [
    { id: 1, windowId: 1, url: 'https://www.figma.com/a', groupId: -1 },
    { id: 2, windowId: 1, url: 'https://www.figma.com/b', groupId: -1 },
  ], groups: [], expected: { groups: [{ title: 'Figma', tabIds: [1, 2] }], ungrouped: [] } };
  const result = await evaluateCases([input, { ...input, id: 'wrong-name', expected: { groups: [{ title: '错误', tabIds: [1, 2] }], ungrouped: [] } }]);
  assert.equal(result.passed, 1);
  assert.equal(result.total, 2);
  assert.equal(result.failures[0].id, 'wrong-name');
});
