import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// runs/ is read-only; edge cases get their own nights in a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function night(name: string, lines: string[]): string {
  writeFileSync(join(tmp, `${name}.jsonl`), lines.join('\n'));
  return name;
}

const line = (o: object) => JSON.stringify(o);

describe('readNight on runs/', () => {
  it('reads 2026-10-28: 5 jobs, 1 bad line', () => {
    expect(readNight('runs', '2026-10-28')).toEqual({
      night: '2026-10-28',
      badLines: 1,
      rows: [
        {
          job: 'digest/render',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-29T05:41:09+01:00',
          last: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh',
          owner: 'rook',
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: 'upstream 503',
          first: '2026-10-29T01:30:00+01:00',
          last: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync',
          owner: 'rook',
          runs: 8,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'lock held',
          first: '2026-10-28T23:00:06+01:00',
          last: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          first: '2026-10-29T04:00:01+01:00',
          last: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          first: '2026-10-28T23:00:02+01:00',
          last: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('reads 2026-10-27 with no bad lines', () => {
    const n = readNight('runs', '2026-10-27');
    expect(n?.badLines).toBe(0);
    expect(n?.rows.map((r) => r.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });
});

describe('readNight edge cases', () => {
  it('an empty file is a night with no rows', () => {
    expect(readNight(tmp, night('2026-01-01', []))).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts bad lines, skips blank ones, keeps the good lines', () => {
    const ok = { at: '2026-01-02T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' };
    const n = readNight(
      tmp,
      night('2026-01-02', [
        '',
        line(ok),
        '   ',
        '{"at":"2026-01-02T02:00:00+01:00","job":"a"', // cut off
        line({ job: 'a', status: 'ok', owner: 'rook' }), // no at
        line({ at: '2026-01-02T03:00:00+01:00', status: 'ok', owner: 'rook' }), // no job
        line({ ...ok, status: 'skipped' }), // unknown status
        line({ ...ok, status: undefined }), // no status
        '42',
        'null',
        '[]',
        '',
      ]),
    );
    expect(n?.badLines).toBe(8);
    expect(n?.rows).toHaveLength(1);
    expect(n?.rows[0]?.runs).toBe(1);
  });

  it('keeps a row whose owner is null or missing', () => {
    const n = readNight(
      tmp,
      night('2026-01-03', [
        line({ at: '2026-01-03T01:00:00+01:00', job: 'a', status: 'ok', owner: null }),
        line({ at: '2026-01-03T01:00:00+01:00', job: 'b', status: 'ok' }),
      ]),
    );
    expect(n?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', null],
      ['b', null],
    ]);
    expect(n?.badLines).toBe(0);
  });

  it('lastError is the most recent error, even after a later ok', () => {
    const at = '2026-01-04T01:00:00+01:00';
    const n = readNight(
      tmp,
      night('2026-01-04', [
        line({ at, job: 'a', status: 'retry', owner: 'rook', error: 'first' }),
        line({ at, job: 'a', status: 'retry', owner: 'rook', error: 'second' }),
        line({ at, job: 'a', status: 'ok', owner: 'rook' }),
        line({ at, job: 'b', status: 'ok', owner: 'rook' }),
      ]),
    );
    expect(n?.rows.map((r) => [r.job, r.lastStatus, r.lastError, r.retries])).toEqual([
      ['a', 'ok', 'second', 2],
      ['b', 'ok', null, 0],
    ]);
  });

  it('sorts rows by job and keeps times as logged', () => {
    const n = readNight(
      tmp,
      night('2026-01-05', [
        line({ at: '2026-01-05T23:00:00-05:00', job: 'zeta', status: 'ok', owner: 'rook' }),
        line({ at: '2026-01-05T01:00:00+01:00', job: 'alpha', status: 'fail', owner: 'rook', error: 'x' }),
        line({ at: '2026-01-05T02:00:00+01:00', job: 'mid', status: 'ok', owner: 'rook' }),
      ]),
    );
    expect(n?.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);
    expect(n?.rows[2]?.first).toBe('2026-01-05T23:00:00-05:00');
  });

  it('owner is the most recent one that is not null; all null stays null', () => {
    const n = readNight(
      tmp,
      night('2026-01-07', [
        line({ at: '2026-01-07T03:00:00+01:00', job: 'a', status: 'ok', owner: null }),
        line({ at: '2026-01-07T02:00:00+01:00', job: 'a', status: 'ok', owner: 'lane-07' }), // latest non-null by time
        line({ at: '2026-01-07T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' }), // last in the file
        line({ at: '2026-01-07T01:00:00+01:00', job: 'b', status: 'ok', owner: null }),
        line({ at: '2026-01-07T02:00:00+01:00', job: 'b', status: 'ok', owner: null }),
      ]),
    );
    expect(n?.rows.map((r) => [r.job, r.owner])).toEqual([
      ['a', 'lane-07'],
      ['b', null],
    ]);
  });

  it('first, last, lastStatus and lastError follow the time, not the file; ties keep file order', () => {
    const n = readNight(
      tmp,
      night('2026-01-08', [
        line({ at: '2026-01-08T02:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'mid' }),
        line({ at: '2026-01-07T21:00:00-05:00', job: 'a', status: 'ok', owner: 'rook' }), // 03:00+01:00, the latest
        line({ at: '2026-01-08T00:30:00Z', job: 'a', status: 'fail', owner: 'rook', error: 'early' }), // 01:30+01:00
        line({ at: '2026-01-08T01:00:00+01:00', job: 'a', status: 'retry', owner: 'rook', error: 'first' }),
        line({ at: '2026-01-08T00:00:00Z', job: 'a', status: 'retry', owner: 'rook', error: 'tie' }), // same instant
        line({ at: '2026-01-08T01:00:00+01:00', job: 'b', status: 'fail', owner: 'rook', error: 'x' }),
        line({ at: '2026-01-08T00:00:00Z', job: 'b', status: 'ok', owner: 'rook' }), // same instant, later in file
      ]),
    );
    expect(n?.rows).toMatchObject([
      { job: 'a', runs: 5, lastStatus: 'ok', lastError: 'mid', first: '2026-01-08T01:00:00+01:00', last: '2026-01-07T21:00:00-05:00' },
      { job: 'b', runs: 2, lastStatus: 'ok', lastError: 'x', first: '2026-01-08T01:00:00+01:00', last: '2026-01-08T00:00:00Z' },
    ]);
  });

  it('a night that is not YYYY-MM-DD is null, even when the file exists', () => {
    writeFileSync(join(tmp, 'latest.jsonl'), line({ at: '2026-01-09T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' }));
    expect(readNight(tmp, 'latest')).toBeNull();
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull(); // resolves to a real night if not checked
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
    expect(readNight('runs', '20261028')).toBeNull();
    expect(readNight('runs', '')).toBeNull();
  });

  it('a line is bad unless `at` is ISO 8601 with an offset or Z', () => {
    const at = (a: string) => line({ at: a, job: 'a', status: 'ok', owner: 'rook' });
    const n = readNight(
      tmp,
      night('2026-01-10', [
        at('2026-01-10T05:41:09'), // no offset
        at('yesterday'),
        at('1'), // Date.parse reads this as 2001
        at('2026-01-10 05:41:09+01:00'), // space, not T
        at('2026-01-10T05:41+01:00'), // no seconds
        at('2026-02-30T05:41:09Z'), // Date.parse rolls this into March
        at('2026-01-10T24:00:00Z'),
        at('2026-01-10T05:41:09Z'),
        at('2026-01-10T05:41:09+01:00'),
        at('2026-01-10T05:41:09.123Z'),
      ]),
    );
    expect(n?.badLines).toBe(7);
    expect(n?.rows).toMatchObject([
      { job: 'a', runs: 3, first: '2026-01-10T05:41:09+01:00', last: '2026-01-10T05:41:09.123Z' },
    ]);
  });

  it('reads CRLF line endings', () => {
    writeFileSync(
      join(tmp, '2026-01-06.jsonl'),
      line({ at: '2026-01-06T01:00:00+01:00', job: 'a', status: 'ok', owner: 'rook' }) + '\r\n\r\n',
    );
    expect(readNight(tmp, '2026-01-06')).toMatchObject({ rows: [{ job: 'a' }], badLines: 0 });
  });
});
