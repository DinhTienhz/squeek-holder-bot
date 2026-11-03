import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientTelegramError, retryDelayMs } from '../src/retry.ts';

test('retry: 5xx and 429 are transient, 4xx are not', () => {
  assert.equal(isTransientTelegramError({ error_code: 504 }), true);
  assert.equal(isTransientTelegramError({ error_code: 500 }), true);
  assert.equal(isTransientTelegramError({ error_code: 429 }), true);
  assert.equal(isTransientTelegramError({ error_code: 403 }), false);
  assert.equal(isTransientTelegramError({ error_code: 400 }), false);
});

test('retry: network errors without a code are transient', () => {
  assert.equal(isTransientTelegramError({ message: 'Call to sendMessage failed! (504: Gateway Timeout)' }), true);
  assert.equal(isTransientTelegramError({ message: 'The operation was aborted' }), true);
  assert.equal(isTransientTelegramError({ message: 'ECONNRESET' }), true);
  assert.equal(isTransientTelegramError({ message: 'Bad Request: chat not found' }), false);
});

test('retry: backoff grows and honours Retry-After', () => {
  assert.equal(retryDelayMs(1), 1000);
  assert.equal(retryDelayMs(2), 4000);
  assert.equal(retryDelayMs(3), 16000);
  assert.equal(retryDelayMs(1, 7), 7000);
  assert.equal(retryDelayMs(3, 120), 60000);
});
