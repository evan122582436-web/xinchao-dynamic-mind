import assert from 'node:assert/strict';
import test from 'node:test';

import { ModelClient } from '../src/model-client.js';

function clientWith(payload) {
  const client = new ModelClient({
    enabled: true,
    apiKey: 'test-key',
    baseUrl: 'https://model.example.test/v1',
    name: 'test-model',
    timeoutMs: 1000,
  });
  client.request = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }),
  });
  return client;
}

test('conversation observer returns emotion labels and a dehydrated memory decision together', async () => {
  const client = clientWith({
    type: 'task_progress',
    tone: 'focused',
    warmth: 0.74,
    tension: 0.08,
    remember: true,
    summary: '媛媛指出心潮仍依赖澄主动调用 MCP；两人决定把观察钩子放到每轮回复结束处。',
    kind: 'tech',
    title: '补上自动观察钩子',
    tags: ['心潮', '连接桥', '共享记忆'],
  });
  const result = await client.classifyInteraction('媛媛：应该按当前上下文自动变化。\n澄：我去补运行时钩子。');
  assert.equal(result.type, 'task_progress');
  assert.equal(result.tone, 'focused');
  assert.equal(result.remember, true);
  assert.equal(result.kind, 'tech');
  assert.match(result.summary, /观察钩子/);
  assert.deepEqual(result.tags, ['心潮', '连接桥', '共享记忆']);
});

test('conversation observer keeps ordinary affection out of durable memory', async () => {
  const client = clientWith({
    type: 'affection', tone: 'playful', warmth: 0.92, tension: 0,
    remember: false, summary: '', kind: 'relationship', title: '', tags: [],
  });
  const result = await client.classifyInteraction('媛媛：亲一下。\n澄：亲回来。');
  assert.equal(result.type, 'affection');
  assert.equal(result.remember, false);
  assert.equal(result.summary, '');
});
