import "server-only";
import {
  parseParamSpecs,
  PLAYBOOK_TRIGGERS,
  playbookRunReach,
  toPersonRowVM,
  type PersonRowDto,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { checkPlaybook, type PlaybookInput } from "@chanlytics/core";
import type { RouteContext } from "@/server/with-route";
import { listRuns } from "@/server/broadcasts";
import { peopleVisits } from "@/server/calendar";
import { templateValuePorts } from "@/server/campaign-ports";
import { everyone } from "@/server/people";

/**
 * Playbooks, read and checked.
 *
 * A playbook row plus what its runs earned: sent, delivered and replied
 * summed over the recent runs (the broadcasts that carry its id), the last
 * run's state, and a run waiting for a person if there is one. The checks
 * are the send route's own, so a playbook can never name a template a
 * broadcast could not send or a slot the workspace cannot fill.
 */
const COLUMNS =
  "id, name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at";

/** One run on a card's history: the day it ran for, and what it earned. */
export interface RunSummary {
  id: string;
  run_for: string | null;
  state: string;
  scheduled_for: string;
  recipient_count: number;
  sent: number;
  held: number;
  delivered: number;
  replied: number;
}

/** How many runs a card lists; the totals are over every run. */
export const HISTORY_ON_CARD = 10;

export interface PlaybookTotals {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  waiting: { id: string; recipient_count: number; name: string } | null;
  /** The most recent runs, newest first, from the same rows the totals are summed over. */
  history: RunSummary[];
}

/** How far back a touch counts for the week's breath: PLAYBOOK_BREATH_MS, as the sweep applies it. */
const BREATH_MS = 7 * 86_400_000;

/**
 * Who a broadcast of any kind reached, or is about to, within the week: the
 * touches the sweep applies as the breath, so the Playbooks page can say how
 * many of a trigger's people wait for it rather than counting them as due.
 * contact id → the ISO time of the touch.
 */
export async function recentTouches(ctx: RouteContext, tenantId: string, now: Date): Promise<Record<string, string>> {
  const since = new Date(now.getTime() - BREATH_MS).toISOString();
  const { data: runs, error } = await ctx.supabase
    .from("broadcasts")
    .select("id, scheduled_for, created_at, state")
    .eq("tenant_id", tenantId)
    .in("state", ["scheduled", "pending_approval", "sending", "sent"])
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  if (!runs || runs.length === 0) return {};
  const ids = runs.map((r) => r.id);
  const ofRun = new Map(runs.map((r) => [r.id, r]));
  const touched: Record<string, string> = {};
  for (let i = 0; i < ids.length; i += 200) {
    // A page at a time, in a fixed order: PostgREST answers at most max_rows,
    // and a touch cut off the end reads as a person nobody wrote to.
    for (let from = 0; ; from += TOUCH_PAGE) {
      const { data: people, error: pErr } = await ctx.supabase
        .from("broadcast_recipients")
        .select("broadcast_id, contact_id, state, sent_at")
        .eq("tenant_id", tenantId)
        .in("broadcast_id", ids.slice(i, i + 200))
        .in("state", ["sent", "queued"])
        .order("broadcast_id")
        .order("contact_id")
        .range(from, from + TOUCH_PAGE - 1);
      if (pErr) throw new Error(pErr.message);
      for (const r of people ?? []) {
        const run = ofRun.get(r.broadcast_id);
        if (!run) continue;
        const at = r.sent_at ?? run.scheduled_for ?? run.created_at;
        if (at >= since && (!touched[r.contact_id] || at > touched[r.contact_id])) touched[r.contact_id] = at;
      }
      if ((people ?? []).length < TOUCH_PAGE) break;
    }
  }
  return touched;
}

/** Rows per page of the touches read: PostgREST's max_rows. */
const TOUCH_PAGE = 1000;

/** A cap no workspace reaches: the pool is counted, not capped. */
export const PLAYBOOK_POOL = 100_000;

export interface TriggerPool {
  /** Who a run would pick now. */
  candidates: number;
  /** Who waits only for the week's breath: eligible, but reached by some broadcast within the week. */
  held: number;
  /** Everyone the moment names, before anyone is left out: the trigger's list, everyone, or the day's visits. */
  pool: number;
  /**
   * Who of them no run reaches whatever the week, and why (contracts
   * playbookRunReach): never said yes to what the playbook sends, asked to
   * stop, or no number to send to. The card's grey: the chips counted only
   * who said yes, so the people who never did were in no number on the page.
   */
  noYes: number;
  stopped: number;
  noNumber: number;
  /**
   * How many the moment names said the yes the playbook needs, a number or not.
   * `noNumber` counts everyone without one, yes or no, so only this tells a
   * list whose yes has no number from a list nobody said yes to (#663's rule).
   */
  saidYes: number;
}

/**
 * The chips' numbers per trigger, computed here over everyone with their
 * visits by the runner's own predicate, so the number on the chip is the
 * number a run starts from. Until 12 Sep 2026 the browser counted them over
 * the one page of People it had loaded, which slice D of the data program had
 * made a page of a thousand.
 */
export async function triggerPools(
  ctx: RouteContext,
  tenantId: string,
  touched: Record<string, string>,
  tz: string,
  now: Date,
): Promise<{ pools: Record<string, TriggerPool | null>; calendar: "ok" | "unavailable" | "none" }> {
  // The pools are a reading, never the page: a read that fails leaves the
  // playbooks themselves untouched. A moment it could not count is null, never
  // a zero: the page drew empty pools as "0 of 0" and "nobody to send to", and
  // offered the QR for a yes nobody knew was missing.
  let rows: PersonRowDto[];
  try {
    rows = await everyone(ctx, tenantId);
  } catch (e) {
    console.error(
      "playbook_pools_people_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return { pools: Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, null])), calendar: "none" };
  }
  const pv = await peopleVisits(ctx, tenantId, rows, now).catch((e: unknown) => {
    console.error(
      "playbook_pools_visits_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  });
  const calendar = pv?.calendar.state ?? "none";
  const vms = rows.map((r) =>
    toPersonRowVM({ ...r, visits: pv && pv.calendar.state === "ok" ? (pv.visits.get(r.id) ?? null) : null }, tz, now),
  );
  const breath = {
    byThis: new Map<string, number>(),
    byAny: new Map(Object.entries(touched).map(([id, at]) => [id, Date.parse(at)])),
  };
  // One pass per moment, the runner's own: who it would pick, who waits for the
  // week's breath, and who it names and leaves out whatever the week. A moment
  // the calendar names is not counted when the calendar could not be read.
  const pools: Record<string, TriggerPool | null> = {};
  for (const t of PLAYBOOK_TRIGGERS) {
    if (t.kind === "visit" && !pv) {
      pools[t.id] = null;
      continue;
    }
    const { reach, saidYes } = playbookRunReach(
      vms,
      { trigger: t.id as PlaybookDto["trigger"], cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0 },
      breath,
      now.getTime(),
    );
    pools[t.id] = {
      candidates: reach.will,
      held: reach.heardAny,
      pool: reach.pool,
      noYes: reach.noYes,
      stopped: reach.stopped,
      noNumber: reach.noNumber,
      saidYes,
    };
  }
  return { pools, calendar };
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [{ data: rows, error }, runs] = await Promise.all([
    ctx.supabase.from("playbooks").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    listRuns(ctx, tenantId),
  ]);
  if (error) throw new Error(error.message);
  const totals = new Map<string, PlaybookTotals>();
  for (const b of runs) {
    if (!b.playbook_id) continue;
    const t = totals.get(b.playbook_id) ?? {
      runs: 0,
      sent: 0,
      delivered: 0,
      replied: 0,
      held: 0,
      lastRun: null,
      waiting: null,
      history: [],
    };
    t.runs += 1;
    t.sent += b.counts.sent;
    t.delivered += b.counts.delivered;
    t.replied += b.counts.replied;
    t.held += b.counts.skipped + b.counts.failed;
    if (t.history.length < HISTORY_ON_CARD) {
      t.history.push({
        id: b.id,
        run_for: b.run_for,
        state: b.state,
        scheduled_for: b.scheduled_for,
        recipient_count: b.recipient_count,
        sent: b.counts.sent,
        held: b.counts.skipped + b.counts.failed,
        delivered: b.counts.delivered,
        replied: b.counts.replied,
      });
    }
    if (!t.lastRun) t.lastRun = { id: b.id, state: b.state, run_for: b.run_for, recipient_count: b.recipient_count };
    if (b.state === "pending_approval" && !t.waiting)
      t.waiting = { id: b.id, recipient_count: b.recipient_count, name: b.name };
    totals.set(b.playbook_id, t);
  }
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state">),
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: parseParamSpecs(r.params),
    totals: totals.get(r.id) ?? {
      runs: 0,
      sent: 0,
      delivered: 0,
      replied: 0,
      held: 0,
      lastRun: null,
      waiting: null,
      history: [],
    },
  }));
}

export type { PlaybookInput };

/** Everything a playbook names, checked the way the send route checks a broadcast: core's checkPlaybook over this workspace's template and link. */
export async function checkPlaybookInput(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown> | null,
): Promise<PlaybookInput> {
  return checkPlaybook(templateValuePorts(ctx, tenantId), body);
}
