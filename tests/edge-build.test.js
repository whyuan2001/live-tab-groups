import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

test('Edge package has Edge listing text and only user permissions', async () => {
  const root = new URL('../', import.meta.url);
  const result = spawnSync('npm', ['run', 'build:edge'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const dist = new URL('../dist-edge/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', dist), 'utf8'));
  const files = await readdir(dist);
  assert.match(manifest.description, /Edge/);
  assert.deepEqual(manifest.permissions, ['tabs', 'tabGroups', 'storage']);
  assert.equal(manifest.options_page, undefined);
  assert.ok(files.includes('background.js'));
  assert.ok(files.includes('popup.html'));
  assert.ok(!files.includes('history.html'));
});
