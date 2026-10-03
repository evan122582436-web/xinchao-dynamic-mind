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
  assert.ok(names.includes('xinchao_box'));
  assert.equal(names.includes('xinchao_pending_create'), false);
  assert.equal(names.includes('xinchao_pending_consumed'), false);
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

test('xinchao_event accepts a dehydrated summary and reports its durable memory id', async () => {
  let received;
  const result = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_event',
    arguments: {
      event_id: 'context-event-1',
      interaction_type: 'task_progress',
      context_summary: '媛媛和澄把心潮、OB 与小家的共享记忆链重新接通。',
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
        autoMemory: { local: { ok: true, id: 'memory-1' }, ombre: { ok: true, bucketId: 'bucket-1' } },
      };
    },
  });
  assert.equal(result.body.result.isError, false);
  assert.equal(received.contextSummary, '媛媛和澄把心潮、OB 与小家的共享记忆链重新接通。');
  assert.match(result.body.result.content[0].text, /memory=memory-1/);
});

test('AI can read and write local memories through MCP', async () => {
  let written;
  const handlers = {
    memoryWrite: async (input) => {
      written = input;
      return { item: { id: 'mem-1', createdAt: '2026-10-03T10:00:00.000Z', kind: input.kind, title: input.title, summary: input.summary, tags: input.tags }, duplicate: false };
    },
    memoryRecent: async () => [
      { id: 'mem-1', createdAt: '2026-10-03T10:00:00.000Z', kind: 'tech', title: '共享记忆', summary: '本地耐久摘要已经接入。', tags: ['xinchao'] },
    ],
  };
  const writeResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_memory_write',
    arguments: { kind: 'tech', title: '共享记忆', summary: '本地耐久摘要已经接入。', tags: ['xinchao'] },
  }), handlers);
  assert.equal(writeResult.body.result.isError, false);
  assert.equal(written.summary, '本地耐久摘要已经接入。');

  const recentResult = await handleMcpMessage(request('tools/call', {
    name: 'xinchao_memory_recent', arguments: { limit: 3 },
  }), handlers);
  assert.equal(recentResult.body.result.isError, false);
  assert.match(recentResult.body.result.content[0].text, /本地耐久摘要已经接入/);
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

test('hidden tools disappear from tools/list', async () => {
  const result = await handleMcpMessage(request('tools/list'), { toolsHide: new Set(['xinchao_pending_create']) });
  const names = result.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('xinchao_box'));
  assert.ok(!names.includes('xinchao_pending_create'));
});

test('xinchao_* tool replies carry a trailing now-line; xinchao_context does not', async () => {
  const handlers = {
    nowLine: async () => '此刻：想她（涌）；情绪 安心',
    handoffNote: async () => ({ revision: 3, duplicate: false }),
    context: async () => ({ delivered: true, additionalContext: 'ctx', sections: [] }),
  };
  const note = await handleMcpMessage(request('tools/call', { name: 'xinchao_handoff_note', arguments: { event_id: 'evt-000001', note: 'x', session_id: 's' } }), handlers);
  assert.match(note.body.result.content[0].text, /此刻：想她（涌）/);
  const ctx = await handleMcpMessage(request('tools/call', { name: 'xinchao_context', arguments: { session_id: 's' } }), handlers);
  assert.doesNotMatch(ctx.body.result.content[0].text, /此刻：/);
});
