/**
 * Each kind of job, as the ledger treats it, declared once (decision 0089). The database holds the rest of a kind in its
 * job_kinds row (00526: its lane and its once-only key), and jobs/job-kinds.test.mjs holds the two equal; the handler is
 * HANDLERS' (handlers.ts) and the owner's words JOB_WORK's (contracts), each a Record over JOB_KINDS, so a kind added to
 * contracts without its policy here does not build.
 *
 * What used to be four tables in ledger.ts (SPEAKS_TO_A_PERSON, RETRY_WAITS_MS, TOLD_ELSEWHERE and the kinds it pages
 * on), a branch per kind in settle.ts, and a word in each handler for "my last try": every one is a field here now.
 */
import { entryOf, MIN_MS, SECOND_MS, type JobKind } from "@chanlytics/contracts";

/**
 * Who hears that a job of the kind failed for good: its workspace's owner, in their words (contracts jobNewsWords); the
 * platform, paged (ledger PAGES_THE_PLATFORM: the fault is ours, nothing an owner can act on); or nobody from the ledger,
 * because something else tells the right person (the deadman sweep hands a text that went unanswered to a person with the
 * customer's words; a search says it stopped; Health shows a preview or a canary that did not finish).
 */
export type KindTold = "owner" | "platform" | "elsewhere";

/**
 * Whether a job of the kind leaves something saying it is still going when it will not finish (a message "Sending…", a
 * preview "building", an import "running"), which the ledger then settles (settle.ts SETTLERS) whichever way the job
 * ended: its last try threw, a run died and the ledger gave up, or nothing knew the kind. "nothing": it leaves nothing.
 */
export type KindSettles = "ledger" | "nothing";

export interface KindPolicy {
  /**
   * Whether a second run could reach a real person a second time, whatever the first got to: such a kind is never run
   * again after a claim that did not report back, and never tried again after a throw. A kind that speaks only at the end
   * of work safe to repeat (a text's answer, after the model's turn) is not one: it says so on its row the moment before it
   * speaks (ledger markSpoke), and is judged as one from then on.
   */
  speaks: boolean;
  /**
   * How long a job of the kind that THREW waits before each try again (the wait is the next due time, ledger deferJob);
   * empty: a throw fails it at once. Only internal work written to be run again has any. Every wait outlasts the lease
   * (jobs-ledger.test.mjs), and MAX_ATTEMPTS still bounds every try, a death's and a throw's alike.
   */
  retryWaitsMs: readonly number[];
  told: KindTold;
  settles: KindSettles;
  /**
   * Whether the tick binds the workspace's wires for it (WhatsApp from the vault, Instagram, the texting line, email and
   * its intake): a kind that never puts words on a wire is handed none, and reads no credential to run.
   */
  wires: boolean;
  /**
   * The longest one call a run of the kind makes, in milliseconds (a provider's or a model's timeout): what
   * tick-geometry.test.mjs holds inside the window the kind is handed, so no call outlives the function.
   */
  longestCallMs: number;
  /**
   * The ids its payload must name, each a non-empty string: what its handler cannot run without. A job scheduled without
   * one is refused at the write (schedule.ts), and one claimed without one fails as never run, certain, and pages us
   * (handlers.ts dispatchJob), never half-run.
   */
  ids: readonly string[];
  /**
   * What its payload never carries: a person's words or address belong on the row it names (decision 0089, "ids, not
   * people"), where an erasure finds them, never in a second copy on the ledger.
   */
  never: readonly string[];
}

const TWICE = [2 * MIN_MS, 10 * MIN_MS] as const;
const SLOW_TWICE = [5 * MIN_MS, 30 * MIN_MS] as const;
const ONCE = [2 * MIN_MS] as const;
const NO_FIELDS = [] as const;

export const KIND_POLICY: Record<JobKind, KindPolicy> = {
  // A reply, a member's or the receptionist's: the send claims its row before the wire, and a run that died may have sent.
  outbound_send: {
    speaks: true,
    retryWaitsMs: NO_FIELDS,
    told: "owner",
    settles: "ledger",
    wires: true,
    longestCallMs: 32 * SECOND_MS,
    ids: ["message_id", "conversation_id"],
    never: ["body"],
  },
  // One batch of a run: a person is claimed on their row before the wire; a dying run is handed to a fresh one.
  broadcast_send: {
    speaks: true,
    retryWaitsMs: NO_FIELDS,
    told: "owner",
    settles: "ledger",
    wires: true,
    longestCallMs: 32 * SECOND_MS,
    ids: ["broadcast_id"],
    never: [],
  },
  // The line's saga reads its own receipts; its stuck rule and the lines sweep take a saga that stopped.
  line_provision: {
    speaks: false,
    retryWaitsMs: NO_FIELDS,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 20 * SECOND_MS,
    ids: [],
    never: [],
  },
  // Learned on email's first day live (18 Sep 2026): an intake that threw once lost the email. Five minutes, then thirty.
  email_ingest: {
    speaks: false,
    retryWaitsMs: SLOW_TWICE,
    told: "owner",
    settles: "ledger",
    wires: true,
    longestCallMs: 20 * SECOND_MS,
    ids: ["received_id"],
    never: [],
  },
  // The lead finder's three (00140): a start claims its run row first, a collect commits a page by compare-and-set, a
  // check commits by lead id. A provider's 429 or 5xx: two minutes, then ten.
  lead_round_start: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: [],
    never: [],
  },
  // Told by its search: the sweep ends a run whose collects keep failing, and the round says the search stopped (00491).
  lead_collect: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: [],
    never: [],
  },
  lead_check: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: [],
    never: [],
  },
  // A phone told from a kept row (00162), and the receipts of a send (00189): the service's bad minute, then its outage.
  push_send: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: ["notification_id"],
    never: [],
  },
  push_receipts: {
    speaks: false,
    retryWaitsMs: SLOW_TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  // A reach-out's reply, read (00222): the reading is kept once per message, the notice claimed before it is told.
  reply_read: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: ["message_id"],
    never: [],
  },
  // A thread's draft, written when it is owed (00538, decision 0093): text on a row, so nothing speaks and a run that died
  // only leaves the row saying it is being written, which the ledger settles. Its two tries of the route's model: 40s.
  reply_draft: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "elsewhere",
    settles: "ledger",
    wires: false,
    longestCallMs: 40 * SECOND_MS,
    ids: ["conversation_id", "draft_kind"],
    never: ["body", "text", "instruction"],
  },
  // A booking tool's notice, read (00345): the third try holds the notice for a person itself; a run that died on it is
  // held by the ledger, so the delivery is never only a failed job.
  booking_read: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "ledger",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: ["received_id"],
    never: [],
  },
  // One event's delivery to one subscriber (00334): the platform's to mend, and a delivery that never settled is
  // settled failed, so Deliver again reaches it.
  event_deliver: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "ledger",
    wires: true,
    longestCallMs: 30 * SECOND_MS,
    ids: ["event_id", "subscriber", "kind"],
    never: [],
  },
  // A text answered after its acknowledgement (00347): one more try; the deadman hands a message nobody answered to a
  // person with the customer's words. Its payload carries the provider's message, from which the whole inbound phase runs
  // again: an erasure cancels and scrubs it while it waits, a retry waiting included, now that one is scheduled (00526).
  inbound_answer: {
    speaks: false,
    retryWaitsMs: ONCE,
    told: "elsewhere",
    settles: "nothing",
    wires: true,
    longestCallMs: 40 * SECOND_MS,
    ids: ["message_id", "conversation_id"],
    never: [],
  },
  // One part of a connection's history (00478): a stop says so on the source's row, with Try again.
  history_import: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "owner",
    settles: "ledger",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: ["source", "seq"],
    never: [],
  },
  // The business's website, read for Check (00479): kept only once read, so a run that died leaves the last read.
  website_read: {
    speaks: false,
    retryWaitsMs: NO_FIELDS,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: [],
    never: [],
  },
  // A lead's preview built (00497): marked failed when it will not be, so a send waiting on it is skipped with why.
  preview_build: {
    speaks: false,
    retryWaitsMs: ONCE,
    told: "elsewhere",
    settles: "ledger",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: ["preview_id"],
    never: [],
  },
  // An erasure a press left unfinished (00501), or one a press of many handed over: the person stays blocked, never live,
  // until it is done or the owner presses again.
  erasure_finish: {
    speaks: false,
    retryWaitsMs: SLOW_TWICE,
    told: "owner",
    settles: "nothing",
    wires: false,
    longestCallMs: 20 * SECOND_MS,
    ids: ["contact_id"],
    never: [],
  },
  // A file read by the small model (00551): no answer leaves the file usable under its own name, and its row stops saying
  // Looking (settle.ts), for the sweep to try again. Safe to repeat: a failed try leaves a good look as it was.
  file_look: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "elsewhere",
    settles: "ledger",
    wires: false,
    longestCallMs: 30 * SECOND_MS,
    ids: ["file_id"],
    never: [],
  },
  // Pictures from the business's website or listing, kept once by their fingerprint, so a repeat keeps nothing twice.
  file_fetch: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "elsewhere",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: ["source", "batch"],
    never: [],
  },
  // A removed file's bytes, Anthropic's copy and its row let go, or bytes that never became a file. The owner sees it gone
  // already, so a failure is ours: Health counts it, and the sweep asks again for a week.
  file_purge: {
    speaks: false,
    retryWaitsMs: SLOW_TWICE,
    told: "elsewhere",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: ["file_id"],
    never: [],
  },
  // A video made ready one step a run (00556): its sheet, its sound, its words, its note, its look. Each step is written to be
  // run again and asks one provider at a time, the longest an ear's answer on a ten-minute clip; a throw comes back two minutes
  // on (the audio not made yet, an ear down), and a step still undone a day on is the sweep's. Its row stops saying Looking
  // when its last try fails (settle.ts settleVideoDigest).
  video_digest: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "elsewhere",
    settles: "ledger",
    wires: false,
    longestCallMs: 38 * SECOND_MS,
    ids: ["file_id", "step"],
    never: [],
  },
  // A workspace's hourly work, handed out by its clock (00569, decision 0115). Nothing here puts words on a wire: a moment's
  // run schedules its send, a step's plans it. Each asks what is due when it runs, so a second try runs only what the first
  // did not, and what fails for good is the platform's to mend and tried again the next hour anyway.
  campaign_moments: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  reach_out_steps: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  // A workspace's occasions whose time has come, handed out each minute by the sequences' clock (00585, decision 0119).
  // Nothing here puts words on a wire: a person's step schedules its send. Each row is settled as it is run, so a second
  // try runs only what the first did not, and what is left waiting is handed out again the next minute anyway.
  sequence_occasions: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  calendar_read: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  google_read: {
    speaks: false,
    retryWaitsMs: TWICE,
    told: "platform",
    settles: "nothing",
    wires: false,
    longestCallMs: 10 * SECOND_MS,
    ids: [],
    never: [],
  },
  // The ledger's own proof that it runs (00526): it does nothing, and Health says when it stops finishing.
  canary: {
    speaks: false,
    retryWaitsMs: NO_FIELDS,
    told: "elsewhere",
    settles: "nothing",
    wires: false,
    longestCallMs: 0,
    ids: [],
    never: [],
  },
};

/** The policy of a kind this build declares; null for one it does not (a row a newer deploy wrote). */
export function kindPolicyOf(kind: string): KindPolicy | null {
  return entryOf(KIND_POLICY, kind) ?? null;
}

/** The kinds whose policy says `pick` of them, as a set: what ledger.ts and tick.ts ask a kind by. */
export function kindsWhere(pick: (p: KindPolicy) => boolean): ReadonlySet<string> {
  return new Set(Object.entries(KIND_POLICY).flatMap(([kind, p]) => (pick(p) ? [kind] : [])));
}
