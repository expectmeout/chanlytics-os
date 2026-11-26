/**
 * A send planned again (Reach out, Part 3; C5: a wait defers, never cancels). A send that went stale (its run approved
 * late, its chain resumed, its mailbox's day full so the claim left it), one whose mailbox was removed, one the door
 * sent back with a wait (the mailbox's day full, the mailbox not sending now), and one claimed and never written: each
 * takes a new moment from the timetable, in its lead's own hours, from now: a first email on any of the step's
 * mailboxes, a later one on the mailbox its lead's chain writes from (decision 0056), or skipped `mailbox_gone` when
 * that mailbox is no more. The mailboxes' times are read afresh with these sends' own old times taken out
 * (senders.ts), so a send never waits for itself. A send that finds no moment within the horizon tries again
 * tomorrow. One that has waited two weeks, or that the door sent back ten times, is skipped, `kept_waiting`, and its
 * run says so. A send of a reach-out its owner sends (00429) has no mailbox and no timetable: it is due again from now,
 * to be drafted, its mailbox let go.
 *
 * `attempts` counts the emails written for a send (its next email's id is its send and that number, core sendMessageId):
 * only a send the door sent back, whose email row exists, moves it on. A send planned again without an email row
 * keeps its number, so its next email is the one it never wrote.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { listChainSteps, listLeadClocks, moveSend, type ReachOutSendRow } from "@chanlytics/db/campaigns";
import { findWorkspaceZone } from "@chanlytics/db/workspace";
import type { Database } from "@chanlytics/db/types";
import { DAY_MS, DEFAULT_TIMEZONE, timetable, weekHoursOf, zoneOfRegion, DbFailure } from "@chanlytics/contracts";
import { stepSenders } from "./senders.js";
import type { Logger } from "../../shared/log.js";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

type Db = SupabaseClient<Database>;

/** Emails written for a send before it is given up on: the door sent it back this often, it is not going. */
const REPLAN_MAX_ATTEMPTS = 10;
/** How long a send may wait for room before it is given up on: a reach-out two weeks late is not the one approved. */
export const REPLAN_GIVE_UP_MS = 14 * DAY_MS;

/** A send to plan again, and whether an email row was written for it (a door's wait), which moves its number on. */
export interface Replan {
  send: ReachOutSendRow;
  wrote: boolean;
}

export interface ReplanCounts {
  replanned: number;
  waiting: number;
  gave_up: number;
}

type Move = (s: ReachOutSendRow, patch: Partial<ReachOutSendRow>) => Promise<boolean>;

/** A step's pace and mailboxes, and whether its chain's root says its owner sends it (00429), in one read. */
async function stepAndRootOf(db: Db, tenantId: TenantId, stepId: string, rootId: string) {
  const { data, error } = await listChainSteps(db, tenantId, [stepId, rootId]);
  if (error) throw new DbFailure(error, "the step");
  const rows = data;
  return {
    step: rows.find((p) => p.id === stepId) ?? null,
    ownerSends: rows.find((p) => p.id === rootId)?.owner_sends === true,
  };
}

/** A reach-out its owner sends (00429): each is due again from now, with no mailbox, or given up as any send is. */
async function replanOwnerSends(
  group: readonly ReachOutSendRow[],
  params: { now: Date; wrote: ReadonlySet<string>; move: Move; out: ReplanCounts },
): Promise<void> {
  for (const s of group) {
    const attempts = s.attempts + (params.wrote.has(s.id) ? 1 : 0);
    if (attempts >= REPLAN_MAX_ATTEMPTS || params.now.getTime() - Date.parse(s.created_at) > REPLAN_GIVE_UP_MS) {
      if (await params.move(s, { state: "skipped", reason: "kept_waiting", attempts: Math.min(attempts, 20) }))
        params.out.gave_up += 1;
      continue;
    }
    const patch = { send_at: params.now.toISOString(), mailbox_id: null, attempts, message_id: null };
    if (await params.move(s, { ...patch, state: "planned", claimed_at: null })) params.out.replanned += 1;
  }
}

/**
 * An owner's sends planned again as theirs (replanOwnerSends), and the rest handed back for their mailboxes: a chain its
 * owner sends, every one; a mailbox's, a later step planned with no mailbox while its owner sent the chain, whose thread
 * is in their own inbox (the draft claim takes it, sender.ts hands it over by its parent), never ended as a mailbox's
 * gone (00429).
 */
async function keepTheirs(
  group: readonly ReachOutSendRow[],
  params: {
    ownerSends: boolean;
    step: { after_step_id: string | null } | null;
    now: Date;
    wrote: ReadonlySet<string>;
    move: Move;
    out: ReplanCounts;
  },
): Promise<ReachOutSendRow[]> {
  const theirs = params.ownerSends ? group : params.step?.after_step_id ? group.filter((s) => !s.mailbox_id) : [];
  if (theirs.length) await replanOwnerSends(theirs, params);
  return group.filter((s) => !theirs.includes(s));
}

/** A workspace's clock; one that cannot be read is the default's, and said in the log. */
const zoneOrDefault = async (
  db: Parameters<typeof findWorkspaceZone>[0],
  tenantId: Parameters<typeof findWorkspaceZone>[1],
) => (await findWorkspaceZone(db, tenantId).catch(logAndGoOn("findWorkspaceZone", null))) || DEFAULT_TIMEZONE;

/** The sends by their step: a step's pace and its mailboxes are its own. */
function sendsByStep(sends: readonly ReachOutSendRow[]): Map<string, [...ReachOutSendRow[], ReachOutSendRow]> {
  const byStep = new Map<string, [...ReachOutSendRow[], ReachOutSendRow]>();
  for (const s of sends) {
    const key = s.step_id ?? "";
    byStep.set(key, [...(byStep.get(key) ?? []), s]);
  }
  return byStep;
}

/**
 * The leads' zones and hours, by lead, a hundred at a time: an id list rides in the request's address, and a step's sends
 * can be five hundred.
 */
async function leadClocksOf(db: Db, tenantId: TenantId, sends: readonly ReachOutSendRow[]) {
  const leads: Array<{ id: string; region: string | null; hours: unknown }> = [];
  const ids = [...new Set(sends.map((s) => s.lead_id))];
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await listLeadClocks(db, tenantId, ids.slice(i, i + 100));
    if (error) throw new Error(`the leads: ${error.message}`);
    leads.push(...data);
  }
  return new Map(leads.map((l) => [l.id, l]));
}

/** Each mailbox's times these sends hold (00424): a planned send its time, a claim the moment it was claimed. */
function heldTimesOf(sends: readonly ReachOutSendRow[]): Map<string, number[]> {
  const own = new Map<string, number[]>();
  for (const s of sends) {
    const held = s.state === "planned" ? s.send_at : s.state === "claimed" ? s.claimed_at : null;
    if (s.mailbox_id && held) own.set(s.mailbox_id, [...(own.get(s.mailbox_id) ?? []), Date.parse(held)]);
  }
  return own;
}

/** What one tick's replan holds for every step: its clock, the sends a door wrote for, the move, the counts, the zones read. */
interface ReplanTick {
  now: Date;
  wrote: ReadonlySet<string>;
  move: Move;
  out: ReplanCounts;
  zones: Map<string, string>;
}

/**
 * One send placed again: given up past its tries or its two weeks, at the moment the timetable found, or, with none,
 * tomorrow, where only the timetable places it, in its lead's hours (a claim would otherwise take it at this clock time,
 * whatever the hour where the lead is). A later step keeps its lead's mailbox; a first one is placed afresh.
 */
async function placeAgain(
  row: ReachOutSendRow,
  found: { sendAtMs: number; senderId: string } | undefined,
  tick: ReplanTick & { keeps: boolean },
): Promise<void> {
  const { now, move, out } = tick;
  const attempts = row.attempts + (tick.wrote.has(row.id) ? 1 : 0);
  const tooLong = now.getTime() - Date.parse(row.created_at) > REPLAN_GIVE_UP_MS;
  // Two weeks is the end whether or not a moment was found: a send that fails every time it is written (its claim left,
  // planned again, claimed again) would otherwise circle for good, holding its mailbox's day.
  if (attempts >= REPLAN_MAX_ATTEMPTS || tooLong) {
    if (await move(row, { state: "skipped", reason: "kept_waiting", attempts: Math.min(attempts, 20) }))
      out.gave_up += 1;
    return;
  }
  const again = (sendAtMs: number, mailboxId: string | null) =>
    move(row, {
      state: "planned",
      send_at: new Date(sendAtMs).toISOString(),
      mailbox_id: mailboxId,
      attempts,
      message_id: null,
      claimed_at: null,
    });
  if (found) {
    if (await again(found.sendAtMs, found.senderId)) out.replanned += 1;
    return;
  }
  if (await again(now.getTime() + DAY_MS, tick.keeps ? row.mailbox_id : null)) out.waiting += 1;
}

/**
 * One step's sends planned again: its owner's as theirs (keepTheirs), a later step's whose lead's mailbox is no more
 * ended there, as its run's would be (core runReachOut), and the rest placed by the timetable on the step's mailboxes.
 */
async function replanStep(
  db: Db,
  stepId: string,
  group: [...ReachOutSendRow[], ReachOutSendRow],
  tick: ReplanTick,
): Promise<void> {
  const { now, move, out, zones } = tick;
  const tenantId = group[0].tenant_id;
  const { step, ownerSends } = await stepAndRootOf(db, tenantId, stepId, group[0].sequence_id);
  const mine = await keepTheirs(group, { ownerSends, step, now, wrote: tick.wrote, move, out });
  if (mine.length === 0) return;
  const leadOf = await leadClocksOf(db, tenantId, mine);
  if (!zones.has(tenantId)) zones.set(tenantId, await zoneOrDefault(db, tenantId));
  // A later step's send keeps the mailbox its lead's chain writes from; a first one may take any of the step's.
  const keeps = !!step?.after_step_id;
  // Each mailbox's times, less these sends' own: a send planned again never waits for the time it held.
  const own = heldTimesOf(mine);
  const kept = keeps ? mine.map((s) => s.mailbox_id).filter((m): m is string => !!m) : [];
  const named = step?.mailbox_ids ?? [];
  const { senders, gone } = await stepSenders(db, { tenantId, named, also: kept, at: now, own });
  const ended = new Set(mine.filter((s) => keeps && (!s.mailbox_id || gone.has(s.mailbox_id))).map((s) => s.id));
  for (const s of mine)
    if (ended.has(s.id) && (await move(s, { state: "skipped", reason: "mailbox_gone" }))) out.gave_up += 1;
  const placing = mine.filter((s) => !ended.has(s.id));
  const plan = timetable({
    sends: placing.map((s) => ({
      id: s.id,
      zone: zoneOfRegion(leadOf.get(s.lead_id)?.region ?? null) ?? zones.get(tenantId) ?? DEFAULT_TIMEZONE,
      week: weekHoursOf(leadOf.get(s.lead_id)?.hours).week,
      only: keeps ? s.mailbox_id : null,
    })),
    senders: senders.filter((d) => d.cap > 0),
    gapMinutes: step?.gap_minutes || 12,
    nowMs: now.getTime(),
  });
  const placed = new Map(plan.placed.map((p) => [p.id, p]));
  for (const row of placing) await placeAgain(row, placed.get(row.id), { ...tick, keeps });
}

export async function replanSends(db: Db, items: Replan[], now: Date, log: Logger): Promise<ReplanCounts> {
  const out: ReplanCounts = { replanned: 0, waiting: 0, gave_up: 0 };
  if (items.length === 0) return out;
  const wrote = new Set(items.filter((i) => i.wrote).map((i) => i.send.id));
  // A send moves from wherever it stands (planned, claimed, queued), and only as it was read.
  const move: Move = (s, patch) => moveSend(db, { tenantId: s.tenant_id, id: s.id, from: s.state, patch });
  const tick: ReplanTick = { now, wrote, move, out, zones: new Map() };
  for (const [stepId, group] of sendsByStep(items.map((i) => i.send))) {
    // A step removed since (its sends' step_id set null): nothing to pace or place them by, so they go no further.
    if (!stepId) {
      for (const s of group) if (await move(s, { state: "skipped", reason: "step_removed" })) out.gave_up += 1;
      continue;
    }
    try {
      await replanStep(db, stepId, group, tick);
    } catch (e) {
      // One step's sends that could not be planned again keep as they are, for the next tick.
      log.error("reach_out_replan_failed", { playbook_id: stepId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
