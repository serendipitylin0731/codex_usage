import assert from 'node:assert/strict';
import test from 'node:test';
import { RefreshPolicy, RETRY_FAILURE_LIMIT, RETRY_INTERVAL_MS } from '../refreshPolicy';

test('first failure starts three-second retries and ten failed retries reveal the error', () => {
  const policy = new RefreshPolicy();
  assert.equal(RETRY_INTERVAL_MS, 3_000);
  policy.fail('initial failure', false);
  assert.equal(policy.isRetrying, true);
  assert.equal(policy.visibleError, null);

  for (let attempt = 1; attempt < RETRY_FAILURE_LIMIT; attempt++) {
    policy.fail(`retry ${attempt}`, true);
    assert.equal(policy.visibleError, null);
  }
  policy.fail('retry 10', true);
  assert.equal(policy.visibleError, 'retry 10');
});

test('manual failures do not consume scheduled retries and success clears the error', () => {
  const policy = new RefreshPolicy();
  policy.fail('initial failure', false);
  policy.fail('manual failure', false);
  for (let attempt = 0; attempt < RETRY_FAILURE_LIMIT - 1; attempt++) policy.fail('retry failure', true);
  assert.equal(policy.visibleError, null);
  policy.fail('retry failure', true);
  assert.equal(policy.visibleError, 'retry failure');

  policy.reset();
  assert.equal(policy.isRetrying, false);
  assert.equal(policy.visibleError, null);
  policy.fail('new initial failure', false);
  assert.equal(policy.visibleError, null);
});
