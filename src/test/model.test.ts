import assert from 'node:assert/strict';
import test from 'node:test';
import { parseQuotaResponse, remainingTimeLabel, statusBarParts, statusBarText, timeRemainingPercent } from '../model';

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
  assert.equal(result?.resetCreditExpiresAt, null);
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
  assert.equal(zero?.resetCreditExpiresAt, null);
});

test('uses the nearest known expiration of an available reset credit', () => {
  const result = parseQuotaResponse({
    rateLimits: { primary: { usedPercent: 25, windowDurationMins: 300 } },
    rateLimitResetCredits: {
      availableCount: 4,
      credits: [
        { status: 'available', expiresAt: 2_000 },
        { status: 'consumed', expiresAt: 1_100 },
        { status: 'available', expiresAt: 1_500 },
        { status: 'available', expiresAt: 900 },
        { status: 'available', expiresAt: null }
      ]
    }
  }, 'codex', 1_000_000);
  assert.equal(result?.resetCredits, 4);
  assert.equal(result?.resetCreditExpiresAt, 1_500);
});

test('time remaining is derived from reset time and window length', () => {
  const window = { kind: 'fiveHour' as const, label: '5 小时', durationMinutes: 300, usedPercent: 20, remainingPercent: 80, resetsAt: 18_000 };
  assert.equal(timeRemainingPercent(window, 0), 100);
  assert.equal(timeRemainingPercent(window, 9_000_000), 50);
  assert.equal(timeRemainingPercent(window, 20_000_000), 0);
  assert.equal(timeRemainingPercent({ ...window, resetsAt: null }), null);
});

test('status countdown rounds weekly hours and five-hour minutes upward', () => {
  const weekly = { kind: 'weekly' as const, label: '7 天', durationMinutes: 10080, usedPercent: 12, remainingPercent: 88, resetsAt: 100_000 };
  const fiveHour = { kind: 'fiveHour' as const, label: '5 小时', durationMinutes: 300, usedPercent: 38, remainingPercent: 62, resetsAt: 100_000 };
  const now = 100_000_000 - (26 * 3_600_000 + 1);
  assert.equal(remainingTimeLabel(weekly, now), '1d3h');
  assert.equal(remainingTimeLabel(weekly, now + 1), '1d2h');
  assert.equal(remainingTimeLabel(fiveHour, 100_000_000 - (2 * 3_600_000 + 14 * 60_000 + 1)), '2h15m');
  assert.equal(remainingTimeLabel(fiveHour, 100_000_000 - (2 * 3_600_000 + 14 * 60_000)), '2h14m');
  assert.equal(remainingTimeLabel(weekly, 100_000_001), '0d0h');
  assert.equal(remainingTimeLabel({ ...fiveHour, resetsAt: null }, now), '—');

  const snapshot = { limitId: 'codex', limitName: 'Codex', windows: [weekly, fiveHour], resetCredits: 3, resetCreditExpiresAt: null, fetchedAt: now };
  const displayTime = 100_000_000 - (2 * 3_600_000 + 14 * 60_000 + 1);
  assert.deepEqual(statusBarParts(snapshot, displayTime), [
    { text: '0d3h / 7d : 88%', kind: 'weekly' },
    { text: '2h15m / 5h : 62%', kind: 'fiveHour' },
    { text: 'reset: 3', kind: 'summary' }
  ]);
  assert.equal(statusBarText(snapshot, displayTime), '0d3h / 7d : 88% 2h15m / 5h : 62% reset: 3');
  assert.deepEqual(statusBarParts({ ...snapshot, windows: [fiveHour] }, displayTime).map(part => part.kind), ['fiveHour', 'summary']);
  assert.equal(statusBarParts({ ...snapshot, windows: [] }, displayTime).length, 1);
});
