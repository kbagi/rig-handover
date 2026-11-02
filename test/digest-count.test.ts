import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-count-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('countNight', () => {
  it('counts the nights on runs/ by log line', () => {
    expect(countNight('runs', '2026-10-27')).toEqual({ ok: 7, retry: 0, fail: 0 });
    expect(countNight('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('does not count a bad line in any status', () => {
    const good = (status: string) => JSON.stringify({ at: '2026-10-29T05:00:00+01:00', job: 'a', status });
    const badAt = JSON.stringify({ at: 'yesterday', job: 'a', status: 'fail' });
    writeFileSync(join(tmp, '2026-11-01.jsonl'), [good('ok'), 'not json', badAt, good('nope'), '', good('retry')].join('\n'));
    expect(countNight(tmp, '2026-11-01')).toEqual({ ok: 1, retry: 1, fail: 0 });
  });

  it('is null for a bad night or a missing file', () => {
    expect(countNight(tmp, '../x')).toBeNull();
    expect(countNight(tmp, '2026-11-02')).toBeNull();
  });
});
