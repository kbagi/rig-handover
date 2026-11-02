// Plan morning-digest § 1. The contract every part of § 2 starts against: the reader (#2) fills
// it, the page (#3), the JSON (#4) and the board link (#5) only read it.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl once it has parsed. A line that doesn't parse as JSON, or lacks
// `at`, `job` or a known `status`, is not a RunLine: it is counted in Night.badLines.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log; views show `—`
  runs: number; // lines for this job, retries included
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // the most recent `error` this job logged that night, null if none
  first: string; // `at` as logged, offset kept (styleguide)
  last: string;
};

export type Night = {
  night: string; // YYYY-MM-DD, the file name
  rows: DigestRow[]; // sorted by job, so the page and the JSON can't disagree on order
  badLines: number; // lines that didn't parse; blank lines aren't counted
};

// null when runs/<night>.jsonl doesn't exist (404). An empty file is a Night with no rows
// ("nothing ran"). Never throws on a bad line. Implemented in src/digest/read.ts (#2) as
// `export const readNight: ReadNight`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
