import { readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { approvedDataset } from '../review-workflow.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const queuePath = join(root, 'private', 'review-queue.json');
const outputPath = join(root, 'private', 'approved-dataset.json');
const dataset = approvedDataset(JSON.parse(await readFile(queuePath, 'utf8')));
const temporary = `${outputPath}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(dataset, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, outputPath);
console.log(`人工确认案例 ${dataset.cases.length} 条；数据集：${outputPath}`);
console.log('本命令不会修改分组算法、策略版本或扩展。');
