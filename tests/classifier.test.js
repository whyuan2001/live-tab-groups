import test from 'node:test';
import assert from 'node:assert/strict';
import { createRule, classifyTab, shouldManageTab, pageKey, automaticSite } from '../classifier.js';

test('page rule wins over site and title rules', () => {
  const tab = { url: 'https://github.com/acme/repo/issues/1?tab=comments', title: 'Release notes', pinned: false, groupId: -1 };
  const rules = [
    { id: 'title', type: 'title', pattern: 'release', group: '阅读', color: 'blue' },
    { id: 'site', type: 'site', pattern: 'github.com', group: '开发', color: 'green' },
    { id: 'page', type: 'page', pattern: 'https://github.com/acme/repo/issues/1', group: '项目', color: 'red' },
  ];
  assert.equal(classifyTab(tab, rules).group, '项目');
});

test('page keys drop query and fragment but keep path', () => {
  assert.equal(pageKey('https://Example.com/a/?q=1#top'), 'https://example.com/a/');
});

test('newer correction wins for same scope and match', () => {
  const tab = { url: 'https://example.com/x', title: 'News' };
  const rules = [
    { id: 'old', type: 'site', pattern: 'example.com', group: '旧组', color: 'blue' },
    { id: 'new', type: 'site', pattern: 'example.com', group: '新组', color: 'red' },
  ];
  assert.equal(classifyTab(tab, rules).group, '新组');
});

test('createRule records the selected scope', () => {
  const tab = { url: 'https://www.example.com/post?id=1', title: 'A release plan' };
  assert.equal(createRule(tab, 'site', '发布', 'red').pattern, 'www.example.com');
  assert.equal(createRule(tab, 'page', '发布', 'red').pattern, 'https://www.example.com/post');
  assert.equal(createRule(tab, 'title', '发布', 'red', 'release').pattern, 'release');
});

test('pinned, non-web and manually grouped tabs are protected', () => {
  assert.equal(shouldManageTab({ url: 'https://example.com', pinned: true, groupId: -1 }, null), false);
  assert.equal(shouldManageTab({ url: 'chrome://settings', pinned: false, groupId: -1 }, null), false);
  assert.equal(shouldManageTab({ url: 'https://example.com', pinned: false, groupId: 3 }, null), false);
  assert.equal(shouldManageTab({ url: 'https://example.com', pinned: false, groupId: 3 }, 3), true);
});

test('automatic site labels are readable and local addresses are excluded', () => {
  assert.deepEqual(automaticSite('https://www.figma.com/file/1'), { site: 'figma.com', group: 'Figma', color: 'purple' });
  assert.equal(automaticSite('http://127.0.0.1:3000'), null);
  assert.equal(automaticSite('http://localhost:3000'), null);
});
