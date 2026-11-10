import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Counts, DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

function parseLine(text: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const { at, job, status, owner, error } = o;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string') return null;
  if (!isStatus(status)) return null;
  if (owner !== undefined && owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner: owner ?? null };
  if (error !== undefined) line.error = error;
  return line;
}

const zero = (): Counts => ({ ok: 0, retry: 0, fail: 0 });

export const readNight: ReadNight = (runsDir, night) => {
  const empty: Night = { night, rows: [], badLines: 0, missing: true, counts: zero() };
  if (!NIGHT.test(night)) return empty;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return empty;
  }

  const counts = zero();
  let badLines = 0;
  const byJob = new Map<string, RunLine[]>();
  for (const l of text.split('\n')) {
    if (l.trim() === '') continue;
    const line = parseLine(l);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const list = byJob.get(line.job);
    if (list) list.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows: DigestRow[] = [];
  for (const [job, lines] of byJob) {
    // stable sort by time; ties keep file order
    const sorted = [...lines].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    let lastError: string | null = null;
    for (const l of sorted) if (l.error) lastError = l.error;
    rows.push({
      job,
      owner: last.owner,
      runs: lines.length,
      retries: lines.filter((l) => l.status === 'retry').length,
      lastStatus: last.status,
      lastError,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  rows.sort((a, b) => a.job.localeCompare(b.job));
  return { night, rows, badLines, missing: false, counts };
};
