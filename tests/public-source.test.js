import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

test('public GitHub source staging contains product code without local private configuration', async () => {
  const root = new URL('../', import.meta.url);
  const run = spawnSync(process.execPath, ['scripts/prepare-public-source.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const source = new URL('../.release/github-source/', import.meta.url);
  const files = await readdir(source);
  assert.ok(files.includes('README.md'));
  assert.ok(files.includes('PRIVACY.md'));
  assert.ok(files.includes('background.js'));
  assert.ok(files.includes('tests'));
  assert.ok(files.includes('assets'));
  assert.ok(files.includes('PUBLISHING'));
  assert.ok(!files.includes('PROJECT_STATE.md'));
  assert.ok(!files.includes('private'));
  const hostFiles = await readdir(new URL('native-host/', source));
  assert.ok(hostFiles.includes('local.live_tab_groups.example.json'));
  assert.ok(!hostFiles.includes('local.live_tab_groups.json'));
  const publishingFiles = await readdir(new URL('PUBLISHING/', source));
  assert.deepEqual(publishingFiles.sort(), ['GITHUB_README.md', 'PRIVACY.md']);
  const readme = await readFile(new URL('README.md', source), 'utf8');
  assert.match(readme, /Releases/);
  assert.match(readme, /加载已解压的扩展程序/);
});
