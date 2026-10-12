export interface QuotaWindow {
  kind: 'weekly' | 'fiveHour' | 'other';
  label: string;
  durationMinutes: number | null;
  usedPercent: number;
  remainingPercent: number;
  resetsAt: number | null;
}

export interface QuotaSnapshot {
  limitId: string;
  limitName: string;
  windows: QuotaWindow[];
  resetCredits: number | null;
  resetCreditExpiresAt: number | null;
  fetchedAt: number;
}

type RecordValue = Record<string, unknown>;

function object(value: unknown): RecordValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function windowFrom(raw: unknown): QuotaWindow | null {
  const value = object(raw);
  if (!value || number(value.usedPercent) === null) return null;
  const duration = number(value.windowDurationMins);
  const used = Math.max(0, Math.min(100, number(value.usedPercent)!));
  const kind = duration !== null && duration >= 6 * 24 * 60 && duration <= 8 * 24 * 60
    ? 'weekly' : duration !== null && duration >= 240 && duration <= 360
      ? 'fiveHour' : 'other';
  const label = kind === 'weekly' ? '7 天' : kind === 'fiveHour' ? '5 小时'
    : duration !== null && duration >= 24 * 60 ? `${Math.round(duration / 1440)} 天`
      : duration !== null ? `${Math.round(duration / 60)} 小时` : '额度';
  return {
    kind, label, durationMinutes: duration, usedPercent: used,
    remainingPercent: 100 - used, resetsAt: number(value.resetsAt)
  };
}

/** Normalizes only fields actually needed from the app-server protocol. */
export function parseQuotaResponse(raw: unknown, preferredLimitId: string, now = Date.now()): QuotaSnapshot | null {
  const response = object(raw);
  if (!response) return null;
  const buckets = object(response.rateLimitsByLimitId);
  const preferred = buckets && object(buckets[preferredLimitId]);
  const defaultBucket = buckets && object(buckets.codex);
  const firstBucket = buckets && Object.values(buckets).map(object).find(Boolean);
  const selected = preferred || defaultBucket || firstBucket || object(response.rateLimits);
  if (!selected) return null;

  const windows = [windowFrom(selected.primary), windowFrom(selected.secondary)]
    .filter((window): window is QuotaWindow => window !== null)
    .sort((a, b) => (b.durationMinutes ?? 0) - (a.durationMinutes ?? 0));
  const credits = object(response.rateLimitResetCredits);
  const count = number(credits?.availableCount);
  const availableExpiryTimes = Array.isArray(credits?.credits)
    ? credits.credits.map(object)
      .filter((credit): credit is RecordValue => credit !== null && (credit.status === 'available' || credit.status === undefined))
      .map(credit => number(credit.expiresAt))
      .filter((expiresAt): expiresAt is number => expiresAt !== null && expiresAt * 1000 > now)
    : [];
  return {
    limitId: typeof selected.limitId === 'string' ? selected.limitId : preferredLimitId,
    limitName: typeof selected.limitName === 'string' && selected.limitName
      ? selected.limitName : 'Codex',
    windows,
    resetCredits: count === null ? null : Math.max(0, Math.floor(count)),
    resetCreditExpiresAt: count === 0 || !availableExpiryTimes.length ? null : Math.min(...availableExpiryTimes),
    fetchedAt: now
  };
}

export function remainingColor(window: QuotaWindow): string {
  const low = window.remainingPercent <= 20;
  const medium = window.remainingPercent <= 50;
  if (window.kind === 'fiveHour') return low ? '#e58091' : medium ? '#94cfe6' : '#a8d7ec';
  return low ? '#c5687c' : medium ? '#e0939a' : '#f3c1b9';
}

/** Remaining fraction of the window duration until its next reset. */
export function timeRemainingPercent(window: QuotaWindow, now = Date.now()): number | null {
  if (window.resetsAt === null || window.durationMinutes === null || window.durationMinutes <= 0) return null;
  const remainingMilliseconds = window.resetsAt * 1000 - now;
  return Math.max(0, Math.min(100, remainingMilliseconds / (window.durationMinutes * 60_000) * 100));
}

/** Round the countdown up to the unit shown in the status bar. */
export function remainingTimeLabel(window: QuotaWindow, now = Date.now()): string {
  if (window.resetsAt === null) return '—';
  const remainingMilliseconds = Math.max(0, window.resetsAt * 1000 - now);
  if (window.kind === 'weekly' || (window.kind === 'other' && (window.durationMinutes ?? 0) >= 1440)) {
    const totalHours = Math.ceil(remainingMilliseconds / 3_600_000);
    return `${Math.floor(totalHours / 24)}d${totalHours % 24}h`;
  }
  const totalMinutes = Math.ceil(remainingMilliseconds / 60_000);
  return `${Math.floor(totalMinutes / 60)}h${totalMinutes % 60}m`;
}

export function statusBarParts(snapshot: QuotaSnapshot, now = Date.now()): { text: string; kind: QuotaWindow['kind'] | 'summary' }[] {
  const weekly = snapshot.windows.find(window => window.kind === 'weekly');
  const short = snapshot.windows.find(window => window.kind === 'fiveHour');
  const displayed = [weekly, short].filter((window): window is QuotaWindow => window !== undefined);
  if (!displayed.length) displayed.push(...snapshot.windows);
  if (!displayed.length) return [{ text: `Codex : — reset: ${snapshot.resetCredits ?? '—'}`, kind: 'summary' }];
  const times = displayed.map(window => ({
    text: `${remainingTimeLabel(window, now)} / ${window.kind === 'weekly' ? '7d' : window.kind === 'fiveHour' ? '5h' : window.label} : ${Math.round(window.remainingPercent)}%`,
    kind: window.kind
  }));
  return [...times, { text: `reset: ${snapshot.resetCredits ?? '—'}`, kind: 'summary' }];
}

export function statusBarText(snapshot: QuotaSnapshot, now = Date.now()): string {
  return statusBarParts(snapshot, now).map(part => part.text).join(' ');
}
