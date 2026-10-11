import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuotaResponse, timeRemainingPercent } from '../model';

test('prefers requested bucket and orders weekly ring outside five-hour ring', () => {
  const result = parseQuotaResponse({
    rateLimits: { primary: { usedPercent: 99 } },
    rateLimitsByLimitId: {
      codex: { limitId: 'codex', primary: { usedPercent: 50, windowDurationMins: 300, resetsAt: 100 }, secondary: { usedPercent: 8, windowDurationMins: 10080, resetsAt: 200 } },
      other: { limitId: 'other', primary: { usedPercent: 20, windowDurationMins: 10080 } }
    },
    rateLimitResetCredits: { availableCount: 3 }
  }, 'codex', 1234);
  assert.equal(result?.resetCredits, 3);
  assert.deepEqual(result?.windows.map(window => [window.kind, window.remainingPercent]), [['weekly', 92], ['fiveHour', 50]]);
  assert.equal(result?.fetchedAt, 1234);
});

test('single-window account and unavailable reset credits remain distinct from zero', () => {
  const result = parseQuotaResponse({ rateLimits: { primary: { usedPercent: 125, windowDurationMins: 10080 } } }, 'codex');
  assert.equal(result?.windows.length, 1);
  assert.equal(result?.windows[0].remainingPercent, 0);
  assert.equal(result?.resetCredits, null);
  const zero = parseQuotaResponse({ rateLimits: {}, rateLimitResetCredits: { availableCount: 0 } }, 'codex');
  assert.equal(zero?.resetCredits, 0);
});

test('time remaining is derived from reset time and window length', () => {
  const window = { kind: 'fiveHour' as const, label: '5 小时', durationMinutes: 300, usedPercent: 20, remainingPercent: 80, resetsAt: 18_000 };
  assert.equal(timeRemainingPercent(window, 0), 100);
  assert.equal(timeRemainingPercent(window, 9_000_000), 50);
  assert.equal(timeRemainingPercent(window, 20_000_000), 0);
  assert.equal(timeRemainingPercent({ ...window, resetsAt: null }), null);
});
