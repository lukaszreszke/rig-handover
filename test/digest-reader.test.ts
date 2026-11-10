import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/night.js';

const tmp = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28');
  const row = (job: string) => night.rows.find((r) => r.job === job);

  it('digests the 2026-10-28 fixture', () => {
    expect(night.missing).toBe(false);
    expect(night.rows).toHaveLength(5);
    expect(night.badLines).toBe(1);
    expect(row('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastError: 'upstream 503', lastStatus: 'ok' });
    expect(row('notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    expect(row('digest/render')).toMatchObject({ owner: null, runs: 1 });
  });

  it('marks a night with no file, or a malformed night, as missing', () => {
    expect(readNight('runs', '1999-01-01')).toMatchObject({ missing: true, rows: [] });
    expect(readNight('runs', '../runs/2026-10-28')).toMatchObject({ missing: true, rows: [] });
  });

  it('reads an empty file as an empty, present night', () => {
    const dir = tmp({ '2026-01-01.jsonl': '' });
    expect(readNight(dir, '2026-01-01')).toMatchObject({ rows: [], missing: false, badLines: 0 });
  });

  it('sorts rows by job regardless of line order', () => {
    const lines = ['c/job', 'a/job', 'b/job'].map((job) =>
      JSON.stringify({ at: '2026-01-02T01:00:00+01:00', job, status: 'ok', owner: 'rook' }),
    );
    const dir = tmp({ '2026-01-02.jsonl': lines.join('\n') + '\n' });
    expect(readNight(dir, '2026-01-02').rows.map((r) => r.job)).toEqual(['a/job', 'b/job', 'c/job']);
  });
});
