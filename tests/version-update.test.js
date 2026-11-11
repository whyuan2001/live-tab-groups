import test from 'node:test';
import assert from 'node:assert/strict';
import { createVersionUpdate, inferLegacyGroups, planExistingTabs } from '../version-update.js';

test('an installed update stays pending until the user applies it', async () => {
  const saved = {};
  const api = {
    runtime: { getManifest: () => ({ version: '0.12.0' }) },
    storage: { local: {
      async get(defaults) { return { ...defaults, ...saved }; },
      async set(value) { Object.assign(saved, value); },
    } },
  };
  const update = createVersionUpdate(api);
  await update.installed({ reason: 'update', previousVersion: '0.11.0' });
  assert.equal((await update.status()).pending, true);
  assert.equal((await update.status()).pending, true);
  await update.applied();
  assert.equal((await update.status()).pending, false);
  assert.equal(saved.appliedProductVersion, '0.12.0');
  await update.installed({ reason: 'update', previousVersion: '0.12.0' });
  assert.equal((await update.status()).pending, false);
});

test('a fresh install has no false update prompt', async () => {
  const saved = {};
  const api = {
    runtime: { getManifest: () => ({ version: '0.12.0' }) },
    storage: { local: {
      async get(defaults) { return { ...defaults, ...saved }; },
      async set(value) { Object.assign(saved, value); },
    } },
  };
  const update = createVersionUpdate(api);
  await update.installed({ reason: 'install' });
  assert.equal((await update.status()).pending, false);
});

test('an update only targets ungrouped tabs and groups with matching ownership', () => {
  const tabs = [
    { id: 1, windowId: 1, groupId: 7 }, { id: 2, windowId: 1, groupId: 7 },
    { id: 3, windowId: 1, groupId: 8 }, { id: 4, windowId: 1, groupId: 8 },
    { id: 5, windowId: 2, groupId: 9 }, { id: 6, windowId: 2, groupId: -1 },
  ];
  const groups = [
    { id: 7, windowId: 1, title: 'Figma' },
    { id: 8, windowId: 1, title: '用户改名' },
    { id: 9, windowId: 2, title: '手动分组' },
  ];
  const managed = { 1: 7, 2: 7, 3: 8, 4: 8 };
  const groupTitles = { 7: { title: 'Figma', windowId: 1 }, 8: { title: '旧名称', windowId: 1 } };
  const plan = planExistingTabs(tabs, groups, managed, groupTitles);
  assert.deepEqual(plan.tabIds, [1, 2, 6]);
  assert.deepEqual(plan.managedGroupIds, [7]);
  assert.equal(plan.skippedGroups, 2);
});

test('a group with a manually moved member is protected as a whole', () => {
  const tabs = [{ id: 1, windowId: 1, groupId: 7 }, { id: 2, windowId: 1, groupId: 7 }];
  const groups = [{ id: 7, windowId: 1, title: 'Figma' }];
  const plan = planExistingTabs(tabs, groups, { 1: 7 }, { 7: { title: 'Figma', windowId: 1 } });
  assert.deepEqual(plan.tabIds, []);
  assert.equal(plan.skippedGroups, 1);
});

test('a page manually removed from a group is not put back during an update', () => {
  const tabs = [{ id: 1, windowId: 1, groupId: -1, url: 'https://figma.com/a' }];
  const plan = planExistingTabs(tabs, [], {}, {}, { 1: { page: 'https://figma.com/a', groupId: -1 } });
  assert.deepEqual(plan.tabIds, []);
});

test('old automatic groups can be recovered only from matching generation evidence', () => {
  const tabs = [
    { id: 1, windowId: 1, groupId: 7, url: 'https://figma.com/a' },
    { id: 2, windowId: 1, groupId: 7, url: 'https://figma.com/b' },
    { id: 3, windowId: 1, groupId: 8, url: 'https://figma.com/c' },
    { id: 4, windowId: 1, groupId: 8, url: 'https://figma.com/d' },
  ];
  const groups = [
    { id: 7, windowId: 1, title: 'Figma' },
    { id: 8, windowId: 1, title: 'Figma' },
  ];
  const decisions = [
    { groupId: 7, title: 'Figma', reason: 'same-site', tabs: [
      { page: 'https://figma.com/a' }, { page: 'https://figma.com/b' },
    ] },
    { groupId: 8, title: 'Figma', reason: 'manual-selection', tabs: [
      { page: 'https://figma.com/c' }, { page: 'https://figma.com/d' },
    ] },
  ];
  assert.deepEqual(inferLegacyGroups(tabs, groups, decisions, {}), {
    managed: { 1: 7, 2: 7 },
    groupTitles: { 7: { title: 'Figma', windowId: 1 } },
  });
});
