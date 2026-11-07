/**
 * Catching up on what the live feed told while the tab could not hear it (decision 0019 step 4; the page-open PRD of
 * 3 Nov 2026, L5). Realtime has no backfill: a notice told while the tab loaded, before it joined its workspace's topic,
 * or while its feed was down, never reached it, and the tab read again on its first join only what tells of a message or a
 * call, on a rejoin everything it hears, and anything else waited for its next notice or the 15-minute heal.
 *
 * The topic keeps its notices a while (realtime.messages), so the tab asks for them (GET changes, 00508) since its load
 * began, or since its feed went quiet, and hears each as if it had come live: read only where it names something a
 * surface draws and does not already hold. Where the answer cannot say them all, or fails, the tab reads everything the
 * feed tells of, as before.
 */
import type { RealtimeChange } from "../surface-realtime";

/** A notice the topic told, read back: its table, event, the statuses its statement left and its clock. Never a row. */
export interface CaughtUpNotice {
  table: string;
  event: string;
  statuses: readonly string[] | null;
  at: string | null;
  /** The threads a thread's notice names (00510), or null. */
  threads?: readonly string[] | null;
}

/**
 * What the live feed told since a moment (ms, this browser's clock), read back from the workspace's topic: every notice, or
 * null where the answer could not say them all or failed. Handed to the runner as the feed is, so a node test gives its own.
 */
export type CatchUp = (sinceMs: number) => Promise<readonly CaughtUpNotice[] | null>;

/**
 * How far before the feed first said it was in trouble a rejoin catches up from: a socket can die silently, and realtime-js
 * says so within a heartbeat or two.
 */
export const QUIET_LOOKBACK_MS = 60_000;

/** What a catch-up does with what it reads back. */
export interface CatchingUp {
  /** Hear a notice as the live feed's are heard (the runner's own routing). */
  hear: (change: RealtimeChange) => void;
  /** Read everything the feed tells of: where the answer could not say every notice. */
  everything: () => unknown;
  /** The workspace the notices are of, as a live notice's row names it. */
  tenant: string;
  stopped: () => boolean;
}

/** The notices told since `since`, each heard as a live one is; everything read again where they could not all be said. */
export async function catchUpOn(catchUp: CatchUp, since: number, on: CatchingUp): Promise<void> {
  let notices: readonly CaughtUpNotice[] | null;
  try {
    notices = await catchUp(since);
  } catch {
    notices = null;
  }
  if (on.stopped()) return;
  if (!notices) {
    await on.everything();
    return;
  }
  for (const n of notices)
    for (const status of n.statuses?.length ? n.statuses : [undefined]) {
      const row = { tenant_id: on.tenant, ...(status ? { status } : {}) };
      on.hear({
        table: n.table,
        event: n.event,
        row,
        ...(n.at ? { at: n.at } : {}),
        ...(n.threads ? { threads: n.threads } : {}),
      });
    }
}
