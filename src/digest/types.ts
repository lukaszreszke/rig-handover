export type RunStatus = 'ok' | 'retry' | 'fail';

export type RunLine = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Counts = { ok: number; retry: number; fail: number };

export type Night = { night: string; rows: DigestRow[]; badLines: number; missing: boolean; counts: Counts };

export type ReadNight = (runsDir: string, night: string) => Night;
