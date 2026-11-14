import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist-store');
const target = join(root, 'dist-edge');
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
manifest.description = '自动整理 Microsoft Edge 原生标签组，并在本机记录分类纠正。';
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
for (const file of await readdir(source)) {
  if (file !== 'manifest.json') await copyFile(join(source, file), join(target, file));
}
await writeFile(join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const files = (await readdir(target)).sort();
const archive = join(root, '.release', `live-tab-groups-edge-v${manifest.version}.zip`);
await mkdir(dirname(archive), { recursive: true });
await rm(archive, { force: true });
execFileSync('zip', ['-q', archive, ...files], { cwd: target });
console.log(`Edge 商店上传包：${archive}`);
