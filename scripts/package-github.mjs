import { execFileSync } from 'node:child_process';
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-store');
const manifest = JSON.parse(await readFile(join(dist, 'manifest.json'), 'utf8'));
const files = (await readdir(dist)).sort();
if (manifest.manifest_version !== 3 || !files.includes('background.js') || !files.includes('popup.html')) {
  throw new Error('公开扩展目录缺少必要入口');
}
if (manifest.permissions.some(permission => ['nativeMessaging', 'alarms'].includes(permission))) {
  throw new Error('用户安装包含开发者专用权限');
}
const releaseDir = join(root, '.release');
const archive = join(releaseDir, `live-tab-groups-v${manifest.version}-install.zip`);
await mkdir(releaseDir, { recursive: true });
await rm(archive, { force: true });
execFileSync('zip', ['-q', archive, ...files], { cwd: dist });
console.log(`GitHub Releases 用户安装包：${archive}`);
