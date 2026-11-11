import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { analyzeFeedback } from '../iteration-analysis.js';

const [inputPath, flag, outputPath] = process.argv.slice(2);
const usingLocalMirror = !inputPath || inputPath === '--out';
const actualFlag = inputPath === '--out' ? inputPath : flag;
const actualOutputPath = inputPath === '--out' ? flag : outputPath;
if ((actualFlag && actualFlag !== '--out') || (actualFlag === '--out' && !actualOutputPath)) {
  console.error('用法：npm run analyze -- [导出的 JSON 文件] [--out 本地报告路径]');
  process.exit(2);
}
const localData = join(homedir(), 'Library', 'Application Support', 'LiveTabGroups', 'data');
async function readJsonl(path) {
  try { return (await readFile(path, 'utf8')).split('\n').filter(Boolean).map(line => JSON.parse(line)); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
const data = usingLocalMirror
  ? { events: await readJsonl(join(localData, 'events.jsonl')), decisions: await readJsonl(join(localData, 'decisions.jsonl')) }
  : JSON.parse(await readFile(inputPath, 'utf8'));
if (usingLocalMirror && !data.events.length && !data.decisions.length) throw new Error('尚无自动同步数据；请先检查扩展记录页的同步状态');
const result = analyzeFeedback(data);
console.log(`生成记录 ${result.summary.generated} 条；待核对纠错 ${result.summary.corrections} 条（命名 ${result.summary.naming}，分组 ${result.summary.grouping}）；未关联生成记录 ${result.summary.unmatched} 条。`);
for (const pattern of result.patterns.slice(0, 10)) {
  console.log(`${pattern.count} 次 · ${pattern.type === 'naming' ? '命名' : '分组'} · ${pattern.site || '未知站点'} · ${pattern.before || '—'} → ${pattern.after || '—'}`);
}
if (actualOutputPath) {
  await writeFile(actualOutputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`完整本地报告已写入：${actualOutputPath}`);
}
