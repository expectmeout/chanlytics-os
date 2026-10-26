/**
 * The jobs ledger: the rules a row moves by, and the writes that move it.
 *
 *   scheduled --claim_due_jobs--> fired --completeJob--> done
 *       |                         |  ^  \-----failJob------> failed
 *       |                         \--/ deferJob: kept, and claimed again later
 *       \--------cancelJob---------> canceled
 *
 * `claim_due_jobs` (00098) is the only way into 'fired', and it also takes back
 * a 'fired' row whose lease ran out: the run that held it never reported back,
 * or a run that threw put its lease off (`deferJob`) to be tried again then.
 * Whether that later claim RUNS the job or GIVES UP on it is `verdictFor`, and
 * it is pure. `jobs_guard` (00098) refuses every other transition inside the
 * database, so no writer here has to remember the machine.
 *
 * Cross-workspace: the job runner claims the next due job of any workspace; the job then acts in its own.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@chanlytics/db";
import { DAY_MS, MIN_MS, jittered } from "@chanlytics/contracts";
import { DEADLINE_MARGIN_MS } from "@chanlytics/core";
import { TWILIO_TIMEOUT_MS, WHATSAPP_SEND_TIMEOUT_MS } from "@chanlytics/channels";

export type Db = SupabaseClient<Database>;

/**
 * How long one claim holds a row. Longer than the runner's function may live
 * (apps/edge/vercel.json gives api/jobs/tick.ts 60 seconds; ops-hygiene.test.mjs
 * holds the two together), so a row is never taken back while the run that
 * claimed it can still be inside a provider call.
 */
export const LEASE_SECONDS = 90;

/**
 * How long a tick keeps claiming. Jobs are claimed one at a time, just before
 * each runs, and only in the first twenty seconds, so the last one claimed
 * still has forty of the sixty before the function is killed.
 */
export const CLAIM_FOR_MS = 20_000;

/**
 * How many jobs one tick runs side by side (decision 0018, step 4). Each slot
 * claims one job just before it runs it, as a lone runner does, so "claimed"
 * still means "started"; a second slot opens only once a claim found work. The
 * lease and the ceiling are each job's, not the tick's, so neither moves: every
 * job is still claimed in the first CLAIM_FOR_MS and yields by its deadline.
 */
export const CLAIM_SLOTS = 3;

/**
 * When a handler that loops over outward work (a broadcast batch) stops
 * starting new sends and leaves the rest to a follow-up job. Fifteen seconds
 * before the ceiling: room for the send already in flight to come back.
 */
export const YIELD_AT_MS = 45_000;

/**
 * The ceiling every tick function runs under (apps/edge/vercel.json: 60s).
 * Stated here because the lead job's window below is measured from it.
 */
export const FUNCTION_CEILING_MS = MIN_MS;

/**
 * What a send in flight at the yield point still has to do once its answer is back: settle its row, write the person's
 * and schedule the batch that follows. The ceiling is not the send's: this much of it is kept.
 */
export const SEND_SETTLE_MS = 5_000;

/**
 * The latest moment a send under a handler's `deadline` (the tick's start plus YIELD_AT_MS, as every kind but a lead's is
 * handed) may still be waited for: the ceiling less SEND_SETTLE_MS. A send that starts at the yield point is given
 * FUNCTION_CEILING_MS - YIELD_AT_MS - SEND_SETTLE_MS of it, ten seconds, and one that starts early is bounded by the wire's
 * own deadline instead (channels SEND_DEADLINE_MS, 32 s), which a late start would otherwise take whole: a send begun at
 * 44 s ran to 76, past a ceiling that kills the function at 60 with the email in flight and its row still queued.
 * ops-hygiene.test.mjs holds the two numbers under the ceiling.
 */
export const sendByAt = (deadline: number): number => deadline + (FUNCTION_CEILING_MS - YIELD_AT_MS) - SEND_SETTLE_MS;

/**
 * The latest moment a send may START on each wire that sendByAt does not bound: WhatsApp's and a text's are one try each
 * under the provider's own timeout (channels WHATSAPP_SEND_TIMEOUT_MS, TWILIO_TIMEOUT_MS), which nothing shortens, so a
 * send starts only while that timeout still ends by sendByAt. Begun just before the yield point, one ran its fifteen
 * seconds to the ceiling itself, the five kept for the settle were gone, and a message that went could stay "outcome
 * unknown" and its run be resumed. A batch leaves the rest for the next one instead (core BroadcastBatchCommand.startBy).
 * Email has no moment: its send is bounded by sendBy itself (core putOnWire).
 */
export const startByAt = (deadline: number): { whatsapp: number; sms: number } => ({
  whatsapp: sendByAt(deadline) - WHATSAPP_SEND_TIMEOUT_MS,
  sms: sendByAt(deadline) - TWILIO_TIMEOUT_MS,
});

/**
 * The deadline a LEAD job is handed, from the tick's start. A broadcast's
 * deadline stops fifteen seconds short of the ceiling so a send in flight can
 * come back; a lead job guards every call it makes with its own margin
 * (core runner/rules.ts DEADLINE_MARGIN_MS, JUDGE_MARGIN_MS), so nothing of its is
 * ever in flight past its deadline and it needs no room after it. Its
 * deadline sits at the ceiling less the kill margin the runner already keeps.
 *
 * Why this exists: the runner would not start the judge with less than the
 * judge's whole timeout left, which is right; but the last job a tick claims
 * (CLAIM_FOR_MS in) had YIELD_AT_MS - CLAIM_FOR_MS = 25 seconds to its
 * deadline against a 40-second judge, so only a collect claimed in a tick's
 * first seconds ever judged, and every other one retried into the same
 * arithmetic until the ledger gave up ("out of time before the judge", three
 * attempts, failed). The window a lead job is promised is
 * LEAD_YIELD_AT_MS - CLAIM_FOR_MS, and core's judge timeout is sized to fit
 * inside it; tick-geometry.test.mjs holds the two to that.
 */
export const LEAD_YIELD_AT_MS = FUNCTION_CEILING_MS - DEADLINE_MARGIN_MS;

/**
 * How late a reply's first claim may come before the platform is paged (decision 0018, the measure's alarm). A reply is
 * due fifteen seconds after Send and the heartbeat asks every ten, and replies are claimed before any other work, so a
 * minute past due is a queue, not a clock: every runner was busy with replies, or the heartbeat was not running.
 */
export const REPLY_LATE_PAGE_MS = MIN_MS;

/** Claims allowed for internal work before it is failed and reported. */
export const MAX_ATTEMPTS = 3;

/**
 * Fresh runs a broadcast may be handed before it is failed instead.
 *
 * MAX_ATTEMPTS cannot reach the resume: settleJob mints a NEW row, with its own
 * attempts of one, so a broadcast whose run dies the same way every time would
 * fail, resume, fail for ever — one owner alert and one new row per cycle. The
 * count rides the payload and is reset by a run that got far enough to schedule
 * its own next batch, so this bounds resumes THAT MADE NO PROGRESS, not the
 * number of batches a long broadcast takes.
 */
export const MAX_RESUMES = 5;

/**
 * How many outbox events one tick relays before it claims (relay_events, 00334): bounded so a flood of events never
 * holds the tick from the replies behind it; what is left is the next tick's, and the poll knocks while the outbox
 * is not empty.
 */
export const RELAY_LIMIT = 500;

/**
 * Kinds whose second run could reach a real person a second time, whatever the first got to. A kind that speaks only
 * at the end of work that is safe to repeat (a text's answer, after the model's turn) is not here: it says so on its
 * own row the moment before it speaks (markSpoke), and is judged as one of these from then on.
 */
export const SPEAKS_TO_A_PERSON: ReadonlySet<string> = new Set(["outbound_send", "broadcast_send"]);

/**
 * Kinds whose failure the ledger's own notice would tell the wrong person, so none is sent to the owner's bell: a text's
 * answer that failed leaves its message to the deadman sweep, which hands it to a person with the customer's words; a
 * change's delivery to a subscriber (00334) is the platform's to mend, nothing an owner can act on, and the operator is
 * paged instead (PAGES_THE_PLATFORM). It used to ring the bell with "A change could not be passed on to what reads
 * it", an internal fault in the customer's words.
 */
export const TOLD_ELSEWHERE: ReadonlySet<string> = new Set(["inbound_answer", "event_deliver"]);

/**
 * Kinds whose failure is the platform's condition: the operator is paged through the tick's `page` port (the edge's
 * pageOperator, one page per condition per window), with the job named and where to look. The row still fails, so the
 * day's dead letters count it by kind (platform_metrics_roll, 00332).
 */
export const PAGES_THE_PLATFORM: ReadonlySet<string> = new Set(["event_deliver"]);

export const RUN_INTERRUPTED = "the run did not finish; its outcome is unknown";

export interface LedgerRow {
  id: string;
  tenant_id: string;
  kind: string;
  payload: Json;
  due_at: string;
  /** Counted by the claim: 1 on the first run; more means a lease ran out before a run reported back. */
  attempts: number;
  /** The queue the claim took it from (jobs.lane, 00281): 0 a reply, 1 someone waiting, 2 bulk; null for a kind with none. */
  lane?: number | null;
  /** When a run of this job put words on a wire (jobs.spoke_at, 00352): set, it is never run again; null or absent, it has not. */
  spoke_at?: string | null;
}

export type Verdict = "run" | "give_up";

/**
 * A job is claimed immediately before it runs, so a second claim means a run
 * STARTED and never reported back. For work that speaks to a person that is
 * the one case that must not be repeated: the run may have died after the
 * provider accepted the message and before the row recorded it, and a second
 * text to a real person cannot be taken back. Internal work is idempotent and
 * is tried again, up to a cap. A job of any kind whose earlier run said it was
 * about to speak (spoke_at) is the first case, not the second.
 */
export function verdictFor(job: { kind: string; attempts: number; spoke_at?: string | null }): Verdict {
  if (job.attempts <= 1) return "run";
  if (SPEAKS_TO_A_PERSON.has(job.kind) || job.spoke_at) return "give_up";
  return job.attempts > MAX_ATTEMPTS ? "give_up" : "run";
}

/**
 * Kinds tried again after they THROW, and how long each wait is.
 *
 * A job that throws is failed at once (tick.ts), and failed is final
 * (jobs_guard). email_ingest is written to be run again: its message is
 * recorded under the provider's id and marked handled last, so "the next try
 * finishes it" (core ingestEmail). But nothing tried again, and its own index
 * (00127) refused a second row for the same email, failed or not, so a webhook
 * replay could not bring one back either (00135 lets a failed row go): an
 * intake that threw once lost the email. It
 * happened on email's first day live (18 Sep 2026), to an email that arrived
 * while the deployment's key could send but not read (401 restricted_api_key).
 * The key was replaced sixteen minutes later.
 *
 * The wait is the LEASE. The row stays 'fired' with its lease put off, and
 * claim_due_jobs takes it back when the lease ends, as it takes back a run that
 * died (jobs_guard keeps a row fired, and never lets it go back to scheduled).
 * So every try is a claim, MAX_ATTEMPTS bounds them all, and the last one still
 * fails the row and tells the owner: five minutes, then thirty, covers a
 * provider's bad minute and a key replaced within the half hour.
 *
 * Only internal work that is safe to repeat belongs here. Work that speaks to a
 * person never does.
 */
export const RETRY_WAITS_MS: Readonly<Record<string, readonly number[]>> = {
  email_ingest: [5 * MIN_MS, 30 * MIN_MS],
  // The lead finder's three (00140). Each is written to be run again: a start
  // claims its run row before it calls the provider, a collect commits a page
  // by compare-and-set on the offset, a check commits by lead id. A
  // provider's 429 or 5xx throws and lands here: two minutes covers a bad
  // minute, ten a short outage; the third claim fails the row and the round
  // ends "the source failed". Every wait outlasts the lease (jobs-ledger.test.mjs).
  lead_round_start: [2 * MIN_MS, 10 * MIN_MS],
  lead_collect: [2 * MIN_MS, 10 * MIN_MS],
  lead_check: [2 * MIN_MS, 10 * MIN_MS],
  // A phone told from a kept row (00162): the push service's bad minute, then
  // its short outage, each wait outlasting the lease like the three above. The
  // row is read again on each try, and a phone the service answered for is
  // answered for once.
  push_send: [2 * MIN_MS, 10 * MIN_MS],
  // The receipts of a send (00189): Expo keeps them a day, so a bad minute and
  // then a short outage are affordable waits, each outlasting the lease.
  push_receipts: [5 * MIN_MS, 30 * MIN_MS],
  // A reply to a reach-out, read (Reach out Part 5, 00222). Every stage is written to be run again: the reading is kept
  // once per message and a re-read by compare-and-set, the notice is claimed before it is told and marked only after
  // (its claim goes stale with the lease, before either wait ends). A thrown read or write, or a notice whose mail
  // failed, lands here: two minutes, then ten, each outlasting the lease.
  reply_read: [2 * MIN_MS, 10 * MIN_MS],
  // A booking tool's notice, read (00345). Written to be run again: the ledger's row is kept last and a visit is found
  // by its key, so a try that died after the write restates the row it wrote. A model's bad minute or a failed write
  // throws and lands here: two minutes, then ten, each outlasting the lease. The third try holds the notice for a
  // person before it fails (booking-read.ts), so the delivery is never only a failed job.
  booking_read: [2 * MIN_MS, 10 * MIN_MS],
  // One event's delivery to one subscriber (00334): the delivery row takes each verdict, and every subscriber may run
  // twice, so a throw is a provider's or the database's bad minute: two minutes, then ten, each outlasting the lease.
  event_deliver: [2 * MIN_MS, 10 * MIN_MS],
  // One part of a connection's history (00478, decision 0073). Written to be run again: every write is once by the
  // provider's id, and a part that throws notes where it stood first, so the next try reads on from there. A provider's
  // bad minute throws and lands here: two minutes, then ten, each outlasting the lease (its pace does not: the part
  // ends and the next waits a rest, edge mail-history.ts). The third try says so on the source's row, with Try again
  // (edge history-import.ts), so a stop is never only a failed job.
  history_import: [2 * MIN_MS, 10 * MIN_MS],
  // A text answered after its acknowledgement (00347): a thrown read or write is the database's bad minute. One more
  // try, after a wait that outlasts the lease; a second throw fails it, and the deadman sweep then hands the message to
  // a person (lib/receptionist/unfinished.ts), as it would a turn that died in the door.
  inbound_answer: [2 * MIN_MS],
};

/**
 * How long a job that just threw waits before it is tried again; null when it is failed now. The wait is drawn a little
 * longer at random (contracts jittered), so the jobs one outage failed together are not all claimed again in the same
 * heartbeat; only ever longer, so every wait still outlasts the lease. A job that spoke before it threw (spoke_at) is
 * failed now, as a kind that always speaks is: its words may have left.
 */
export function retryWait(
  job: { kind: string; attempts: number; spoke_at?: string | null },
  random: () => number = Math.random,
): number | null {
  if (SPEAKS_TO_A_PERSON.has(job.kind) || job.spoke_at || job.attempts >= MAX_ATTEMPTS) return null;
  const wait = RETRY_WAITS_MS[job.kind]?.[job.attempts - 1];
  return wait === undefined ? null : jittered(wait, random);
}

/**
 * A kind this runner does not know is kept, not failed: a row written by a newer deploy (a kind that arrived with its
 * handler, its caller and its CHECK) waits for the runner that knows it, so the edge and the database may deploy in
 * either order. It is looked at again after UNKNOWN_KIND_WAIT_MS, and failed as unknown only once it has been due for
 * UNKNOWN_KIND_GIVE_UP_MS: a day is longer than any deploy takes to land, and short enough that a kind nothing will
 * ever know is told to its owner.
 */
export const UNKNOWN_KIND_WAIT_MS = 5 * MIN_MS;
export const UNKNOWN_KIND_GIVE_UP_MS = DAY_MS;

/** The next due job, claimed for this run; null when nothing is due. */
export async function claimNext(db: Db, leaseSeconds: number): Promise<LedgerRow | null> {
  const { data, error } = await db.rpc("claim_due_jobs", { p_limit: 1, p_lease_seconds: leaseSeconds });
  if (error) throw new Error(`claim_due_jobs: ${error.message}`);
  const rows: LedgerRow[] = data ?? [];
  return rows[0] ?? null;
}

/** PostgREST's answer for a column the database does not hold yet (a database 00352 has not reached). */
const NO_SUCH_COLUMN = "PGRST204";

/**
 * A job about to put words on a wire says so first (jobs.spoke_at, 00352), on its row and on the claim this run was
 * handed: from then on it is judged as a kind that always speaks is (verdictFor, retryWait), so a claim after a lease
 * that ran out gives up and a throw is not retried. The same compare-and-swap as the exits. Throws when this run no
 * longer holds the row (its lease was taken back, and another run has it: this one must not speak) or the write
 * failed, and the caller sends nothing: a missed answer beats a second one. Said once: a job that speaks twice in one
 * run writes it the first time. A database 00352 has not reached keeps no such fact: the job speaks as it did, and
 * this run still knows it spoke.
 */
export async function markSpoke(
  db: Db,
  job: { id: string; attempts?: number; spoke_at?: string | null },
): Promise<void> {
  if (job.spoke_at) return;
  const at = new Date().toISOString();
  let write = db.from("jobs").update({ spoke_at: at }).eq("id", job.id).eq("state", "fired");
  if (job.attempts !== undefined) write = write.eq("attempts", job.attempts);
  const { data, error } = await write.select("id");
  if (error && error.code !== NO_SUCH_COLUMN) throw new Error(`mark_spoke: ${error.message}`);
  if (!error && (data?.length ?? 0) === 0) throw new Error("mark_spoke: this run no longer holds the job");
  job.spoke_at = at;
}

/**
 * Both exits compare-and-swap on the state AND the claim. A run whose lease ran
 * out and was taken back must not be able to finish the row out from under the
 * run that holds it now; zero rows means exactly that, and the caller says so.
 */
export async function completeJob(db: Db, job: { id: string; attempts: number }): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "done", lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`complete_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function failJob(db: Db, job: { id: string; attempts: number }, reason: string): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({ state: "failed", last_error: reason.slice(0, 500), lease_until: null })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`fail_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Keep a job, to be claimed again once `untilIso` passes: one that threw (retryWait), or one whose kind this runner
 * does not know (UNKNOWN_KIND_WAIT_MS). Its lease is put off and why is kept on the row. The same compare-and-swap as
 * the exits, so false means this run no longer holds it.
 *
 * `giveBackClaim` is for the second: nothing ran, so the claim is given back (attempts less one) and the next claim
 * is still the job's first, which verdictFor judges as one when a runner that knows the kind takes it. A job that
 * threw keeps its claim: it ran, and the next try is its second.
 */
export async function deferJob(
  db: Db,
  job: { id: string; attempts: number },
  untilIso: string,
  reason: string,
  giveBackClaim = false,
): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .update({
      lease_until: untilIso,
      last_error: reason.slice(0, 500),
      ...(giveBackClaim ? { attempts: Math.max(0, job.attempts - 1) } : {}),
    })
    .eq("id", job.id)
    .eq("state", "fired")
    .eq("attempts", job.attempts)
    .select("id");
  if (error) throw new Error(`defer_job: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
