import "server-only";
import {
  coldEmailNoteOf,
  coldEmailStandingOf,
  hasFootAddress,
  mailboxIsLive,
  parseTenantConfig,
  reachOutPitchSaid,
  REACH_OUT_MONTH_EMAILS,
  reachOutRootOf,
  type ColdEmailNote,
  type ColdEmailStandingFacts,
  type TenantId,
} from "@chanlytics/contracts";
import {
  countHeldForAddress,
  countSentByStep,
  findSearchesByIds,
  findWorkspaceWords,
  listReachOutSteps,
  listRunsWaiting,
} from "@chanlytics/db/campaigns";
import { listMailboxConnectionsOf } from "@chanlytics/db/email";
import { findNewestSearchName } from "@chanlytics/db/leads";
import { logAndGoOn } from "@chanlytics/log";
import { chainOf } from "../campaigns/reach-outs/chain-acts";
import { load, readerStamp, type Reader } from "../shared/reader";
import * as readers from "./facts";
import { runningNewestFirst } from "./settings";

interface NoteRoot {
  id: string;
  name: string;
  state: string;
  created_at: string;
}

/**
 * What the note decides from, read for its own sake. What only the page says is left unread and null: the month's emails and
 * a running sequence's numbers, which never wait on the owner, and who is left in each, so a sequence with no one new stays
 * the page's news and isn't a line on Today every morning.
 */
export function coldEmailNoteFactsOf(input: {
  roots: readonly NoteRoot[];
  waiting: readonly { id: string; audience: unknown; recipient_count: number }[];
  mailboxes: readonly { state: string; held_why: string | null }[];
  hasAddress: boolean;
  heldForAddress: number | null;
  hasSearch: boolean;
  /** Something says what the business sells (contracts reachOutPitchSaid). */
  hasPitch: boolean;
  whoFor: string | null;
  /** What the waiting run's sequence has sent, which says first from next; null where nothing waits or it was unread. */
  sent: number | null;
  /** The name of the search the waiting run's sequence writes to. */
  searchName: string | null;
  nowMs: number;
  tz: string;
}): ColdEmailStandingFacts {
  const running = runningNewestFirst(input.roots);
  const run = waitingRunOf(running, input.waiting);
  const waits = running.filter((r) => input.waiting.some((w) => reachOutRootOf(w.audience) === r.id)).length;
  return {
    mailboxes: input.mailboxes.filter((m) => mailboxIsLive(m)),
    hasAddress: input.hasAddress,
    heldForAddress: input.heldForAddress,
    waitingRun: run
      ? {
          id: run.id,
          planned: run.recipient_count,
          name: input.searchName || run.root.name,
          first: input.sent === null ? null : input.sent === 0,
        }
      : null,
    othersWaiting: Math.max(0, waits - 1),
    month: { sent: null, of: REACH_OUT_MONTH_EMAILS },
    running: running.map((r) => ({ name: r.name, sent: null, wroteBack: null, interested: null, waitingLeads: null })),
    hadSequence: input.roots.length > 0,
    hasSearch: input.hasSearch,
    hasPitch: input.hasPitch,
    whoFor: input.whoFor,
    nowMs: input.nowMs,
    tz: input.tz,
  };
}

/** The newest running sequence with a run waiting for its OK, and that run. */
function waitingRunOf<R extends { id: string }>(
  running: readonly R[],
  waiting: readonly { id: string; audience: unknown; recipient_count: number }[],
) {
  for (const root of running) {
    const run = waiting.find((w) => reachOutRootOf(w.audience) === root.id);
    if (run) return { ...run, root };
  }
  return null;
}

/** The newest search's name; undefined where it could not be read, which counts as one (never a step still to do). */
const newestSearchOrUnread = (db: Parameters<typeof findNewestSearchName>[0], tenantId: TenantId) =>
  findNewestSearchName(db, tenantId).catch(logAndGoOn("cold_email_note_search", undefined));

/**
 * GET settings/reach-out/note: Cold email's one line on Today, through the page's one answer (contracts coldEmailStandingOf),
 * or none. Today opens all day, so this reads only what can make it speak. A workspace that has started no cold email, no
 * search and no sequence, is never asked about it (decision 0113): two reads say so, and nothing else is read. Its report's
 * numbers, its counts of who is left and the page's other cards are the page's read (reachOutSettings). A read that fails
 * fails the note, which says nothing.
 */
export const coldEmailNote: Reader<undefined, { note: ColdEmailNote | null }> = {
  name: "cold_email_note",
  async read(rc) {
    const db = rc.ctx.supabase;
    const tenantId = rc.tenantId;
    const [steps, newestSearch] = await Promise.all([
      listReachOutSteps(db, tenantId),
      newestSearchOrUnread(db, tenantId),
    ]);
    const roots = steps.filter((s) => s.trigger === "lead_first");
    if (roots.length === 0 && newestSearch === null) return { data: { note: null }, rows: [], stamp: readerStamp() };
    const [row, facts, mailboxes, waiting] = await Promise.all([
      load(rc, readers.config, undefined),
      load(rc, readers.facts, undefined),
      listMailboxConnectionsOf(db, tenantId),
      listRunsWaiting(db, tenantId),
    ]);
    const parsed = parseTenantConfig(row.data?.config);
    const hasAddress = hasFootAddress(facts.data.name, parsed?.brain?.profile?.address);
    const running = runningNewestFirst(roots);
    const subject = waitingRunOf(running, waiting)?.root ?? null;
    const pitchSaid = reachOutPitchSaid(parsed, null);
    const [sent, searches, heldForAddress, ownWords] = await Promise.all([
      subject
        ? countSentByStep(
            db,
            tenantId,
            chainOf(subject, steps).map((s) => s.id),
          )
        : null,
      subject?.lead_search_id ? findSearchesByIds(db, tenantId, [subject.lead_search_id]) : null,
      hasAddress ? 0 : countHeldForAddress(db, tenantId),
      // The business's own words are read only where they can change the answer: nothing running, the page's words empty.
      pitchSaid || running.length > 0 ? undefined : findWorkspaceWords(db, tenantId),
    ]);
    const note = coldEmailNoteOf(
      coldEmailStandingOf(
        coldEmailNoteFactsOf({
          roots,
          waiting,
          mailboxes,
          hasAddress,
          heldForAddress,
          hasSearch: newestSearch !== null,
          hasPitch: reachOutPitchSaid(parsed, ownWords),
          whoFor: parsed?.reach_out?.who_for?.trim() || null,
          sent: sent ? [...sent.values()].reduce((n, v) => n + v, 0) : null,
          searchName: subject?.lead_search_id ? (searches?.get(subject.lead_search_id)?.name ?? null) : null,
          nowMs: rc.now.getTime(),
          tz: facts.data.timezone,
        }),
      ),
    );
    return { data: { note }, rows: [], stamp: readerStamp() };
  },
};
