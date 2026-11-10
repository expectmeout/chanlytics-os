/**
 * A workspace's occasions whose time has come, settled as one job (decision 0119): the sequences' clock found one due
 * and handed the workspace a job (sequence_occasions), and the ledger gave it its turn.
 *
 * An occasion is one thing that happened to one person (a visit of theirs is two hours away, a visit was marked missed,
 * they were sent the booking link yesterday), and a sequence owes them its first step for it. Here each due one is run
 * or left, and its row says which, so nothing is asked twice:
 *
 *   left     its sequence, its step or the workspace was off when its time came; it was found more than a day late; what
 *            it was for no longer holds (the one reading: contracts occasionGone); or the run reached nobody (they never
 *            said yes, no channel carries it) or was off (its message is not approved). The row keeps why.
 *   ran      its batch was made, through the run every moment uses (lib/campaigns/playbooks/playbooks.ts runPlaybook over
 *            core's run-playbook), as the system's decision under its sequence's mode: it goes, or it waits for an OK.
 *   put off  while a step's words are new its first batch waits for the owner's OK, and the people behind it wait ten
 *            minutes at a time rather than each become an approval of their own; so does one whose run failed. Its time
 *            (`due_at`) never moves, so a day of waiting still ends it. One who runs out of time behind that batch (their
 *            visit began, or the day went by) is left, and the owner is told once a waiting batch that the wait is costing
 *            people (contracts leftBehindNotice).
 *
 * The workspace is read narrow, for the people due and nobody else (loadOccasionRunContext). A workspace that could not
 * be read throws, so the failure is counted and paged as any handed-out job's is; its people are put off ten minutes
 * first, so the clock does not hand it a job every minute it stays unreadable. Every row is still waiting.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MIN_MS,
  OCCASION_LATE_MS,
  addressOf,
  isOccasionTrigger,
  leftBehindNotice,
  occasionAppointment,
  occasionGone,
  type OccasionTrigger,
  type TenantId,
} from "@chanlytics/contracts";
import type { OccasionRun } from "@chanlytics/core";
import {
  deferOccasion,
  findBookedSince,
  findOccasionAppointment,
  findWaitingBatchOf,
  listOccasionsDue,
  settleOccasion,
  type DueOccasion,
  type OccasionAppointment,
} from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { logAndGoOn } from "@chanlytics/log";
import { notifyOnce, type NotifyMessage } from "../../shared/alerts/notify.js";
import { logger, type Logger } from "../../shared/log.js";
import { loadTenantNotifications } from "../../shared/tenant-runtime.js";
import { CONTEXT_PAUSED, loadOccasionRunContext, runPlaybook, type PlaybookRow } from "../playbooks/playbooks.js";

type Db = SupabaseClient<Database>;

/** The most of a workspace's due occasions one job settles: what is beyond them is the next minute's. */
const OCCASIONS_A_JOB = 40;

/** How long a step is put off while its words wait for their first OK, or after its run failed. */
const PUT_OFF_MS = 10 * MIN_MS;

/** Why someone who waited ran out of time: their visit began before the message could go, or a day went by. */
const OUT_OF_TIME: ReadonlySet<string> = new Set(["visit_begun", "too_late"]);

/** Tells a workspace's owner once (shared/alerts/notify.ts notifyOnce): the tests give their own mail and database. */
export type BehindNoticeSend = (db: Db, tenantId: TenantId, msg: NotifyMessage) => Promise<boolean>;

const sendBehindNotice: BehindNoticeSend = async (db, tenantId, msg) => {
  const target = await loadTenantNotifications(db, tenantId);
  return notifyOnce({ tenantId, ...target }, msg, { db });
};

/** The steps whose people ran out of time this turn while their words had no OK yet: each step's name, and how many. */
type LeftBehind = Map<string, { name: string; people: number }>;

/** One more person of a step left out of time, where its words still have no OK: they waited behind its first batch. */
function countBehind(behind: LeftBehind, step: { id: string; name: string; words_ok_at?: string | null }, why: string) {
  if (step.words_ok_at || !OUT_OF_TIME.has(why)) return;
  behind.set(step.id, { name: step.name, people: (behind.get(step.id)?.people ?? 0) + 1 });
}

/**
 * The owner told that a waiting OK is costing people (contracts leftBehindNotice): once per batch that waits, under its
 * own name, so the minutes after tell nobody again; the row opens that batch. Nothing where no batch of the step waits:
 * its people were late for another reason, which the job's own lines say. A notice that fails is logged, never the job's.
 */
async function tellLeftBehind(turn: OccasionsTurn, behind: LeftBehind, send: BehindNoticeSend): Promise<void> {
  const { db, tenantId, log } = turn;
  for (const [stepId, { name, people }] of behind) {
    try {
      const batchId = await findWaitingBatchOf(db, tenantId, stepId);
      if (!batchId) continue;
      const notice = leftBehindNotice(name, people);
      await send(db, tenantId, {
        kind: "playbook",
        route: addressOf({ kind: "send", id: batchId }),
        about: { type: "broadcast", id: batchId },
        subject: notice.subject,
        body: notice.body,
        onceKey: `occasions-behind:${batchId}`,
      });
    } catch (e) {
      log.error("occasions_behind_untold", { step_id: stepId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/** What a job came to, for its log line. */
type OccasionCounts = Record<"due" | "sent" | "held" | "left" | "put_off" | "failed" | "remaining", number>;

const noCounts = (): OccasionCounts => ({ due: 0, sent: 0, held: 0, left: 0, put_off: 0, failed: 0, remaining: 0 });

/** One workspace's job: its database, its moment, its log, and when it stops starting anything. */
export interface OccasionsTurn {
  db: Db;
  tenantId: TenantId;
  now: Date;
  until: number;
  log: Logger;
}

/** A due occasion that can still run: its row, its sequence's first step as a run takes it, and its moment. */
interface Live {
  row: DueOccasion;
  step: PlaybookRow;
  trigger: OccasionTrigger;
}

/** What became of one occasion this turn. */
type Settled = "sent" | "held" | "left" | "put_off";

/**
 * A due occasion as a run can take it, or why it is left before anything is read for it: its step does not run now,
 * it was found more than a day past its time, or its step is gone or holds no message.
 */
function liveOf(row: DueOccasion, nowMs: number): Live | { why: string } {
  if (!row.runs) return { why: "off" };
  if (nowMs - Date.parse(row.dueAt) > OCCASION_LATE_MS) return { why: "too_late" };
  const step = row.step;
  if (!step || !isOccasionTrigger(step.trigger)) return { why: "no_step" };
  // A moment's step always holds its message (sequence_steps' own check); one that did not would say nothing.
  const { template_id, template_name, template_language } = step;
  if (!template_id || !template_name || !template_language) return { why: "no_step" };
  return { row, step: { ...step, template_id, template_name, template_language }, trigger: step.trigger };
}

/** The visit an occasion's run is about, as the record holds it; none for an occasion that names no visit. */
function runOf(row: DueOccasion, appointment: OccasionAppointment | null): OccasionRun {
  return {
    contactId: row.contactId,
    occasion: row.occasion,
    visit: appointment
      ? {
          key: appointment.key,
          appointment: appointment.id,
          startsAt: Date.parse(appointment.startsAt),
          title: appointment.title,
          allDay: appointment.allDay,
        }
      : null,
  };
}

/**
 * Why an occasion is no longer owed, read off the record now (contracts occasionGone), with the appointment it names.
 * A visit that is another person's since (its row was linked to someone else) is gone for this one.
 */
async function standingOf(
  { db, tenantId, now }: OccasionsTurn,
  { row, trigger }: Live,
): Promise<{ gone: string | null; appointment: OccasionAppointment | null }> {
  const appointmentId = occasionAppointment(row.occasion);
  const appointment = appointmentId ? await findOccasionAppointment(db, tenantId, appointmentId) : null;
  // Whether they booked is asked only where it ends the occasion: a reminder is owed whatever else they hold.
  const booked =
    trigger === "visit_soon"
      ? { ahead: false, since: false }
      : await findBookedSince(db, tenantId, {
          contactId: row.contactId,
          since: new Date(row.createdAt),
          now,
          apartFrom: appointmentId,
        });
  const gone = occasionGone(trigger, row.occasion, {
    nowMs: now.getTime(),
    appointment: appointment
      ? { status: appointment.status, startsAt: Date.parse(appointment.startsAt), vanished: appointment.vanished }
      : null,
    bookedAhead: booked.ahead,
    bookedSince: booked.since,
  });
  if (gone) return { gone, appointment };
  return { gone: appointment && appointment.contactId !== row.contactId ? "visit_gone" : null, appointment };
}

/**
 * A workspace's due occasions, each run or left. `load` is the workspace's narrow run context and `tell` the notice's
 * door, the edge's own unless a caller hands another.
 */
export async function runDueOccasions(
  turn: OccasionsTurn,
  load: typeof loadOccasionRunContext = loadOccasionRunContext,
  tell: BehindNoticeSend = sendBehindNotice,
): Promise<OccasionCounts> {
  const { db, tenantId, now, log } = turn;
  const out = noCounts();
  const behind: LeftBehind = new Map();
  const page = await listOccasionsDue(db, tenantId, now, OCCASIONS_A_JOB + 1);
  const rows = page.slice(0, OCCASIONS_A_JOB);
  out.due = rows.length;
  out.remaining = page.length - rows.length;
  const leave = async (row: DueOccasion, why: string) => {
    await settleOccasion(db, { tenantId, id: row.id, outcome: { state: "left", why }, now });
    out.left += 1;
    log.info("occasion_left", { occasion_id: row.id, sequence_id: row.sequenceId, why });
  };
  const putOff = (row: DueOccasion) =>
    deferOccasion(db, { tenantId, id: row.id, until: new Date(now.getTime() + PUT_OFF_MS) });

  // What can no longer run is settled before anything is read for it.
  const live: Live[] = [];
  for (const row of rows) {
    const read = liveOf(row, now.getTime());
    if ("why" in read) {
      await leave(row, read.why);
      if (row.step) countBehind(behind, row.step, read.why);
    } else live.push(read);
  }
  if (live.length === 0) {
    await tellLeftBehind(turn, behind, tell);
    return out;
  }

  const ctx = await load(
    db,
    tenantId,
    now,
    live.map((item) => item.row.contactId),
  );
  if ("error" in ctx) {
    if (ctx.error !== CONTEXT_PAUSED) {
      // Put off before it is said: left due, the clock would hand this workspace a job every minute it cannot be read.
      await Promise.all(live.map(({ row }) => putOff(row).catch(logAndGoOn("deferOccasion"))));
      throw new Error(`the workspace could not be read for its occasions: ${ctx.error}`);
    }
    // Paused since the page was read: nothing of its sequences goes, as at any other hour.
    for (const { row } of live) await leave(row, "off");
    return out;
  }

  // Whether a batch of a step with new words already waits for its owner, asked once a step and kept as batches are made.
  const waits = new Map<string, boolean>();
  const wordsWait = async (step: PlaybookRow): Promise<boolean> => {
    if (step.words_ok_at) return false;
    const known = waits.get(step.id);
    if (known !== undefined) return known;
    const waiting = (await findWaitingBatchOf(db, tenantId, step.id)) !== null;
    waits.set(step.id, waiting);
    return waiting;
  };

  const settle = async (item: Live): Promise<Settled> => {
    const { row, step } = item;
    const { gone, appointment } = await standingOf(turn, item);
    if (gone) {
      await leave(row, gone);
      countBehind(behind, step, gone);
      return "left";
    }
    if (await wordsWait(step)) {
      await putOff(row);
      return "put_off";
    }
    const result = await runPlaybook(ctx, step, { by: { kind: "system" }, occasion: runOf(row, appointment) });
    switch (result.outcome) {
      case "sent":
      case "held":
        await settleOccasion(db, {
          tenantId,
          id: row.id,
          outcome: { state: "ran", batchId: result.broadcast_id },
          now,
        });
        if (result.outcome === "held") waits.set(step.id, true);
        return result.outcome;
      case "empty":
        await leave(row, "nobody");
        return "left";
      case "off":
        await leave(row, result.skipped);
        return "left";
      case "failed":
        throw new Error(result.error);
    }
  };

  for (const [i, item] of live.entries()) {
    if (Date.now() > turn.until) {
      log.info("occasions_yielded", { tenant_id: tenantId, left: live.length - i });
      out.remaining += live.length - i;
      break;
    }
    try {
      const came = await settle(item);
      // `leave` counts its own.
      if (came !== "left") out[came] += 1;
    } catch (e) {
      // One person's step that could not be made is put off and said; the others go on.
      out.failed += 1;
      log.error("occasion_run_failed", {
        occasion_id: item.row.id,
        sequence_id: item.row.sequenceId,
        error: e instanceof Error ? e.message : String(e),
      });
      await putOff(item.row).catch(logAndGoOn("deferOccasion"));
    }
  }
  await tellLeftBehind(turn, behind, tell);
  return out;
}

/** The kind as the job runner takes it: it says what it came to in one line. */
export function occasionRuns(db: Db) {
  return async (job: { tenant_id: TenantId }, deadline: number): Promise<OccasionCounts> => {
    const log = logger({ tenant_id: job.tenant_id, sweep: "occasions" });
    const counts = await runDueOccasions({ db, tenantId: job.tenant_id, now: new Date(), until: deadline, log });
    log.info("sequence_occasions_ran", counts);
    return counts;
  };
}
