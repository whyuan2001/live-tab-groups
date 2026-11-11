import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.release', 'github-source');
const topFiles = [
  '.gitignore', 'package.json', 'manifest.json',
  'background.js', 'classifier.js', 'manager.js', 'manual-group.js',
  'highlight-grouper.js', 'version-update.js', 'feedback-store.js',
  'feedback-monitor.js', 'rename-collector.js', 'native-sync.js',
  'sync-alarm.js', 'popup.html', 'popup.css', 'popup.js',
  'history.html', 'history.css', 'history.js', 'history-model.js',
  'iteration-analysis.js', 'review-workflow.js', 'strategy-eval.js',
];
const directories = {
  assets: name => name === 'icon-128.png',
  'dev-workbench': name => /\.(js|mjs|css|html)$/.test(name),
  fixtures: name => name.endsWith('.json'),
  scripts: name => name.endsWith('.mjs'),
  tests: name => name.endsWith('.js'),
  'native-host': name => ['host.py', 'test_host.py'].includes(name),
  PUBLISHING: name => ['GITHUB_README.md', 'PRIVACY.md'].includes(name),
};

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of topFiles) await copyFile(join(root, file), join(target, file));
for (const [directory, include] of Object.entries(directories)) {
  await mkdir(join(target, directory), { recursive: true });
  for (const name of await readdir(join(root, directory))) {
    if (include(name)) await copyFile(join(root, directory, name), join(target, directory, name));
  }
}
await copyFile(join(root, 'PUBLISHING', 'GITHUB_README.md'), join(target, 'README.md'));
await copyFile(join(root, 'PUBLISHING', 'PRIVACY.md'), join(target, 'PRIVACY.md'));
await writeFile(join(target, 'native-host', 'local.live_tab_groups.example.json'), `${JSON.stringify({
  name: 'local.live_tab_groups',
  description: '实时标签组本机反馈同步',
  path: '/ABSOLUTE/PATH/TO/host.py',
  type: 'stdio',
  allowed_origins: ['chrome-extension://YOUR_EXTENSION_ID/'],
}, null, 2)}\n`);
for (const file of topFiles) {
  const body = await readFile(join(target, file), 'utf8');
  if (/\/Users\/Valar\/|wh20251029|@gmail\.com/i.test(body)) throw new Error(`公开源码含本机身份信息：${file}`);
}
console.log(`GitHub 公开源码暂存目录：${target}`);
