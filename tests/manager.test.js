import test from 'node:test';
import assert from 'node:assert/strict';
import { organizeTab, placeTabInGroup, planLegacyCleanup } from '../manager.js';

function fakeChrome(groups = [], tabs = []) {
  const calls = [];
  let nextGroupId = 10;
  return {
    calls,
    tabGroups: {
      async query({ windowId }) { return groups.filter(group => group.windowId === windowId); },
      async update(id, info) { calls.push(['update', id, info]); },
    },
    tabs: {
      async group(info) { calls.push(['group', info]); return info.groupId ?? nextGroupId++; },
      async ungroup(id) { calls.push(['ungroup', id]); },
      async query({ windowId }) { return tabs.filter(tab => tab.windowId === windowId); },
    },
  };
}

const rule = { id: 'r1', type: 'site', pattern: 'example.com', group: '项目', color: 'red' };

test('matching tab reuses a group in the same window', async () => {
  const api = fakeChrome([{ id: 4, windowId: 2, title: '项目', color: 'red' }]);
  const managed = {};
  await organizeTab(api, { id: 7, windowId: 2, url: 'https://example.com/a', groupId: -1 }, [rule], managed);
  assert.deepEqual(api.calls, [['group', { tabIds: 7, groupId: 4 }]]);
  assert.equal(managed[7], 4);
});

test('three Figma pages form one readable native group without a rule', async () => {
  const tabs = [1, 2, 3].map(id => ({ id, windowId: 2, url: `https://www.figma.com/file/${id}`, groupId: -1 }));
  const api = fakeChrome([], tabs);
  const managed = {};
  await organizeTab(api, tabs[0], [], managed);
  assert.deepEqual(api.calls, [
    ['group', { tabIds: [1, 2, 3] }],
    ['update', 10, { title: 'Figma', color: 'purple' }],
  ]);
  assert.deepEqual(managed, { 1: 10, 2: 10, 3: 10 });
});

test('one page stays ungrouped and manually grouped peers are left alone', async () => {
  const tab = { id: 1, windowId: 2, url: 'https://www.figma.com/file/1', groupId: -1 };
  const peer = { id: 2, windowId: 2, url: 'https://www.figma.com/file/2', groupId: 7 };
  const api = fakeChrome([{ id: 7, windowId: 2, title: '我的工作', color: 'blue' }], [tab, peer]);
  await organizeTab(api, tab, [], {});
  assert.deepEqual(api.calls, []);
});

test('existing hostname group is renamed only when all its pages match', async () => {
  const tabs = [1, 2, 3].map(id => ({ id, windowId: 2, url: `https://www.figma.com/file/${id}`, groupId: 7 }));
  const api = fakeChrome([{ id: 7, windowId: 2, title: 'www.figma.com', color: 'blue' }], tabs);
  const managed = {};
  await organizeTab(api, tabs[0], [], managed);
  assert.deepEqual(api.calls, [['update', 7, { title: 'Figma', color: 'purple' }]]);
  assert.deepEqual(managed, { 1: 7, 2: 7, 3: 7 });
});

test('already grouped automatic tab stays grouped on later updates', async () => {
  const tabs = [1, 2].map(id => ({ id, windowId: 2, url: `https://www.figma.com/file/${id}`, groupId: 7 }));
  const api = fakeChrome([{ id: 7, windowId: 2, title: 'Figma', color: 'purple' }], tabs);
  const managed = { 1: 7, 2: 7 };
  await organizeTab(api, tabs[0], [], managed);
  assert.deepEqual(api.calls, []);
  assert.deepEqual(managed, { 1: 7, 2: 7 });
});

test('matching tab creates named colored group when none exists', async () => {
  const api = fakeChrome();
  const managed = {};
  await organizeTab(api, { id: 7, windowId: 2, url: 'https://example.com/a', groupId: -1 }, [rule], managed);
  assert.deepEqual(api.calls, [['group', { tabIds: 7 }], ['update', 10, { title: '项目', color: 'red' }]]);
  assert.equal(managed[7], 10);
});

test('manual group is never moved', async () => {
  const api = fakeChrome();
  const managed = {};
  await organizeTab(api, { id: 7, windowId: 2, url: 'https://example.com/a', groupId: 5 }, [rule], managed);
  assert.deepEqual(api.calls, []);
});

test('managed tab is released after navigating to an unmatched site', async () => {
  const api = fakeChrome();
  const managed = { 7: 5 };
  await organizeTab(api, { id: 7, windowId: 2, url: 'https://other.com', groupId: 5 }, [rule], managed);
  assert.deepEqual(api.calls, [['ungroup', 7]]);
  assert.equal(managed[7], undefined);
});

test('explicit correction can move a manually grouped tab', async () => {
  const api = fakeChrome([{ id: 8, windowId: 2, title: '项目', color: 'red' }]);
  const managed = {};
  await placeTabInGroup(api, { id: 7, windowId: 2, groupId: 5 }, rule, managed);
  assert.deepEqual(api.calls, [['group', { tabIds: 7, groupId: 8 }]]);
  assert.equal(managed[7], 8);
});

test('reorganize plans to release every tab from a legacy IP group', () => {
  const groups = [{ id: 7, title: '127.0.0.1' }];
  const tabs = [
    { id: 1, groupId: 7, url: 'http://127.0.0.1:3000/jobs' },
    { id: 2, groupId: 7, url: 'http://127.0.0.1:4000/billing' },
    { id: 3, groupId: 7, url: 'https://careers.pdd.com/jobs' },
  ];
  assert.deepEqual(planLegacyCleanup(groups, tabs), [{ groupId: 7, title: '127.0.0.1', tabIds: [1, 2, 3] }]);
});

test('reorganize detaches mixed-domain members but preserves a matching pair', () => {
  const groups = [{ id: 7, title: 'jobs.bytedance.com' }];
  const tabs = [
    { id: 1, groupId: 7, url: 'https://jobs.bytedance.com/a' },
    { id: 2, groupId: 7, url: 'https://jobs.bytedance.com/b' },
    { id: 3, groupId: 7, url: 'https://chatgpt.com/c/1' },
  ];
  assert.deepEqual(planLegacyCleanup(groups, tabs), [{ groupId: 7, title: 'jobs.bytedance.com', tabIds: [3] }]);
});

test('reorganize preserves custom names and correctly grouped domains', () => {
  const groups = [{ id: 7, title: '我的工作' }, { id: 8, title: 'www.figma.com' }];
  const tabs = [
    { id: 1, groupId: 7, url: 'https://chatgpt.com/' },
    { id: 2, groupId: 7, url: 'https://figma.com/' },
    { id: 3, groupId: 8, url: 'https://www.figma.com/a' },
    { id: 4, groupId: 8, url: 'https://www.figma.com/b' },
  ];
  assert.deepEqual(planLegacyCleanup(groups, tabs), []);
});
