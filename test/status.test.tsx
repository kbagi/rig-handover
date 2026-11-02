import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Status } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toMatch(/2026-10-28<\/a>\s*ok 10 · retry 4 · fail 1/);
    expect(html).toMatch(/2026-10-27<\/a>\s*ok 7 · retry 0 · fail 0/);
    expect(html.indexOf('2026-10-28</a>')).toBeLessThan(html.indexOf('2026-10-27</a>'));
  });

  it('renders a night without counts as a link and a dash', () => {
    const status: Status = { adapter: 'shim', installed: 'x', lastBeat: null, nights: [{ night: '2026-10-30', counts: null }] };
    expect(String(<StatusBoard status={status} />)).toMatch(/<a href="\/digest\/2026-10-30">2026-10-30<\/a>\s*—/);
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
