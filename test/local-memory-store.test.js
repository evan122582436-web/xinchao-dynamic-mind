import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { LocalMemoryStore } from '../src/local-memory-store.js';

test('local memory writes, deduplicates, searches and forgets summaries', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xinchao-memory-'));
  const memory = new LocalMemoryStore(join(dir, 'memory.jsonl'));

  const first = await memory.write({
    kind: 'tech',
    title: '自己的记忆库',
    summary: '小咪和澄决定把本地记忆库作为主记忆，OB 只做可选备份。',
    tags: ['xinchao', 'memory'],
    sourceEventId: 'event-1',
  }, new Date('2026-08-27T10:00:00.000Z'));
  const duplicate = await memory.write({
    kind: 'tech',
    summary: '重复写入不应该新增。',
    sourceEventId: 'event-1',
  }, new Date('2026-08-27T10:01:00.000Z'));

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await memory.recent()).length, 1);
  assert.equal((await memory.search({ query: 'OB 备份' })).length, 1);

  const forgotten = await memory.forget(first.item.id, '测试软删除');
  assert.equal(forgotten.forgotten, true);
  assert.deepEqual(await memory.recent(), []);
});

test('conversation events write context_summary instead of raw state-only copy', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xinchao-memory-'));
  const memory = new LocalMemoryStore(join(dir, 'memory.jsonl'));
  const result = await memory.writeConversationEvent(
    {
      eventId: 'ctx-1',
      interactionType: 'task_progress',
      contextSummary: '小咪和澄开始给心潮加自己的记忆库，先落地本地 JSONL。',
      sessionState: { tone: 'focused' },
    },
    { interaction: { affectedDrives: [{ key: 'duty', label: '责任' }] } },
    { source: 'mcp' },
    new Date('2026-08-27T10:00:00.000Z'),
  );

  assert.equal(result.item.kind, 'tech');
  assert.match(result.item.summary, /自己的记忆库/);
  assert.doesNotMatch(result.item.summary, /窗口语气/);
});
