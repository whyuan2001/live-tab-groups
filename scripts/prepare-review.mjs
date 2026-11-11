import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkbenchData } from '../dev-workbench/server.mjs';
import { analyzeFeedback } from '../iteration-analysis.js';
import { buildReviewQueue, summarizeReviewQueue } from '../review-workflow.js';
import { releases } from '../history-model.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const path = join(root, 'private', 'review-queue.json');
const { events, decisions } = await readWorkbenchData();
if (!events.length && !decisions.length) throw new Error('尚无本机镜像数据，未创建审核队列');
let previous = { cases: [] };
try { previous = JSON.parse(await readFile(path, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const eventsById = new Map(events.map(event => [event.id, event]));
const decisionsById = new Map(decisions.map(decision => [decision.id, decision]));
const analysis = analyzeFeedback({ events, decisions });
analysis.cases = analysis.cases.map(item => ({
  ...item,
  evidence: {
    eventTabs: eventsById.get(item.eventId)?.tabs || [],
    decisionTabs: decisionsById.get(item.decisionId)?.tabs || [],
  },
}));
const queue = buildReviewQueue(analysis, previous, releases[0].version);
await mkdir(dirname(path), { recursive: true });
const temporary = `${path}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(queue, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, path);
const summary = summarizeReviewQueue(queue);
console.log(`待人工核对 ${summary.pending} 条；已确认 ${summary.approved} 条；排除 ${summary.rejected} 条。`);
console.log(`本机审核队列：${path}`);
console.log('本命令不会修改分组算法、策略版本或扩展。');
