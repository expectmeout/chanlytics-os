/**
 * A lock between test files that run at the same time on one machine, for the state they share in one database.
 *
 * `node --test` runs the files of a suite in parallel processes, and the database suites share one database. Most of
 * what they share is safe (each makes its own workspace), but a few rows belong to the platform: the lead finder's
 * switch list, `lead_platform.tenants_on`, is one array a suite reads, adds itself to and writes back, and two suites
 * that do it at once lose one of the two writes; the workspace whose write was lost then finds its searches paused.
 * The jobs ledger is the other: one queue that `claim_due_jobs` takes the oldest due row of, and `jobs_backlog()`
 * counts every due row of. The suites that write or count either take this lock (under a name each) for the whole
 * file, so they run one after the other.
 *
 *   const release = await takeLock("lead-platform-list");   // in before()
 *   await release();                                        // last in after()
 *
 * A directory is made to take it (`mkdir` is atomic on every platform) and removed to give it back. A lock older than
 * `staleMs` was left by a process that died, and is taken over.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function takeLock(name, { waitMs = 600_000, staleMs = 300_000 } = {}) {
  const dir = path.join(os.tmpdir(), `chanlytics-lock-${name}`);
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      fs.mkdirSync(dir);
      return async () => {
        fs.rmSync(dir, { recursive: true, force: true });
      };
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
    }
    try {
      if (Date.now() - fs.statSync(dir).mtimeMs > staleMs) fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // released between the two calls: try again
    }
    if (Date.now() > until) throw new Error(`the lock ${name} was not released in ${waitMs} ms (${dir})`);
    await sleep(200);
  }
}
