import "server-only";
import {
  AppError,
  FOLLOW_UP_ONE,
  parseParamSpecs,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_TOUCH_WINDOW_MS,
  playbookRunStop,
  purposeOfTemplate,
  PLAYBOOK_TRIGGERS,
  consultFirstOf,
  poolListContext,
  poolRowsOf,
  withVisitsOf,
  listsFor,
  membersOf,
  resolveList,
  playbookRunReach,
  triggerOffered,
  dealsAreOn,
  type DealPaceVM,
  type FollowUpFactsDto,
  type PersonRowDto,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { checkPlaybook, type PlaybookInput } from "@chanlytics/core";
import {
  followUpTouchesSince,
  listRow,
  readAllRows,
  savedListsFor,
  touchIndex,
  touchesSince,
  type Touch,
} from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { listRuns } from "@/server/broadcasts";
import { peopleVisits } from "@/server/calendar";
import { createBroadcastPorts, templateValuePorts } from "@/server/campaign-ports";
import { everyone } from "@/server/people";
import { sellsByOf } from "@/server/deals";

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
  "id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at";

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

/**
 * Who a broadcast of any kind reached, or is about to, within the week: the touches the sweep applies as the breath
 * (packages/db touchesSince, the sweep's own reader), so the Playbooks page can say how many of a trigger's people wait
 * for it rather than counting them as due. contact id -> the time of their latest touch, as the row keeps it.
 */
export async function recentTouches(ctx: RouteContext, tenantId: string, now: Date): Promise<Record<string, string>> {
  const touched: Record<string, string> = {};
  for (const t of await touchesSince(ctx.supabase, tenantId, new Date(now.getTime() - PLAYBOOK_BREATH_MS), now)) {
    const was = touched[t.contact_id];
    if (!was || Date.parse(t.at) > Date.parse(was)) touched[t.contact_id] = t.at;
  }
  return touched;
}

/** The proposals out here (0006): who holds one, and when the oldest went. Null with none. A read that fails throws. */
async function proposalsOut(
  ctx: RouteContext,
  tenantId: string,
): Promise<{ contacts: Set<string>; oldestMs: number } | null> {
  const rows = await readAllRows<{ id: string; contact_id: string; proposed_at: string }>("deals", (from, to) =>
    ctx.supabase
      .from("deals")
      .select("id, contact_id, proposed_at")
      .eq("tenant_id", tenantId)
      .eq("stage", "proposed")
      .order("id")
      .range(from, to),
  );
  if (!rows.length) return null;
  return {
    contacts: new Set(rows.map((d) => d.contact_id)),
    oldestMs: Math.min(...rows.map((d) => Date.parse(d.proposed_at))),
  };
}

/** The proposal follow-ups' touches since the oldest proposal out, no further back than the sweep reads (0006). */
function followUpTouchesFor(
  ctx: RouteContext,
  tenantId: string,
  now: Date,
  out: { oldestMs: number },
): Promise<Touch[]> {
  const since = Math.max(out.oldestMs, now.getTime() - PLAYBOOK_TOUCH_WINDOW_MS);
  return followUpTouchesSince(ctx.supabase, tenantId, new Date(since), now);
}

/**
 * Who had a proposal follow-up, or is in a run made for one, from any playbook, one since deleted too (packages/db
 * touchIndex followUps): whom the run leaves out, and so the Playbooks counts and Ask (0006). None out, none. A read
 * that fails throws.
 */
export async function proposalFollowUps(ctx: RouteContext, tenantId: string, now: Date): Promise<Map<string, number>> {
  const out = await proposalsOut(ctx, tenantId);
  return out ? touchIndex(await followUpTouchesFor(ctx, tenantId, now, out)).followUps : new Map<string, number>();
}

/**
 * The proposal follow-up as People and Today read it (0006, contracts FollowUpFactsDto): its playbook's clock,
 * whether its class asks, what its template is for, and, of the people who hold a proposal out, who had theirs, who
 * is in a run on its way or waiting for a person, and whom the week's breath holds. Null wherever the run itself
 * would send nothing before drawing anyone -- none made, paused, its class set to never, the workspace paused by
 * billing, no WhatsApp number, its template not one Meta approved, its number flagged (contracts playbookRunStop) --
 * and where no proposal is out: every row then says what it said. A class with no row runs as ask, as the run reads
 * it (core run-playbook). A read that fails throws.
 */
export async function followUpFacts(ctx: RouteContext, tenantId: string, now: Date): Promise<FollowUpFactsDto | null> {
  const [pb, cls, tenant, number, out] = await Promise.all([
    ctx.supabase
      .from("playbooks")
      .select("state, run_hour, last_run_for, template_name, template_language")
      .eq("tenant_id", tenantId)
      .eq("trigger", "proposal_waiting")
      .maybeSingle(),
    ctx.supabase
      .from("policies")
      .select("mode")
      .eq("tenant_id", tenantId)
      .eq("class", "follow_up")
      .is("subject_type", null)
      .maybeSingle(),
    ctx.supabase.from("tenants").select("status").eq("id", tenantId).maybeSingle(),
    // The number as the send screen reads it (campaign ports): none, or its health.
    createBroadcastPorts(ctx, tenantId).number(),
    proposalsOut(ctx, tenantId),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  if (cls.error) throw new Error(cls.error.message);
  if (tenant.error) throw new Error(tenant.error.message);
  const mode = cls.data?.mode ?? "ask";
  const p = pb.data;
  if (!p || p.state !== "running" || mode === "never" || tenant.data?.status === "paused" || !number || !out)
    return null;
  const tpl = await ctx.supabase
    .from("templates")
    .select("meta_status, category")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", p.template_name)
    .eq("language", p.template_language)
    .maybeSingle();
  if (tpl.error) throw new Error(tpl.error.message);
  if (playbookRunStop({ templateStatus: tpl.data?.meta_status ?? null, canSend: number.canSend })) return null;
  const [followUps, recent] = await Promise.all([
    followUpTouchesFor(ctx, tenantId, now, out),
    touchesSince(ctx.supabase, tenantId, new Date(now.getTime() - PLAYBOOK_BREATH_MS), now),
  ]);
  const had: Record<string, string> = {};
  const queued: Record<string, string> = {};
  const held: Record<string, string> = {};
  const heard: Record<string, string> = {};
  const latest = (m: Record<string, string>, t: Touch) => {
    if (!m[t.contact_id] || Date.parse(t.at) > Date.parse(m[t.contact_id])) m[t.contact_id] = t.at;
  };
  // Only who holds a proposal out: the rows the facts are for.
  for (const t of followUps) if (out.contacts.has(t.contact_id)) latest(t.sent ? had : t.held ? held : queued, t);
  for (const t of recent) if (out.contacts.has(t.contact_id)) latest(heard, t);
  return {
    run_hour: p.run_hour,
    last_run_for: p.last_run_for,
    asks: mode === "ask",
    purpose: purposeOfTemplate(tpl.data?.category),
    had,
    queued,
    held,
    heard,
  };
}

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
  /**
   * Whether deals are on here, and the workspace's pace (contracts dealPaceOf): a proposal's moment is counted by the
   * pace where they are on, and reaches nobody where they are off, as its run does (0006).
   */
  deals: { on: boolean; pace: Pick<DealPaceVM, "waitDays"> | null },
): Promise<{
  pools: Record<string, TriggerPool | null>;
  calendar: "ok" | "unavailable" | "none";
  /** The lists a playbook may run on, each counted under "list:<id>"; null when they could not be read. */
  lists: { id: string; name: string; smart: boolean }[] | null;
  /** People's lists a playbook may run on here (none that is about whoever is looking), each counted under "seg:<id>". */
  people: { key: string; label: string; group: string }[];
}> {
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
    return {
      pools: Object.fromEntries(PLAYBOOK_TRIGGERS.map((t) => [t.id, null])),
      calendar: "none",
      lists: null,
      people: [],
    };
  }
  const pv = await peopleVisits(ctx, tenantId, rows, now).catch((e: unknown) => {
    console.error(
      "playbook_pools_visits_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
    return null;
  });
  const calendar = pv?.calendar.state ?? "none";
  // The pool's one reading (contracts audience-pool.ts), as a run reads it: no one looking, and no deal where deals
  // are off. The visits are marked as consultations by the same rule the edge's runner reads them by.
  const vms = poolRowsOf(
    withVisitsOf(rows, pv?.visits ?? new Map(), pv?.calendar ?? { state: "none", timezone: tz, source: "calendar" }),
    { tz, now, viewer: null, dealsOn: deals.on },
  );
  // Who already had their proposal's follow-up, from any playbook (proposalFollowUps): no run reaches them again for
  // that proposal (0006), so the moment's count leaves them out as its run does. Read only where deals are on;
  // unreadable, the moment is not counted.
  const followUps = deals.on
    ? await proposalFollowUps(ctx, tenantId, now).catch((e: unknown) => {
        console.error(
          "playbook_pools_follow_ups_failed",
          JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
        );
        return null;
      })
    : new Map<string, number>();
  const breath = {
    byThis: new Map<string, number>(),
    byAny: new Map(Object.entries(touched).map(([id, at]) => [id, Date.parse(at)])),
    followUps: followUps ?? new Map<string, number>(),
  };
  // One pass per moment, the runner's own: who it would pick, who waits for the
  // week's breath, and who it names and leaves out whatever the week. A moment
  // the calendar names is not counted when the calendar could not be read.
  const pools: Record<string, TriggerPool | null> = {};
  const count = (trigger: PlaybookDto["trigger"], listIds: ReadonlySet<string> | null): TriggerPool => {
    const { reach, saidYes } = playbookRunReach(
      vms,
      { trigger, cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0 },
      breath,
      now.getTime(),
      deals.pace,
      listIds,
    );
    return {
      candidates: reach.will,
      held: reach.heardAny,
      pool: reach.pool,
      noYes: reach.noYes,
      stopped: reach.stopped,
      noNumber: reach.noNumber,
      saidYes,
    };
  };
  for (const t of PLAYBOOK_TRIGGERS) {
    // A moment the calendar names (a visit, or the Lapsed list) is not counted when the calendar could not be read;
    // one of the workspace's lists is counted per list, below.
    if (t.kind === "saved" || ((t.kind === "visit" || t.id === "lapsed") && !pv)) {
      pools[t.id] = null;
      continue;
    }
    // A proposal's moment is not counted where deals are off -- its run is off, and the card says why (0006) -- nor
    // where who already had a follow-up could not be read.
    if (t.kind === "deal" && (!triggerOffered(t, deals.on) || !followUps)) {
      pools[t.id] = null;
      continue;
    }
    pools[t.id] = count(t.id as PlaybookDto["trigger"], null);
  }
  // Every list a playbook may run on (decision 0009), counted as a run on it would count it: who is on it (membersOf),
  // then the runner's own rules, under its token (`seg:<id>` for People's, `list:<id>` for the workspace's own). A
  // playbook has no one looking, so a list about "me" is never offered; one it can't count here is null, never a zero.
  const listCtx = poolListContext({
    calendar,
    dealsOn: deals.on,
    consultFirst: consultFirstOf(pv?.rules),
    viewer: null,
  });
  const builtins = listsFor(listCtx, []).filter((d) => d.ref.kind === "builtin");
  for (const d of builtins) {
    const m = membersOf(d, vms, listCtx);
    pools[d.token] = m.state === "ok" ? count("saved_list", m.ids) : null;
  }
  let lists: { id: string; name: string; smart: boolean }[] | null = null;
  const people = builtins.map((d) => ({ key: d.ref.id, label: d.label, group: d.group }));
  try {
    const kept = await savedListsFor(ctx.supabase, tenantId);
    lists = kept.map((l) => ({ id: l.id, name: l.name, smart: l.rule != null }));
    for (const l of kept) {
      const def = resolveList({ kind: "saved", id: l.id }, kept);
      const m = def ? membersOf(def, vms, listCtx, kept) : null;
      pools[`list:${l.id}`] = m && m.state === "ok" ? count("saved_list", m.ids) : null;
    }
  } catch (e) {
    console.error(
      "playbook_pools_lists_failed",
      JSON.stringify({ tenant: tenantId, error: e instanceof Error ? e.message : String(e) }),
    );
  }
  return { pools, calendar, lists, people };
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const read = (columns: string) =>
    ctx.supabase.from("playbooks").select(columns).eq("tenant_id", tenantId).order("created_at", { ascending: false });
  const [first, runs] = await Promise.all([read(COLUMNS), listRuns(ctx, tenantId)]);
  // A database 00168 has not reached has no list_key, and one 00155 has not reached no list_id: read again without
  // them, and no playbook runs on a People list (or on any list).
  let { data: rows, error } = first as unknown as {
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  };
  const missing = (col: string) =>
    !!error && new RegExp(col).test(error.message) && /does not exist|could not find/i.test(error.message);
  if (missing("list_key"))
    ({ data: rows, error } = (await read(COLUMNS.replace("list_key, ", ""))) as unknown as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    });
  if (missing("list_id"))
    ({ data: rows, error } = (await read(COLUMNS.replace("list_id, list_key, ", ""))) as unknown as {
      data: Record<string, unknown>[] | null;
      error: { message: string } | null;
    });
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
    list_id: (r.list_id as string | null | undefined) ?? null,
    list_key: (r.list_key as string | null | undefined) ?? null,
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: parseParamSpecs(r.params),
    totals: totals.get(r.id as string) ?? {
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

/**
 * A write of a playbook the database refused, in words where it is the workspace's one proposal follow-up (00167:
 * two would each owe every proposal its nudge, 0006); any other refusal as it came.
 */
export function playbookWriteError(error: { code?: string; message: string }): Error {
  return error.code === "23505" && error.message.includes("playbooks_one_follow_up")
    ? new AppError("conflict", FOLLOW_UP_ONE, 409)
    : new Error(error.message);
}

/** Everything a playbook names, checked the way the send route checks a broadcast: core's checkPlaybook over this workspace's template and link. */
export async function checkPlaybookInput(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown> | null,
): Promise<PlaybookInput> {
  return checkPlaybook(
    {
      ...templateValuePorts(ctx, tenantId),
      // A list of this workspace, read under row security: another workspace's list is no list.
      listName: async (id) => {
        const list = await listRow(ctx.supabase, id);
        return list && list.tenant_id === tenantId ? list.name : null;
      },
      // How its customers buy (0008): a proposal follow-up is made only where deals are on (0006).
      dealsOn: async () => dealsAreOn(await sellsByOf(ctx, tenantId)),
    },
    body,
  );
}
