import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenameCollector } from '../rename-collector.js';

test('typing a native group name produces one final correction', async () => {
  const saved = [];
  const collector = createRenameCollector(event => saved.push(event), 5);
  collector.observe(7, 'Figma', 'F');
  collector.observe(7, 'F', 'Fi');
  collector.observe(7, 'Fi', 'Fig');
  collector.observe(7, 'Fig', '设计');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(saved, [{ groupId: 7, before: 'Figma', after: '设计' }]);
});

test('a cancelled edit that returns to the original name is not feedback', async () => {
  const saved = [];
  const collector = createRenameCollector(event => saved.push(event), 5);
  collector.observe(7, 'Figma', 'Fig');
  collector.observe(7, 'Fig', 'Figma');
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(saved, []);
});
