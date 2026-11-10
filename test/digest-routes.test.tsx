import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const line = (job: string, status: string, at: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ at: `2026-01-01T${at}:00+01:00`, job, status, owner: 'rook', ...extra });

// file order differs from the sorted order on purpose
const NIGHT = [
  line('zeta/sync', 'ok', '01:00'),
  line('alpha/fetch', 'retry', '01:01', { error: 'upstream 503' }),
  line('alpha/fetch', 'retry', '01:02', { error: 'upstream 503' }),
  line('alpha/fetch', 'retry', '01:03', { error: 'upstream 503' }),
  line('alpha/fetch', 'ok', '01:04'),
  line('mid/backup', 'fail', '01:05', { error: 'quota exceeded' }),
].join('\n');

describe('digest routes', () => {
  let dir: string;
  const app = () => createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });
  const put = (night: string, body: string) => writeFileSync(join(dir, `${night}.jsonl`), body);
  const get = async (night: string) => {
    const page = await app().request(`/digest/${night}`);
    const api = await app().request(`/api/digest/${night}`);
    return { page, api };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('page and json list the same jobs in the same order', async () => {
    put('2026-01-01', NIGHT + '\n');
    const { page, api } = await get('2026-01-01');
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    const json = (await api.json()) as { night: string; badLines: number; rows: DigestRow[] };

    const jobs = json.rows.map((r) => r.job);
    expect(jobs).toEqual(['alpha/fetch', 'mid/backup', 'zeta/sync']);
    const cells = [...html.matchAll(/<tr><td>([^<]*)<\/td>/g)].map((m) => m[1]);
    expect(cells).toEqual(jobs);
    const positions = jobs.map((j) => html.indexOf(`<td>${j}</td>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);

    expect(json.rows.find((r) => r.job === 'mid/backup')?.lastStatus).toBe('fail');
    expect(json.rows.find((r) => r.job === 'alpha/fetch')?.retries).toBeGreaterThanOrEqual(3);
    expect(html).toMatch(/<td class="warn">fail<\/td>/);
    expect(html).toMatch(/<td class="warn">3<\/td>/);
  });

  it('404s on both routes for a night with no file', async () => {
    const { page, api } = await get('2026-01-09');
    expect(page.status).toBe(404);
    expect(api.status).toBe(404);
  });

  it('renders an empty night as nothing ran', async () => {
    put('2026-01-02', '');
    const { page, api } = await get('2026-01-02');
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');
    expect(await api.json()).toMatchObject({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('keeps the good rows when a line does not parse', async () => {
    put('2026-01-03', [line('b/job', 'ok', '01:00'), '{not json', line('a/job', 'ok', '01:01')].join('\n'));
    const { page, api } = await get('2026-01-03');
    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    const html = await page.text();
    const json = (await api.json()) as { badLines: number; rows: DigestRow[] };
    expect(json.badLines).toBe(1);
    expect(json.rows.map((r) => r.job)).toEqual(['a/job', 'b/job']);
    expect(html).toContain('<td>a/job</td>');
    expect(html).toContain('<td>b/job</td>');
    expect(html).toContain('1 line did not parse');
  });
});
