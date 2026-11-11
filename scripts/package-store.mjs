import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-store');
const files = [
  'background.js', 'classifier.js', 'manager.js', 'manual-group.js',
  'highlight-grouper.js', 'version-update.js', 'feedback-store.js',
  'feedback-monitor.js', 'rename-collector.js', 'native-sync.js',
  'sync-alarm.js', 'popup.html', 'popup.css', 'popup.js',
];
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
manifest.permissions = ['tabs', 'tabGroups', 'storage'];
manifest.icons = { 128: 'icon-128.png' };
delete manifest.options_page;
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of files) await copyFile(join(root, file), join(dist, file));
await copyFile(join(root, 'assets', 'icon-128.png'), join(dist, 'icon-128.png'));
await writeFile(join(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`商店扩展目录：${dist}`);
