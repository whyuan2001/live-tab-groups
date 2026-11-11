import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

test('public store package excludes developer-only entry points and permissions', async () => {
  const root = new URL('../', import.meta.url);
  const result = spawnSync(process.execPath, ['scripts/package-store.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const dist = new URL('../dist-store/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', dist), 'utf8'));
  const files = await readdir(dist);
  assert.equal(manifest.version, '1.0.0');
  assert.deepEqual(manifest.permissions, ['tabs', 'tabGroups', 'storage']);
  assert.equal(manifest.options_page, undefined);
  assert.equal(manifest.icons['128'], 'icon-128.png');
  assert.ok(files.includes('background.js'));
  assert.ok(files.includes('popup.html'));
  assert.ok(files.includes('icon-128.png'));
  assert.ok(!files.includes('history.html'));
  assert.ok(!files.includes('local.live_tab_groups.json'));
  assert.ok(!files.includes('host.py'));
  for (const file of files.filter(name => name.endsWith('.js'))) {
    const body = await readFile(new URL(file, dist), 'utf8');
    for (const [, dependency] of body.matchAll(/\bfrom\s+['"]\.\/([^'"]+)['"]/g)) {
      assert.ok(files.includes(dependency), `${file} imports missing ${dependency}`);
    }
  }
});
