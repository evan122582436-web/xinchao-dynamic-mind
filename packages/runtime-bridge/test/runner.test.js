import test from 'node:test';
import assert from 'node:assert/strict';
import { runBridge } from '../src/runner.js';

const encoder = new TextEncoder();

test('runs a delivery serially and ACKs only after injector acceptance', async () => {
  const events = [
    'event: connected\ndata: {"protocol":"xinchao-bridge-stream/1"}\n\n',
    'event: delivery\ndata: {"protocol":"xinchao-bridge-stream/1","deliveryId":"delivery-001"}\n\n',
  ];
  const body = new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(event));
      controller.close();
    },
  });
  const calls = [];
  const client = {
    async openStream() { return body; },
    async fetchDelivery(id) {
      calls.push(`fetch:${id}`);
      return {
        protocol: 'xinchao-runtime-wake/1',
        deliveryId: id,
        reason: 'scheduled_interaction',
        message: 'hello',
      };
    },
    async acknowledge(id) { calls.push(`ack:${id}`); },
    async reportFailure(id) { calls.push(`fail:${id}`); },
  };
  const logger = { debug() {}, info() {}, warn() {}, error() {} };
  const config = {
    injector: {
      executable: process.execPath,
      args: ['-e', 'process.stdin.resume(); process.stdin.on("end", () => process.exit(0));'],
      workingDirectory: null,
    },
    timeouts: { injectMs: 3000 },
  };

  await assert.rejects(
    runBridge(config, client, logger, new AbortController().signal),
    /stream ended/,
  );
  assert.deepEqual(calls, ['fetch:delivery-001', 'ack:delivery-001']);
});
