import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

// Plan morning-digest § 1. runs/<night>.jsonl into one row per job. A bad line is counted, never
// thrown: the night still renders.

// Same shape as the nights on disk (status.ts). Anything else is no night, before any path is built.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

const isStatus = (s: unknown): s is RunStatus => s === 'ok' || s === 'retry' || s === 'fail';

// ISO 8601 with an offset or Z, like every line in runs/: 2026-10-29T05:41:09+01:00. Fractional
// seconds are allowed (toISOString writes them). Date.parse alone would roll 02-30 into March and
// take 24:00, so the calendar date and the hour are checked too.
const AT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function timeOf(at: string): number | null {
  const m = AT.exec(at);
  if (!m) return null;
  const [y, mo, d, h] = m.slice(1, 5).map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d || h > 23) return null;
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : t;
}

// The edge: a line that can't be a RunLine comes back null and is counted as bad. `t` is `at` as a
// number, only for ordering; `at` itself stays as logged.
function parseLine(raw: string): { line: RunLine; t: number } | null {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const { at, job, status, owner, error } = v as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  const t = timeOf(at);
  if (t === null) return null;
  return {
    line: {
      at,
      job,
      status,
      owner: typeof owner === 'string' ? owner : null,
      ...(typeof error === 'string' ? { error } : {}),
    },
    t,
  };
}

// The night's file as text; null for a night that isn't YYYY-MM-DD or has no file.
function readNightText(runsDir: string, night: string): string | null {
  if (!NIGHT.test(night)) return null;
  try {
    return readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}

export const readNight: ReadNight = (runsDir, night) => {
  const text = readNightText(runsDir, night);
  if (text === null) return null;

  const timed: { line: RunLine; t: number }[] = [];
  let badLines = 0;
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const parsed = parseLine(raw);
    if (parsed) timed.push(parsed);
    else badLines++;
  }
  // Fold in time order, not file order; the sort is stable, so ties keep file order.
  timed.sort((a, b) => a.t - b.t);

  const byJob = new Map<string, DigestRow>();
  for (const { line } of timed) {
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        first: line.at,
        last: line.at,
      });
      continue;
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    if (line.owner !== null) row.owner = line.owner; // the most recent owner that isn't null
    row.last = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};

// Log lines by status, for the board's links (plan § 2c). Not jobs: a job that retried twice and
// then went ok is two retry lines and one ok line. A bad line is in none of the three.
export type StatusCounts = Record<RunStatus, number>;

export function countNight(runsDir: string, night: string): StatusCounts | null {
  const text = readNightText(runsDir, night);
  if (text === null) return null;
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const parsed = parseLine(raw);
    if (parsed) counts[parsed.line.status]++;
  }
  return counts;
}
