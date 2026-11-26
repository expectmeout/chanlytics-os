/**
 * The reach-out clock's steps (Reach out, Part 3), each over the database and each safe to run again: a move is made
 * only from the state a send was read in, so two ticks never move one send twice. Each step's work is chosen and
 * bounded in the database (00186), so no list of ids and no page cut short decides what is done.
 *
 *   reconcile   each queued send reads its email once (E3): an email that left is a sent send, and its lead is written
 *               to (nurture, contacted, emailed); one whose outcome is unknown waits for its receipt, a day at most,
 *               then fails `outcome_unknown` (no nudge follows an email that may never have arrived, and none goes
 *               twice); one that never left (the provider's limit, a job that died before it, no job at all) and one
 *               the door sent back with a wait (contracts OUTREACH_WAIT_REFUSALS) is planned again, never lost (C5);
 *               one the provider refused, or that may have left, fails; any other refusal is the door's word for why
 *               this lead is not written to, and skips it; a row gone (an erasure) skips it.
 *   unstick     a send claimed and never queued: its email written (adopted, queued) or never written (planned
 *               again), so a writer that died mid-send neither loses it nor spends its mailbox's day for good.
 *   close       a canceled or failed run's open sends are skipped, `run_canceled`; an email still queued is withdrawn
 *               first, so its job sends nothing; one its job has begun to send is its job's, and reconcile reads it.
 *   drafts      a draft waiting for its owner whose lead the send door would refuse now (contracts draftRefusalOf: it
 *               said no, closed, was stopped, went on the never-again list, became a customer, or is gone) is skipped
 *               with why, and its run's row touched, so To send stops offering it (00429).
 *   finish      a run that goes ahead with no send left open is sent, and says when it finished.
 *   restale     a planned send long past its time in a run that goes ahead (approved late, its chain resumed, its
 *               mailbox's day full or its mailbox removed) is planned again from now.
 *   give up     a send the check held (Part 4) that its owner never answered is skipped, kept_waiting, fourteen days
 *               from when it was planned: the one clock every send gives up by (replan.ts REPLAN_GIVE_UP_MS, R10). A
 *               draft its owner never said went is skipped so fourteen days from when it was handed to them (00429).
 *
 * A draft (00429) is open to finish (the run waits for its owner's word on it) and closes with a canceled run, skipped
 * run_canceled; nothing here sends it: its owner does, and says so (reach_out_send_said).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findWrittenEmail,
  finishBatchSending,
  getWrittenEmails,
  type LeadSendRow,
  listClosedRunSends,
  listDraftsWaiting,
  listFinishableRuns,
  listHeldStale,
  listQueuedOutcomes,
  type QueuedOutcome,
  listStaleSends,
  listStuckClaims,
  moveSend,
  ofASequence,
  type ReachOutSendRow,
  recordLeadWritten,
  runHanded,
  startBatchSending,
  withdrawEmail,
} from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { sendMessageId } from "@chanlytics/core";
import { MIN_MS, draftRefusalOf, isWaitRefusal, DbFailure, SECOND_MS, recordOrNull } from "@chanlytics/contracts";
import { REPLAN_GIVE_UP_MS, replanSends, type Replan, type ReplanCounts } from "./replan.js";
import type { Logger } from "../../shared/log.js";
import { UNKNOWN_OUTCOME_MS } from "../../shared/unknown-outcome.js";
import type { TenantId } from "@chanlytics/contracts";

type Db = SupabaseClient<Database>;

/** A planned send this late in a run that goes ahead was left, not merely due: it is planned again. */
const STALE_AFTER_MS = 15 * MIN_MS;
/** A claim this old never became an email: its writer died mid-send. */
const CLAIM_STUCK_AFTER_MS = 10 * MIN_MS;
/** How long an email of unknown outcome waits for its receipt before its send is failed. */
/** When the clock stops for the tick: its door has 60 s (vercel.json), and what is left is the next minute's. */
const CLOCK_YIELD_AT_MS = 40_000;
const PAGE = 500;
const STUCK_PAGE = 100;
/**
 * How often a lead's write is tried once its send has moved, and the pause between two tries: a connection the database
 * dropped is back by the next. One lead that used them all up is the database not answering, so the leads after it in
 * the tick are tried once, as they were (leadWrites), and the tick's minute is never spent waiting.
 */
const LEAD_WRITE_TRIES = 3;
const LEAD_WRITE_REST_MS = SECOND_MS;

/** What the clock takes from outside, so a test stands in for it: the pause between two tries of a lead's write. */
interface ClockPorts {
  rest?: (ms: number) => Promise<void>;
}
const restFor = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

interface ClockCounts extends ReplanCounts {
  reconciled: number;
  sent: number;
  failed: number;
  skipped: number;
  adopted: number;
  closed: number;
  withdrawn: number;
  finished: number;
  yielded: boolean;
}

/** What an email's row says went wrong, as the clock reads it (messages.error). */
interface EmailError {
  reason?: string;
  provider?: string;
  outcome?: string;
  http_status?: number;
}

/**
 * An email that never left, so another try costs its mailbox nothing and cannot send twice: the provider's limit (a
 * 429 is a refusal before the send), a job that died knowing it had not sent (settle's never_delivered), and a row
 * whose job was gone (the unfinished sweep's orphaned). A 5xx, a network error or a timeout may have left, and fails.
 */
/** What a queued email's failure says of itself, as its row keeps it: each part where it is what it says. */
function emailErrorOf(value: unknown): EmailError | null {
  const e = recordOrNull(value);
  if (!e) return null;
  return {
    ...(typeof e.reason === "string" ? { reason: e.reason } : {}),
    ...(typeof e.provider === "string" ? { provider: e.provider } : {}),
    ...(typeof e.outcome === "string" ? { outcome: e.outcome } : {}),
    ...(typeof e.http_status === "number" ? { http_status: e.http_status } : {}),
  };
}

function neverLeft(error: EmailError | null | undefined): boolean {
  if (!error) return false;
  return error.http_status === 429 || error.reason === "never_delivered" || error.reason === "orphaned";
}

const move = (db: Db, s: LeadSendRow, patch: Partial<LeadSendRow>): Promise<boolean> =>
  moveSend(db, { tenantId: s.tenant_id, id: s.id, from: s.state, patch });

/**
 * The lead's bookkeeping after its send moved to sent (packages/db recordLeadWritten), tried again where it failed
 * (LEAD_WRITE_TRIES). The send is sent whatever becomes of it: a lead that still could not be written is said, never
 * undone, and never holds its send. Until 13 November 2026 one failure was said and nothing tried again, and the send
 * had left the queued list, so the lead read as never written to for good. A failure that outlasts the tries is still
 * only said (the log's reach_out_lead_unwritten): no later tick finds it.
 */
function leadWrites(db: Db, log: Logger, ports: ClockPorts | undefined, late: () => boolean) {
  const rest = ports?.rest ?? restFor;
  // The sends whose lead used up its tries this tick: one is the database not answering, and the rest are tried once.
  const spent: string[] = [];
  return async (send: LeadSendRow, at: string): Promise<void> => {
    let failure: unknown = null;
    const tries = spent.length ? 1 : LEAD_WRITE_TRIES;
    for (let tried = 1; tried <= tries; tried++) {
      if (tried > 1) await rest(LEAD_WRITE_REST_MS);
      try {
        await recordLeadWritten(db, { tenantId: send.tenant_id, leadId: send.lead_id, at, sendId: send.id });
        return;
      } catch (e) {
        failure = e;
        if (late()) break;
      }
    }
    spent.push(send.id);
    log.error("reach_out_lead_unwritten", {
      send_id: send.id,
      lead_id: send.lead_id,
      error: failure instanceof Error ? failure.message : String(failure),
    });
  };
}

/**
 * Whether a send the door turned back, or the provider never took, is planned again. A lead's own email (00540) never
 * is: a member pressed Send now, and nothing leaves by surprise tomorrow. Its row says why it did not go.
 */
const goesAgain = (s: LeadSendRow, turnedBack: boolean): s is ReachOutSendRow => turnedBack && ofASequence(s);

/** What one tick holds for every step: the database, its clock and log, the counts, when to stop, and what to plan again. */
interface ClockTick {
  db: Db;
  now: Date;
  log: Logger;
  out: ClockCounts;
  late: () => boolean;
  /** One workspace to keep to, or every workspace. */
  tenantId: TenantId | undefined;
  /** The sends the steps before the replan found to plan again: counted where they are planned. */
  again: Replan[];
  writeLead: (send: LeadSendRow, at: string) => Promise<void>;
}

/** A failed email: an unknown outcome waits out its day, one that never left goes again, the rest fail. Whether settled. */
async function settleFailed(tick: ClockTick, queued: QueuedOutcome, error: EmailError | null | undefined) {
  const { db, now, out } = tick;
  const send = queued.send;
  if (error?.outcome === "unknown") {
    // Its receipt settles it (00177's guard lets exactly this row move on). A day with none: it may have gone.
    if (!queued.written_at || now.getTime() - Date.parse(queued.written_at) < UNKNOWN_OUTCOME_MS) return false;
    if (await move(db, send, { state: "failed", reason: "outcome_unknown" })) out.failed += 1;
    return true;
  }
  if (goesAgain(send, neverLeft(error))) {
    tick.again.push({ send: send, wrote: true });
    return false; // counted where it is planned again
  }
  const reason = error?.provider === "bounced" ? "bounced" : "send_failed";
  if (await move(db, send, { state: "failed", reason })) out.failed += 1;
  return true;
}

/** One queued send, by what became of its email: whether the clock settled it this tick. */
async function reconcileOne(tick: ClockTick, queued: QueuedOutcome): Promise<boolean> {
  const { db, now, out } = tick;
  const send = queued.send;
  const error = emailErrorOf(queued.error);
  if (queued.status === "sent" || queued.status === "delivered" || queued.status === "read") {
    const at = queued.sent_at ?? queued.written_at ?? now.toISOString();
    if (await move(db, send, { state: "sent", sent_at: at })) {
      out.sent += 1;
      // The send is sent whatever the lead's bookkeeping does: a lead that could not be written is said, not undone.
      await tick.writeLead(send, at);
    }
    return true;
  }
  if (queued.status === "failed") return settleFailed(tick, queued, error);
  if (queued.status === "canceled") {
    const reason = String(error?.reason ?? "canceled").slice(0, 60);
    if (goesAgain(send, isWaitRefusal(reason))) {
      tick.again.push({ send: send, wrote: true });
      return false;
    }
    if (await move(db, send, { state: "skipped", reason })) out.skipped += 1;
    return true;
  }
  if (queued.status === null) {
    // Its email row is gone: an erasure deletes the person's messages (erase_contact), and the send never goes.
    if (await move(db, send, { state: "skipped", reason: "erased", message_id: null })) out.skipped += 1;
    return true;
  }
  return false; // still queued: its job has not run yet
}

/** The unstick step: a claim written and not queued is the email's, and goes on; one never written is planned again. */
async function unstick(tick: ClockTick): Promise<void> {
  const { db, now, out } = tick;
  const stuck = await listStuckClaims(db, new Date(now.getTime() - CLAIM_STUCK_AFTER_MS), STUCK_PAGE, tick.tenantId);
  const expected = new Map<string, string>();
  for (const s of stuck) expected.set(s.id, await sendMessageId(s.id, s.attempts));
  const written = await getWrittenEmails(db, [...expected.values()]);
  for (const s of stuck) {
    const id = expected.get(s.id);
    if (!id) continue;
    // Written and not queued: the writer died between its email and its move. The email is the send's; it goes on.
    if (written.has(id)) {
      if (await move(db, s, { state: "queued", message_id: id })) out.adopted += 1;
    } else tick.again.push({ send: s, wrote: false });
  }
}

/** A closed run's claimed send whose email was written and not withdrawn: it goes on as that email's (true). */
async function adoptsItsEmail(tick: ClockTick, send: ReachOutSendRow): Promise<boolean> {
  const { db, out } = tick;
  const id = await sendMessageId(send.id, send.attempts);
  const withdrawn = await withdrawEmail(db, { tenantId: send.tenant_id, id, reason: "run_canceled" });
  const was = withdrawn ? null : await findWrittenEmail(db, { tenantId: send.tenant_id, id });
  if (!was || was.status === "canceled") return false;
  if (await move(db, send, { state: "queued", message_id: id })) out.adopted += 1;
  return true;
}

/** One open send of a canceled or failed run, by where it stands (closeRuns). */
async function closeOne(tick: ClockTick, send: ReachOutSendRow, emailStatus: string | null): Promise<void> {
  const { db, out } = tick;
  if (send.state === "queued") {
    if (send.message_id && emailStatus === "queued") {
      if (await withdrawEmail(db, { tenantId: send.tenant_id, id: send.message_id, reason: "run_canceled" }))
        out.withdrawn += 1;
    }
    return;
  }
  if (send.state === "claimed" && (await adoptsItsEmail(tick, send))) return;
  // A draft handed to its owner may have left their inbox: withdrawn, never "never happened" (00427's one-first rule).
  const reason = send.state === "drafted" ? "draft_withdrawn" : "run_canceled";
  if (await move(db, send, { state: "skipped", reason })) out.closed += 1;
}

/**
 * The close step: a canceled or failed run's open sends. A queued send's email still queued is withdrawn, and the next
 * tick's reconcile reads it canceled, run_canceled, and skips the send. A claim its writer is done with may have written
 * its email: withdrawn too, then the send skipped. An email that was not withdrawn (withdrawEmail's false: its job took
 * it, or has begun to send it, sending_at) is its job's, and reconcile reads what became of it; a claimed send then
 * goes on as that email's, as unstick adopts one. Skipped instead, a send whose email reached the lead would say
 * run_canceled, and the lead would never be marked as written to.
 */
async function closeRuns(tick: ClockTick): Promise<void> {
  const before = new Date(tick.now.getTime() - CLAIM_STUCK_AFTER_MS);
  for (const { send, email_status } of await listClosedRunSends(tick.db, before, PAGE, tick.tenantId))
    await closeOne(tick, send, email_status);
  // A draft that still goes, and that the door would refuse now: skipped too, so To send stops offering it (00429).
  await recheckDrafts(tick);
}

/**
 * The drafts step (00429): no send door stands between an owner's inbox and the business, so a draft is judged as the
 * door would judge it while it waits, and one it would refuse now is skipped with why. Its owner's Sent still records an
 * email that left their inbox meanwhile (reach_out_send_said takes a draft skipped since).
 */
async function recheckDrafts(tick: ClockTick): Promise<void> {
  const { db, now, out, log, late, tenantId } = tick;
  // Every draft, a page at a time after the last read, while the tick has time: the drafts that may still go keep their
  // place at the head, so one page of the oldest would never reach a newer one refused since.
  const all: Awaited<ReturnType<typeof listDraftsWaiting>> = [];
  let after: { drafted_at: string; id: string } | null = null;
  while (!late()) {
    const page = await listDraftsWaiting(db, { limit: PAGE, tenantId, after });
    all.push(...page);
    const last = page[page.length - 1];
    if (page.length < PAGE || !last) break;
    after = { drafted_at: last.drafted_at, id: last.id };
  }
  for (const row of all) {
    const reason = draftRefusalOf(row.facts);
    if (!reason) continue;
    if (
      !(await moveSend(db, {
        tenantId: row.tenant_id,
        id: row.id,
        from: "drafted",
        patch: { state: "skipped", reason },
      }))
    )
      continue;
    out.skipped += 1;
    // Its run's row, touched: the pages that count its drafts read them again.
    await runHanded(db, { tenantId: row.tenant_id, id: row.broadcast_id, at: now }).catch((e: unknown) =>
      log.warn("reach_out_run_unstarted", {
        broadcast_id: row.broadcast_id,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
}

/** The finish step: through the runs' own moves (broadcasts_guard), a scheduled run starts, then finishes. */
async function finishRuns(tick: ClockTick): Promise<void> {
  const { db, now, out } = tick;
  for (const id of await listFinishableRuns(db, PAGE, tick.tenantId)) {
    // The ids are the ones listFinishableRuns just read, across every workspace when the clock sweeps them all:
    // platformWide by design.
    const { error: e1 } = await startBatchSending(db, id);
    if (e1) throw new Error(`cannot start the run ${id}: ${e1.message}`);
    const { data, error } = await finishBatchSending(db, id, now.toISOString());
    if (error) throw new DbFailure(error, `cannot finish the run ${id}`);
    if (data.length > 0) out.finished += 1;
  }
}

/** The restale step, while the tick has time, and then every send the steps found planned again (replan.ts), counted. */
async function replanFound(tick: ClockTick): Promise<void> {
  const { db, now, out, again } = tick;
  if (!tick.late())
    for (const s of await listStaleSends(db, new Date(now.getTime() - STALE_AFTER_MS), PAGE, tick.tenantId))
      again.push({ send: s, wrote: false });
  if (again.length === 0) return;
  const replanned = await replanSends(db, again, now, tick.log);
  out.replanned += replanned.replanned;
  out.waiting += replanned.waiting;
  out.gave_up += replanned.gave_up;
}

/** The give-up step: what waits unanswered in its fortnight, held and never answered (F3, R10), or a draft never sent (00429). */
async function giveUpHeld(tick: ClockTick): Promise<void> {
  const before = new Date(tick.now.getTime() - REPLAN_GIVE_UP_MS);
  for (const s of await listHeldStale(tick.db, before, PAGE, tick.tenantId))
    if (await move(tick.db, s, { state: "skipped", reason: "kept_waiting" })) tick.out.gave_up += 1;
}

export async function runReachOutClock(
  db: Db,
  now: Date,
  log: Logger,
  started: number = Date.now(),
  /** One workspace to keep to; every workspace when absent, as the clock runs. A test proves it on its own. */
  tenantId?: TenantId,
  ports?: ClockPorts,
): Promise<ClockCounts> {
  const out: ClockCounts = {
    reconciled: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    adopted: 0,
    closed: 0,
    withdrawn: 0,
    finished: 0,
    replanned: 0,
    waiting: 0,
    gave_up: 0,
    yielded: false,
  };
  const late = () => {
    if (Date.now() - started < CLOCK_YIELD_AT_MS) return false;
    out.yielded = true;
    return true;
  };
  const tick: ClockTick = { db, now, log, out, late, tenantId, again: [], writeLead: leadWrites(db, log, ports, late) };
  for (const queued of await listQueuedOutcomes(db, PAGE, tenantId))
    if (await reconcileOne(tick, queued)) out.reconciled += 1;
  if (!late()) await unstick(tick);
  if (!late()) await closeRuns(tick);
  if (!late()) await finishRuns(tick);
  await replanFound(tick);
  if (!late()) await giveUpHeld(tick);
  return out;
}
