/**
 * The job a run is in the middle of, held for as long as its handler runs (dispatchJob), for the one question the
 * ledger asks of it: was an ask refused by the key of the very job that wrote it (schedule.ts)? Run, never entered, so
 * it holds for what the handler awaits and ends with it; a write made outside any job (a door, a clock) finds none.
 */
import { AsyncLocalStorage } from "node:async_hooks";

/** What the ledger needs of the job that is running: which row it is, its kind, and what it was asked to do. */
export interface RunningJob {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}

const running = new AsyncLocalStorage<RunningJob>();

/** Runs a handler's work as this job's. */
export const withRunningJob = <T>(job: RunningJob, work: () => Promise<T>): Promise<T> => running.run(job, work);

/** The job whose handler is running now, or null outside one. */
export const runningJob = (): RunningJob | null => running.getStore() ?? null;
