import test from 'node:test';
import assert from 'node:assert/strict';
import { groupSelectedTabs } from '../manual-group.js';

function fixture(items) {
  const tabs = new Map(items.map(tab => [tab.id, { ...tab }]));
  const calls = [];
  const api = {
    tabs: {
      async get(id) { if (!tabs.has(id)) throw new Error('标签页已关闭'); return tabs.get(id); },
      async group(info) { calls.push(['group', info]); for (const id of info.tabIds) tabs.get(id).groupId = 8; return 8; },
    },
    tabGroups: { async update(id, info) { calls.push(['update', id, info]); } },
  };
  return { api, calls, tabs };
}

test('selected ungrouped pages from different sites form one manual group', async () => {
  const { api, calls, tabs } = fixture([
    { id: 1, windowId: 2, url: 'https://a.example/a', title: 'Alpha', groupId: -1, pinned: false },
    { id: 2, windowId: 2, url: 'https://b.example/b', title: 'Beta', groupId: -1, pinned: false },
  ]);
  const result = await groupSelectedTabs(api, [1, 2]);
  assert.deepEqual(result, { groupId: 8, windowId: 2, title: 'Alpha 等2页', tabs: [...tabs.values()] });
  assert.deepEqual(calls, [
    ['group', { tabIds: [1, 2] }],
    ['update', 8, { title: 'Alpha 等2页', color: 'blue' }],
  ]);
});

test('manual group refuses mixed windows or existing groups before changing tabs', async () => {
  for (const other of [
    { id: 2, windowId: 3, url: 'https://b.example', groupId: -1, pinned: false },
    { id: 2, windowId: 2, url: 'https://b.example', groupId: 9, pinned: false },
    { id: 2, windowId: 2, url: 'https://b.example', groupId: -1, pinned: true },
  ]) {
    const { api, calls } = fixture([
      { id: 1, windowId: 2, url: 'https://a.example', groupId: -1, pinned: false }, other,
    ]);
    await assert.rejects(groupSelectedTabs(api, [1, 2]));
    assert.deepEqual(calls, []);
  }
});

test('a selected ungrouped tab is accepted even when its URL is unavailable', async () => {
  const { api, calls } = fixture([
    { id: 1, windowId: 2, groupId: -1, pinned: false },
    { id: 2, windowId: 2, url: 'https://b.example', groupId: -1, pinned: false },
  ]);
  await groupSelectedTabs(api, [1, 2]);
  assert.equal(calls[0][0], 'group');
});

test('manual grouping uses a shared site name or shared title stem', async () => {
  const sameSite = fixture([
    { id: 1, windowId: 1, url: 'https://figma.com/a', title: 'Board A', groupId: -1, pinned: false },
    { id: 2, windowId: 1, url: 'https://figma.com/b', title: 'Board B', groupId: -1, pinned: false },
  ]);
  assert.equal((await groupSelectedTabs(sameSite.api, [1, 2])).title, 'Figma');
  const sharedTitle = fixture([
    { id: 1, windowId: 1, url: 'https://docs.example/a', title: '项目 A · 文档', groupId: -1, pinned: false },
    { id: 2, windowId: 1, url: 'https://tasks.example/b', title: '项目 A · 任务', groupId: -1, pinned: false },
  ]);
  assert.equal((await groupSelectedTabs(sharedTitle.api, [1, 2])).title, '项目 A');
});
