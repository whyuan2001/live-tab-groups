import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describeEventOrigin, releases } from '../history-model.js';

test('event channels do not claim a known operator', () => {
  assert.equal(describeEventOrigin({ source: 'chrome' }), 'Chrome 中观察到 · 操作者未确认');
  assert.equal(describeEventOrigin({ source: 'popup' }), '插件弹窗操作 · 操作者未确认');
  assert.equal(describeEventOrigin({ source: 'browser' }), '浏览器记录 · 操作者未确认');
});

test('release history matches the current product version and keeps strategy versions separate', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url)));
  assert.deepEqual(releases.map(release => release.version), ['1.0.0', '0.12.0', '0.11.0', '0.10.0', '0.9.0', '0.8.0', '0.7.0', '0.6.0']);
  assert.equal(releases[0].version, manifest.version);
  assert.equal(releases[0].groupingVersion, '1.0.0');
  assert.equal(releases[0].namingVersion, '1.1.0');
  assert.match(releases[0].status, /首个正式版候选/);
  assert.match(releases[0].summary, /首个正式版基线/);
  assert.match(releases[1].summary, /一键应用/);
  assert.match(releases[2].summary, /自动命名/);
  assert.match(releases[3].summary, /多选标签/);
  assert.match(releases[4].summary, /手动成组/);
  assert.match(releases[5].summary, /跨窗口/);
  assert.match(releases[6].summary, /工作台/);
  assert.match(releases[7].summary, /本机自动同步/);
  assert.ok(releases.slice(1).every(release => release.status.startsWith('开发版')));
});
