import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkbenchData } from '../dev-workbench/server.mjs';

test('local workbench reads mirrored records without changing them', async () => {
  const dataDir = await mkdtemp(join(tmpdir(), 'live-tab-groups-workbench-'));
  await writeFile(join(dataDir, 'events.jsonl'), `${JSON.stringify({ id: 'e1', kind: 'group_renamed', time: '2026-11-09T00:00:00Z', before: 'A', after: 'B' })}\n`);
  try {
    const data = await readWorkbenchData(dataDir, null);
    assert.equal(data.events.length, 1);
    assert.equal(data.events[0].id, 'e1');
    assert.equal(data.decisions.length, 0);
    assert.equal(data.releases[0].version, '1.0.0');
    assert.equal(data.workflow.candidates, 1);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
