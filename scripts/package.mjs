import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const files = ['manifest.json', 'classifier.js', 'manager.js', 'manual-group.js', 'highlight-grouper.js', 'version-update.js', 'feedback-store.js', 'feedback-monitor.js', 'rename-collector.js', 'native-sync.js', 'sync-alarm.js', 'background.js', 'popup.html', 'popup.css', 'popup.js', 'history.html', 'history.css', 'history.js', 'history-model.js'];
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3 || !files.includes(manifest.background.service_worker) || !files.includes(manifest.action.default_popup)) {
  throw new Error('扩展清单缺少必要入口');
}
await mkdir(dist, { recursive: true });
for (const file of files) await copyFile(join(root, file), join(dist, file));
console.log(`可在 Chrome 加载的扩展目录：${dist}`);
