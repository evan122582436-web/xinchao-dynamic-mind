import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverToInjector } from '../src/injector.js';

test('delivers one JSON line without shell or bridge token', async () => {
  let invocation;
  let input = '';
  const spawnImpl = (executable, args, options) => {
    invocation = { executable, args, options };
    const child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    child.stdin.setEncoding('utf8');
    child.stdin.on('data', (chunk) => { input += chunk; });
    child.stdin.on('finish', () => queueMicrotask(() => child.emit('exit', 0, null)));
    return child;
  };
  const previous = process.env.XINCHAO_BRIDGE_MACHINE_TOKEN;
  process.env.XINCHAO_BRIDGE_MACHINE_TOKEN = 'must-not-leak';
  try {
    await deliverToInjector({
      protocol: 'xinchao-runtime-wake/1',
      deliveryId: 'delivery-001',
      reason: 'scheduled_interaction',
      message: 'hello',
    }, {
      injector: { executable: 'node', args: ['adapter.mjs'], workingDirectory: null },
      timeouts: { injectMs: 1000 },
    }, { spawnImpl });
  } finally {
    if (previous === undefined) delete process.env.XINCHAO_BRIDGE_MACHINE_TOKEN;
    else process.env.XINCHAO_BRIDGE_MACHINE_TOKEN = previous;
  }

  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.env.XINCHAO_BRIDGE_MACHINE_TOKEN, undefined);
  assert.equal(JSON.parse(input).deliveryId, 'delivery-001');
  assert.ok(input.endsWith('\n'));
});

test('webhook mode requires a matching delivery acknowledgement', async () => {
  let request;
  const envelope = {
    protocol: 'xinchao-runtime-wake/1',
    deliveryId: 'delivery-webhook-001',
    reason: 'user_note',
    message: '醒来后还有一小片海留在身上。',
  };
  await deliverToInjector(envelope, {
    injector: {
      mode: 'webhook',
      webhookUrl: new URL('https://runtime.example/xinchao/wake'),
      webhookToken: 'webhook-token-with-enough-entropy',
    },
    timeouts: { injectMs: 1000 },
  }, {
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ accepted: true, deliveryId: envelope.deliveryId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  });
  assert.equal(request.url.href, 'https://runtime.example/xinchao/wake');
  assert.equal(request.options.headers.Authorization, 'Bearer webhook-token-with-enough-entropy');
  assert.equal(JSON.parse(request.options.body).message, envelope.message);

  await assert.rejects(() => deliverToInjector(envelope, {
    injector: { mode: 'webhook', webhookUrl: new URL('https://runtime.example/xinchao/wake'), webhookToken: null },
    timeouts: { injectMs: 1000 },
  }, {
    fetchImpl: async () => new Response(JSON.stringify({ accepted: true, deliveryId: 'wrong' }), { status: 200 }),
  }), /matching deliveryId/);
});
