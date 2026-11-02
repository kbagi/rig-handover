import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

// runs/ is read-only; these routes read nights from a temp dir.
const runsDir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
const app = createApp(config);

const line = (o: object) => JSON.stringify(o);
const write = (name: string, lines: string[]) => writeFileSync(join(runsDir, `${name}.jsonl`), lines.join('\n'));

// Written out of job order on purpose: the rows must come back sorted by job.
write('2026-11-01', [
  line({ at: '2026-11-01T22:00:00+01:00', job: 'zeta-sync', status: 'ok', owner: 'rook' }),
  line({ at: '2026-11-01T23:00:00+01:00', job: 'alpha-backup', status: 'fail', owner: null, error: 'quota exceeded' }),
  line({ at: '2026-11-01T23:30:00+01:00', job: 'mid-refresh', status: 'ok', owner: 'lane-07' }),
]);
write('2026-11-02', []);
write('2026-11-03', [
  line({ at: '2026-11-03T01:00:00+01:00', job: 'good-two', status: 'ok', owner: 'rook' }),
  'this is not json',
  line({ at: '2026-11-03T02:00:00+01:00', job: 'good-one', status: 'ok', owner: null }),
]);

const jobs = ['alpha-backup', 'mid-refresh', 'zeta-sync'];

function positions(html: string, names: string[]): number[] {
  return names.map((n) => html.indexOf(n));
}

describe('GET /api/digest/:night', () => {
  it('answers 200 with the whole Night, nulls kept', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.night).toBe('2026-11-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(jobs);
    expect(body.rows[0]).toEqual({
      job: 'alpha-backup',
      owner: null,
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      first: '2026-11-01T23:00:00+01:00',
      last: '2026-11-01T23:00:00+01:00',
    });
    expect(body.rows[1].lastError).toBeNull();
    expect(body.rows[2].owner).toBe('rook');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('answers the empty night with no rows and no bad lines', async () => {
    const res = await app.request('/api/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-11-02', rows: [], badLines: 0 });
  });

  it('keeps the good rows and counts the bad line', async () => {
    const res = await app.request('/api/digest/2026-11-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Night;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['good-one', 'good-two']);
  });
});

describe('GET /digest/:night', () => {
  it('answers 200 with the lane banner and every job, in the JSON order', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');

    const json = (await (await app.request('/api/digest/2026-11-01')).json()) as Night;
    const pos = positions(
      html,
      json.rows.map((r) => r.job),
    );
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect(pos).toEqual([...pos].sort((a, b) => a - b));
  });

  it('shows — for a null owner or error', async () => {
    const html = await (await app.request('/digest/2026-11-01')).text();
    expect(html).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for the empty night', async () => {
    const res = await app.request('/digest/2026-11-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good rows when a line is bad', async () => {
    const res = await app.request('/digest/2026-11-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('good-one');
    expect(html).toContain('good-two');
    expect(html.indexOf('good-one')).toBeLessThan(html.indexOf('good-two'));
  });
});
