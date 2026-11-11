import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { releases } from '../history-model.js';
import { analyzeFeedback } from '../iteration-analysis.js';
import { summarizeReviewQueue } from '../review-workflow.js';

const root = dirname(fileURLToPath(import.meta.url));
const defaultDataDir = join(homedir(), 'Library', 'Application Support', 'LiveTabGroups', 'data');
const defaultReviewFile = join(root, '..', 'private', 'review-queue.json');
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

async function readStream(dataDir, file) {
  let content;
  try { content = await readFile(join(dataDir, file), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { records: [], invalid: 0 }; throw error; }
  const records = [];
  let invalid = 0;
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try { records.push(JSON.parse(line)); } catch { invalid += 1; }
  }
  return { records, invalid };
}

export async function readWorkbenchData(dataDir = defaultDataDir, reviewFile = defaultReviewFile) {
  const [events, decisions] = await Promise.all([
    readStream(dataDir, 'events.jsonl'),
    readStream(dataDir, 'decisions.jsonl'),
  ]);
  const analysis = analyzeFeedback({ events: events.records, decisions: decisions.records });
  let review = null;
  if (reviewFile) {
    try { review = summarizeReviewQueue(JSON.parse(await readFile(reviewFile, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const fixtures = JSON.parse(await readFile(join(root, '..', 'fixtures', 'strategy-cases.json'), 'utf8'));
  return {
    events: events.records, decisions: decisions.records, invalid: events.invalid + decisions.invalid, releases,
    workflow: { candidates: analysis.summary.corrections, review, fixtures: fixtures.length },
  };
}

export function createWorkbenchServer({ dataDir = defaultDataDir } = {}) {
  return createServer(async (request, response) => {
    const host = request.headers.host || '';
    if (!/^\b(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'");
    if (request.method !== 'GET') { response.writeHead(405).end('Method Not Allowed'); return; }
    try {
      if (request.url === '/api/data') {
        const data = await readWorkbenchData(dataDir);
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        response.end(JSON.stringify(data));
        return;
      }
      const asset = assets.get(new URL(request.url, 'http://127.0.0.1').pathname);
      if (!asset) { response.writeHead(404).end('Not Found'); return; }
      response.writeHead(200, { 'Content-Type': asset[1] });
      response.end(await readFile(join(root, asset[0])));
    } catch (error) {
      console.error('开发者工作台读取失败：', error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('无法读取本机工作台数据');
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.LIVE_TAB_GROUPS_WORKBENCH_PORT || 8765);
  const server = createWorkbenchServer();
  server.listen(port, '127.0.0.1', () => console.log(`开发者工作台：http://127.0.0.1:${port}`));
}
