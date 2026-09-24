import test from 'node:test';
import assert from 'node:assert/strict';
import { SseParser } from '../src/sse-parser.js';

test('parses split SSE chunks, comments, and multiline data', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push(': heartbeat\n\nevent: deli'), []);
  assert.deepEqual(parser.push('very\ndata: {"a":1}\ndata: tail\n\n'), [
    { event: 'delivery', data: '{"a":1}\ntail' },
  ]);
});

test('flushes a final event at EOF', () => {
  const parser = new SseParser();
  parser.push('event: connected\ndata: {}');
  assert.deepEqual(parser.finish(), [{ event: 'connected', data: '{}' }]);
});
