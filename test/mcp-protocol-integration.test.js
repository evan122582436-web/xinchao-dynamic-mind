import test from 'node:test';
import assert from 'node:assert/strict';
import { handleMcpMessage } from '../src/mcp-protocol.js';
import { SYSTEM_VERSION } from '../src/version.js';

const request = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params });

test('MCP handshake reports the shared runtime version', async () => {
  const result = await handleMcpMessage(request('initialize', {
    protocolVersion: '2025-06-18',
  }), {});
  assert.equal(result.status, 200);
  assert.equal(result.body.result.serverInfo.version, SYSTEM_VERSION);
});

test('tools/list keeps Xinchao, board and curated OB tools together', async () => {
  const result = await handleMcpMessage(request('tools/list'), {
    boardEnabled: true,
    listObTools: async () => [
      { name: 'breath', description: 'memory', inputSchema: { type: 'object' } },
      { name: 'purge', description: 'must stay hidden', inputSchema: { type: 'object' } },
    ],
  });
  const names = result.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('xinchao_context'));
  assert.ok(names.includes('xinchao_pending_create'));
  assert.ok(names.includes('xinchao_pending_consumed'));
  assert.ok(names.includes('xinchao_personality_reflect'));
  assert.ok(names.includes('xinchao_memory_write'));
  assert.ok(names.includes('xinchao_memory_recent'));
  assert.ok(names.includes('xinchao_memory_search'));
  assert.ok(names.includes('xinchao_memory_forget'));
  assert.equal(names.includes('xinchao_pending_hold'), false);
  assert.equal(names.includes('xinchao_pending_drop'), false);
  assert.ok(names.includes('board_post'));
  assert.ok(names.includes('board_read'));
  assert.ok(names.includes('breath'));
  assert.equal(names.includes('purge'), false);
});

test('AI can submit one complete monthly personality reflection through MCP', async () => {
  let received;
  const dimensions = [
    'joy', 'sorrow', 'anger', 'fear', 'disgust', 'surprise', 'love',
    'shame', 'trust', 'desire', 'calm', 'cognition', 'conflict', 'expression',
  ].map((key) => ({ key, score: 70, reason: `AI 回顾 ${key}` }));
  const result = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_personality_reflect',
    arguments: { month: '2026-08', dimensions },
  }), {
    personalityReflect: async (input) => {
      received = input;
      return { month: input.month, duplicate: false };
    },
  });
  assert.equal(result.body.result.isError, false);
  assert.equal(received.month, '2026-08');
  assert.equal(received.dimensions.length, 14);
});

test('AI may create and acknowledge pending output but cannot choose user disposition', async () => {
  let created;
  let consumed;
  const handlers = {
    pendingCreate: async (input) => {
      created = input;
      return { item: { id: 'pending_1', ...input }, duplicate: false, revision: 2 };
    },
    pendingConsumed: async (input) => {
      consumed = input;
      return { consumed: input.ids, revision: 3 };
    },
  };
  const createResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_pending_create',
    arguments: { kind: 'share', content: '下午翻到一件想等她回来说的事。', source_ombre_bucket_ids: ['bucket_a'] },
  }), handlers);
  assert.equal(createResult.body.result.isError, false);
  assert.deepEqual(created.sourceOmbreBucketIds, ['bucket_a']);

  const consumedResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_pending_consumed', arguments: { ids: ['pending_1'] },
  }), handlers);
  assert.equal(consumedResult.body.result.isError, false);
  assert.deepEqual(consumed.ids, ['pending_1']);
});

test('xinchao_event accepts context_summary and reports local memory id', async () => {
  let received;
  const result = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_event',
    arguments: {
      event_id: 'context-event-1',
      interaction_type: 'task_progress',
      context_summary: '小咪和澄开始给心潮加自己的记忆库。',
      tone: 'focused',
    },
  }), {
    defaultSessionId: 'session-1',
    event: async (event) => {
      received = event;
      return {
        revision: 7,
        consciousness: 'awake',
        sessionId: event.sessionId,
        sessionCreated: false,
        duplicate: false,
        interaction: { type: event.interactionType, reasonCode: 'ok' },
        settledHours: 0,
        autoMemory: { ok: true, id: 'memory-1' },
      };
    },
  });
  assert.equal(result.body.result.isError, false);
  assert.equal(received.contextSummary, '小咪和澄开始给心潮加自己的记忆库。');
  assert.match(result.body.result.content[0].text, /memory=memory-1/);
});

test('AI can read and write local memories through MCP', async () => {
  let written;
  const handlers = {
    memoryWrite: async (input) => {
      written = input;
      return { item: { id: 'mem-1', createdAt: '2026-08-27T10:00:00.000Z', kind: input.kind, title: input.title, summary: input.summary, tags: input.tags }, duplicate: false };
    },
    memoryRecent: async () => [
      { id: 'mem-1', createdAt: '2026-08-27T10:00:00.000Z', kind: 'tech', title: '小家记忆', summary: '本地记忆库已接入。', tags: ['xinchao'] },
    ],
  };
  const writeResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_memory_write',
    arguments: { kind: 'tech', title: '小家记忆', summary: '本地记忆库已接入。', tags: ['xinchao'] },
  }), handlers);
  assert.equal(writeResult.body.result.isError, false);
  assert.equal(written.summary, '本地记忆库已接入。');

  const recentResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_memory_recent',
    arguments: { limit: 3 },
  }), handlers);
  assert.equal(recentResult.body.result.isError, false);
  assert.match(recentResult.body.result.content[0].text, /本地记忆库已接入/);
});

test('OB failure does not remove Xinchao or board tools', async () => {
  const result = await handleMcpMessage(request('tools/list'), {
    boardEnabled: true,
    listObTools: async () => { throw new Error('offline'); },
  });
  const names = result.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('xinchao_event'));
  assert.ok(names.includes('board_post'));
  assert.ok(names.includes('board_read'));
});
