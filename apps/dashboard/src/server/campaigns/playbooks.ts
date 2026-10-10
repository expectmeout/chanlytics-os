import "server-only";
import {
  AppError,
  audienceTrigger,
  campaignMessageOf,
  FOLLOW_UP_ONE,
  parseParamSpecs,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_TOUCH_WINDOW_MS,
  playbookStopBy,
  purposeOfTemplate,
  dealsAreOn,
  isPlaybookTotalsDto,
  ruleNeedsViewer,
  viewerListWords,
  DEFAULT_CAMPAIGN_CHANNELS,
  type BroadcastDto,
  type ConsentChannel,
  type FollowUpFactsDto,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTotalsDto,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { checkPlaybook, checkPlaybookChannels, type PlaybookInput } from "@chanlytics/core";
import {
  followUpTouchesSince,
  listRow,
  messageVersionRowsOf,
  playbookChannels,
  playbookTotals,
  readAllRows,
  touchIndex,
  touchesSince,
  workspacePaused,
  type Touch,
} from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { listRuns } from "@/server/campaigns/broadcasts";
import { calendarOf } from "@/server/calendar/calendar-settings";
import type { ZoneAndSettings } from "@/server/calendar/people-visits";
import { archivedListWords } from "@/server/people/audience";
import { templateValuePorts } from "@/server/ports/campaign-ports";
import { whatsappHealthOf } from "@/server/campaigns/channels-ready";
import { sellsByOf } from "@/server/people/deals";
import { appointmentWordFor } from "@/server/readers/facts";
import { lazily } from "@/server/lazy";

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
  "id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at, channels";

/** One moment playbook's totals as the database counts them (playbook_totals, 00362): the card's shapes are read off it. */
type TotalsRow = PlaybookTotalsDto[string];

/** One run on a card's history: the day it ran for, and what it earned (contracts' shape, the database's answer). */
export type RunSummary = TotalsRow["history"][number];

/** How many runs a card lists; the totals are over every run. */
export const HISTORY_ON_CARD = 10;

export interface PlaybookTotals {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: TotalsRow["last_run"] | null;
  /** The run waiting for a person, with its day and its moment: what the approve verb's refusal reads (runApprovalRefusal). */
  waiting: TotalsRow["waiting"];
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

/** Who had a proposal follow-up, by person, and by what each was about (0029, packages/db touchIndex). */
export interface FollowUpsRead {
  followUps: Map<string, number>;
  followUpKeys: Map<string, Map<string, number>>;
}

/** No follow-up had: no proposal out, or deals off. */
export const noFollowUps = (): FollowUpsRead => ({ followUps: new Map(), followUpKeys: new Map() });

/**
 * Who had a proposal follow-up, or is in a run made for one, from any playbook, one since deleted too (packages/db
 * touchIndex followUps): whom the run leaves out, and so the Playbooks counts and Ask (0006). None out, none. A read
 * that fails throws. By the proposal's link too (0029): a person's second proposal is owed its own.
 */
export async function proposalFollowUps(ctx: RouteContext, tenantId: string, now: Date): Promise<FollowUpsRead> {
  const out = await proposalsOut(ctx, tenantId);
  if (!out) return noFollowUps();
  const { followUps, followUpKeys } = touchIndex(await followUpTouchesFor(ctx, tenantId, now, out));
  return { followUps, followUpKeys };
}

/**
 * Whether the number or Meta's approval stops a follow-up before it draws anyone: the run's own stop (contracts
 * playbookStopBy, the one core's run-playbook asks) over the channels it ticks (null, a database before 00298, is WhatsApp
 * alone), the WhatsApp version's status (null: the message has none) and the number as the send screen reads it. A
 * workspace with no number reads as the edge's run reads it: numberHealth of a number that reported nothing, which cannot
 * be flagged, so it can send (contracts broadcast-number.ts). Who goes by WhatsApp on a workspace with none is
 * channelsReady's, person by person (contracts followUpStandOf), never this stop's. So a follow-up that also goes by email
 * or text is not stopped by Meta not approving its WhatsApp version, or by there being none, as its run is not, and one
 * that does not tick WhatsApp is not stopped by the number at all.
 */
function whatsappStops(
  channels: readonly string[] | null,
  number: Awaited<ReturnType<typeof whatsappHealthOf>>,
  templateStatus: string | null,
): boolean {
  return (
    playbookStopBy({
      channels: channels ?? DEFAULT_CAMPAIGN_CHANNELS,
      templateStatus,
      numberCanSend: number?.canSend ?? true,
    }) !== null
  );
}

/**
 * The proposal follow-up as People and Today read it (0006, contracts FollowUpFactsDto): its playbook's clock,
 * whether its class asks, what its template is for, and, of the people who hold a proposal out, who had theirs, who
 * is in a run on its way or waiting for a person, and whom the week's breath holds. Null wherever the run itself
 * would send nothing before drawing anyone -- none made, paused, its class set to never, the workspace paused by
 * billing, its WhatsApp version not one Meta approved where WhatsApp is all it goes by, its number flagged (contracts
 * playbookStopBy) --
 * and where no proposal is out: every row then says what it said. A class with no row runs as ask, as the run reads
 * it (core run-playbook). A read that fails throws.
 */
export async function followUpFacts(ctx: RouteContext, tenantId: string, now: Date): Promise<FollowUpFactsDto | null> {
  const [pb, cls, paused, number, out] = await Promise.all([
    ctx.supabase
      .from("playbooks")
      .select("id, state, run_hour, last_run_for, template_name, template_language")
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
    workspacePaused(ctx.supabase, tenantId),
    // The number as the send screen reads it (channels-ready.ts): none, or its health.
    whatsappHealthOf(ctx, tenantId),
    proposalsOut(ctx, tenantId),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  if (cls.error) throw new Error(cls.error.message);
  const mode = cls.data?.mode ?? "ask";
  const p = pb.data;
  if (!p || p.state !== "running" || mode === "never" || paused || !out) return null;
  // A moment always has its template (00228's CHECK); only a reach-out's hand step has none.
  if (!p.template_name || !p.template_language) return null;
  // The channels it ticks (step 3; null on a database before 00298, WhatsApp alone): the number and Meta's approval stop
  // only a follow-up that goes by WhatsApp, as the run's own stop does (core run-playbook).
  // Its message, read once from its rows (contracts campaignMessageOf), with or without a WhatsApp version.
  const [channels, rows] = await Promise.all([
    playbookChannels(ctx.supabase, p.id),
    messageVersionRowsOf(ctx.supabase, tenantId, { name: p.template_name, language: p.template_language }),
  ]);
  const message = campaignMessageOf(rows, p.template_name, p.template_language);
  if (whatsappStops(channels, number, message?.versions.whatsapp?.status ?? null)) return null;
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
    purpose: message?.purpose ?? purposeOfTemplate(undefined),
    had,
    queued,
    held,
    heard,
    ...(channels ? { channels } : {}),
  };
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

/** What a playbook that never ran has earned: nothing, and no run to name. */
const noTotals = (): PlaybookTotals => ({
  runs: 0,
  sent: 0,
  delivered: 0,
  replied: 0,
  held: 0,
  lastRun: null,
  waiting: null,
  history: [],
});

/**
 * The workspace's moment playbooks, newest first, without what their runs earned: the rows GET playbooks lists, the pools
 * count by, and Ask's shape names. A reach-out's steps are its own sheet's (Reach out, Part 4), never cards here.
 */
export async function playbookRows(ctx: RouteContext, tenantId: string): Promise<PlaybookDto[]> {
  // The query is returned as it is built, and runs when it is awaited.
  const read = (
    columns: string,
    moments = true,
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> => {
    const q = ctx.supabase.from("playbooks").select(columns).eq("tenant_id", tenantId);
    return (moments ? q.eq("kind", "moment") : q).order("created_at", {
      ascending: false,
    }) as unknown as ReturnType<typeof read>;
  };
  // A database 00168 has not reached has no list_key, and one 00155 has not reached no list_id: read again without
  // them, and no playbook runs on a People list (or on any list).
  let { data: rows, error } = await read(COLUMNS);
  const missing = (col: string) =>
    !!error && new RegExp(col).test(error.message) && /does not exist|could not find/i.test(error.message);
  // A database 00298 has not reached has no channels, and every playbook there goes by WhatsApp: read again without it,
  // and each of the reads below keeps that.
  let columns = COLUMNS;
  if (missing("channels")) {
    columns = columns.replace(", channels", "");
    ({ data: rows, error } = await read(columns));
  }
  // A database 00183 has not reached has no kind, and every playbook there is a moment.
  const moments = !missing("kind");
  if (!moments) ({ data: rows, error } = await read(columns, false));
  if (missing("list_key")) ({ data: rows, error } = await read(columns.replace("list_key, ", ""), moments));
  if (missing("list_id")) ({ data: rows, error } = await read(columns.replace("list_id, list_key, ", ""), moments));
  if (error) throw new Error(error.message);
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state">),
    list_id: (r.list_id as string | null | undefined) ?? null,
    list_key: (r.list_key as string | null | undefined) ?? null,
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: parseParamSpecs(r.params),
  }));
}

/**
 * playbook_totals' answer (00362) in the card's words: storage's `last_run` is the wire's `lastRun` (banked in
 * wire-casing.json, decision 0022), each object written in the order the fold wrote it, so GET playbooks answers the same
 * bytes whichever counted them. The one mapping, behind contracts' isPlaybookTotalsDto, never a cast.
 */
function toPlaybookTotals(dto: PlaybookTotalsDto): Map<string, PlaybookTotals> {
  const out = new Map<string, PlaybookTotals>();
  for (const [id, t] of Object.entries(dto)) {
    out.set(id, {
      runs: t.runs,
      sent: t.sent,
      delivered: t.delivered,
      replied: t.replied,
      held: t.held,
      lastRun: {
        id: t.last_run.id,
        state: t.last_run.state,
        run_for: t.last_run.run_for,
        recipient_count: t.last_run.recipient_count,
      },
      waiting: t.waiting
        ? {
            id: t.waiting.id,
            recipient_count: t.waiting.recipient_count,
            name: t.waiting.name,
            run_for: t.waiting.run_for,
            trigger: t.waiting.trigger,
          }
        : null,
      history: t.history.map((h) => ({
        id: h.id,
        run_for: h.run_for,
        state: h.state,
        scheduled_for: h.scheduled_for,
        recipient_count: h.recipient_count,
        sent: h.sent,
        held: h.held,
        delivered: h.delivered,
        replied: h.replied,
      })),
    });
  }
  return out;
}

/**
 * The fold playbook_totals replaced, kept for one release for a database before 00362: each of `runs` (every run of any
 * playbook, newest first, listRuns) summed into its playbook's totals. Its runs are read unpaged, so past PostgREST's
 * thousand rows it reads short (playbooks/totals/playbook-totals.db.test.mjs shows where); it leaves with listRuns.
 */
function foldTotals(runs: BroadcastDto[]): Map<string, PlaybookTotals> {
  const totals = new Map<string, PlaybookTotals>();
  for (const b of runs) {
    if (!b.playbook_id) continue;
    const t = totals.get(b.playbook_id) ?? noTotals();
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
      t.waiting = {
        id: b.id,
        recipient_count: b.recipient_count,
        name: b.name,
        run_for: b.run_for,
        trigger: audienceTrigger(b.audience),
      };
    totals.set(b.playbook_id, t);
  }
  return totals;
}

/**
 * What each moment playbook's runs earned, by its id (one that never ran is absent): the database's count
 * (playbook_totals, 00362), one call however long its history, or, on a database before it, for one release, the fold
 * over every run it replaced, so either deploy order works.
 */
async function playbookTotalsOf(ctx: RouteContext, tenantId: string): Promise<Map<string, PlaybookTotals>> {
  const read = await playbookTotals(ctx.supabase, tenantId, HISTORY_ON_CARD);
  if (read === "missing") return foldTotals(await listRuns(ctx, tenantId));
  if (!isPlaybookTotalsDto(read)) throw new Error("playbook_totals answered a shape it does not know");
  return toPlaybookTotals(read);
}

/** The moment playbooks with what their runs earned: GET playbooks' rows (playbookRows), each with its totals. */
export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [rows, totals] = await Promise.all([playbookRows(ctx, tenantId), playbookTotalsOf(ctx, tenantId)]);
  return rows.map((r) => ({ ...r, totals: totals.get(r.id) ?? noTotals() }));
}

export type { PlaybookInput };

/**
 * A write of a playbook the database refused, in words where it is the workspace's one proposal follow-up (00167:
 * two would each owe every proposal its nudge, 0006); any other refusal as it came.
 */
/**
 * A playbook on an archived list (00169, decision 0009) is neither resumed nor run now: it stays paused until its list
 * is restored or it is moved to another. Refused in words; nothing when its list is live, or it runs on none of the
 * workspace's own.
 */
export async function refuseOnArchivedList(
  ctx: Pick<RouteContext, "supabase">,
  p: { id: string; trigger: string },
): Promise<void> {
  if (p.trigger !== "saved_list") return;
  const { data: on } = await ctx.supabase.from("playbooks").select("list_id").eq("id", p.id).maybeSingle();
  const listId = (on as { list_id?: string | null } | null)?.list_id ?? null;
  const list = listId ? await listRow(ctx.supabase, listId) : null;
  if (list?.archived_at)
    throw new AppError(
      "validation",
      `Its list, ${list.name}, is archived. Restore it on People, or move the playbook to another list.`,
    );
}

export function playbookWriteError(error: { code?: string; message: string }): Error {
  return error.code === "23505" && error.message.includes("playbooks_one_follow_up")
    ? new AppError("conflict", FOLLOW_UP_ONE, 409)
    : new Error(error.message);
}

/**
 * A playbook's channels alone, checked against the playbook as it stands: core's checkPlaybookChannels over this
 * workspace's rows of its message. `row` is the playbook as the database holds it, never a caller's copy.
 */
export function checkPlaybookChannelsInput(
  ctx: RouteContext,
  tenantId: string,
  row: { trigger: string; policy_class: string | null; template_id: string | null; channels: string[] | null },
  asked: unknown,
): Promise<ConsentChannel[]> {
  return checkPlaybookChannels(templateValuePorts(ctx, tenantId), row, asked);
}

/**
 * Everything a playbook names, checked the way the send route checks a broadcast: core's checkPlaybook over this
 * workspace's template and link. `existing` is the playbook being changed, null for a new one (the check holds only a new
 * playbook to the moments now offered). `known`: the zone and settings a caller holds this turn (Ask's), or how to read
 * them from it, so the calendar's lookup reads neither again (people-visits.ts ZoneAndSettings).
 */
export async function checkPlaybookInput(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown> | null,
  existing: { trigger: string; channels?: string[] | null } | null,
  known?: ZoneAndSettings,
): Promise<PlaybookInput> {
  return checkPlaybook(
    {
      ...templateValuePorts(ctx, tenantId),
      // A list of this workspace, read under row security: another workspace's list is no list.
      listName: async (id) => {
        const list = await listRow(ctx.supabase, id);
        if (!list || list.tenant_id !== tenantId) return null;
        // An archived list is off People's rail (00169): a playbook is put on it again once it is restored.
        if (list.archived_at) throw new AppError("validation", archivedListWords(list.name, "run"));
        // A rule about whoever is looking can't be counted with no one looking: refused in words, never a run that
        // skips every day.
        if (ruleNeedsViewer(list.rule)) throw new AppError("validation", viewerListWords(list.name));
        return list.name;
      },
      // How its customers buy (0008): a proposal follow-up is made only where deals are on (0006).
      dealsOn: async () => dealsAreOn(await sellsByOf(ctx, tenantId)),
      // Whether a calendar is connected: an address in the settings, or one the settings lost (calendarOf), which is the
      // page's calendar state not being "none" (peopleVisits) -- the feed is not fetched for it.
      calendarOn: async () => {
        const c = await calendarOf(ctx, tenantId, known === undefined ? undefined : await lazily(known));
        return !!c.url || c.lostCalendar;
      },
      // What the workspace calls an appointment, worked out where businessShape works it out (readers/facts.ts
      // appointmentWordFor): a refusal's words, and a new campaign's name on an appointment moment. Read only when one
      // of them is said.
      appointmentWord: async () => appointmentWordFor(await sellsByOf(ctx, tenantId)),
    },
    body,
    existing,
  );
}
