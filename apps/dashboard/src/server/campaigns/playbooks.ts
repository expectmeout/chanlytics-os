import "server-only";
import {
  AppError,
  audienceTrigger,
  batchModeOf,
  breathTouchOf,
  campaignMessageOf,
  campaignRunsOn,
  FOLLOW_UP_ONE,
  parseParamSpecs,
  PLAYBOOK_TOUCH_WINDOW_MS,
  playbookStopBy,
  purposeOfTemplate,
  ruleNeedsViewer,
  viewerListWords,
  DEFAULT_CAMPAIGN_CHANNELS,
  type BroadcastDto,
  type ConsentChannel,
  type FollowUpFactsDto,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
  type Touches,
} from "@chanlytics/contracts";
import { isPlaybookTotalsDto, type PlaybookTotalsDto } from "./lifecycle/totals";
import {
  checkPlaybook,
  checkPlaybookChannels,
  checkPlaybookMoment,
  type CheckPlaybookPatchPorts,
  type CheckPlaybookPorts,
  type PlaybookInput,
} from "@chanlytics/core";
import {
  followUpTouchesSince,
  listMessageVersionRows,
  listPlaybookChannels,
  getRecentTouches,
  getSequenceModes,
  touchIndex,
  isWorkspacePaused,
  type Touch,
} from "@chanlytics/db/campaigns";
import { listRow } from "@chanlytics/db/people";
import { getPlaybookTotals } from "@chanlytics/db/reports";
import { readAllRows, saysMissing } from "@chanlytics/db/shared";
import type { RouteContext } from "@/server/shared/with-route";
import { listRuns } from "@/server/campaigns/broadcasts/broadcasts";
import { findCalendar } from "@/server/calendar/settings";
import type { ZoneAndSettings } from "@/server/calendar/people-visits";
import { archivedListWords } from "@/server/campaigns/audience";
import { templateValuePorts } from "@/server/campaigns/ports";
import { findWhatsappHealth } from "@/server/campaigns/channels-ready";
import { getAppointmentWord } from "@/server/people/deals";
import { loadLazily } from "@/server/shared/lazy";
import { getTenantFacts } from "@/server/shared/tenant";

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
  "id, sequence_id, name, trigger, list_id, list_key, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at, channels, until, words_ok_at";

/** One moment playbook's totals as the database counts them (playbook_totals, 00374): the card's shapes are read off it. */
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

/** No follow-up had: no proposal out. */
export const noFollowUps = (): FollowUpsRead => ({ followUps: new Map(), followUpKeys: new Map() });

/**
 * The touches a moment is counted against before a campaign on it has run (contracts playbookRunReach): nobody heard from
 * that campaign yet, who any campaign reaches within a week of `now`, either side (`touched`, db getRecentTouches, by
 * contracts breathTouchOf: the week's breath, as the sweep's touchIndex reads it), and who had a proposal's follow-up.
 * The page's pools (playbook-pools.ts triggerPools) and Ask's campaign card count by it, so the card's count is the page's.
 */
export function poolTouches(
  touched: Readonly<Record<string, readonly string[]>>,
  followUps: FollowUpsRead,
  now: Date,
): Touches {
  const byAny = new Map<string, number>();
  for (const [id, times] of Object.entries(touched)) {
    const at = breathTouchOf(times, now.getTime(), now.getTime());
    if (at !== null) byAny.set(id, at);
  }
  return { byThis: new Map(), byAny, ...followUps };
}

/**
 * Who had a proposal follow-up, or is in a run made for one, from any playbook, one since deleted too (packages/db
 * touchIndex followUps): whom the run leaves out, and so the Playbooks counts and Ask (0006). None out, none. A read
 * that fails throws. By the proposal's link too (0029): a person's second proposal is owed its own.
 */
export async function getProposalFollowUps(ctx: RouteContext, tenantId: string, now: Date): Promise<FollowUpsRead> {
  const out = await proposalsOut(ctx, tenantId);
  if (!out) return noFollowUps();
  const { followUps, followUpKeys } = touchIndex(await followUpTouchesFor(ctx, tenantId, now, out), now);
  return { followUps, followUpKeys };
}

/**
 * Whether the number or Meta's approval stops a follow-up before it draws anyone: the run's own stop (contracts
 * playbookStopBy, the one core's run-playbook asks) over the channels it ticks (null, a database before 00298, is WhatsApp
 * alone), the WhatsApp version's status (null: the message has none) and the number as the send screen reads it. A
 * workspace with no number reads as the edge's run reads it: numberHealth of a number that reported nothing, which cannot
 * be flagged, so it can send (contracts broadcasts/number.ts). Who goes by WhatsApp on a workspace with none is
 * channelsReady's, person by person (contracts followUpStandOf), never this stop's. So a follow-up that also goes by email
 * or text is not stopped by Meta not approving its WhatsApp version, or by there being none, as its run is not, and one
 * that does not tick WhatsApp is not stopped by the number at all.
 */
function whatsappStops(
  channels: readonly string[] | null,
  number: Awaited<ReturnType<typeof findWhatsappHealth>>,
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
 * The proposal follow-up as People and Today read it (0006, contracts FollowUpFactsDto): its playbook's clock, what
 * its template is for, and, of the people who hold a proposal out, who had theirs, who is in a run on its way or waiting
 * for a person, and whom the week's breath holds. Null wherever the run itself would send nothing before drawing anyone
 * -- none made, paused, the workspace paused by billing, its WhatsApp version not one Meta approved where WhatsApp is all
 * it goes by, its number flagged (contracts playbookStopBy) -- and where no proposal is out: every row then says what it
 * said. And past its last day (00416 `until`, by the business's day in `tz`), which the run refuses: the one
 * rule every page asks of a campaign (contracts campaignRunsOn; the wiring's second audit, S1-3). A read that fails throws.
 */
export async function followUpFacts(
  ctx: RouteContext,
  tenantId: string,
  now: Date,
  tz: string,
): Promise<FollowUpFactsDto | null> {
  const [pb, paused, number, out] = await Promise.all([
    ctx.supabase
      .from("sequence_steps")
      .select("id, sequence_id, state, run_hour, last_run_for, until, template_name, template_language, words_ok_at")
      .eq("tenant_id", tenantId)
      .eq("trigger", "proposal_waiting")
      .maybeSingle(),
    isWorkspacePaused(ctx.supabase, tenantId),
    // The number as the send screen reads it (channels-ready.ts): none, or its health.
    findWhatsappHealth(ctx, tenantId),
    proposalsOut(ctx, tenantId),
  ]);
  if (pb.error) throw new Error(pb.error.message);
  const data = pb.data;
  // It is the proposal follow-up, read where a deal is on file (readers/people.ts).
  const runs = !!data && campaignRunsOn({ ...data, trigger: "proposal_waiting" }, { tz, now });
  if (!data || !runs || paused || !out) return null;
  // A moment always has its template (00228's CHECK); only a reach-out's hand step has none.
  if (!data.template_name || !data.template_language) return null;
  // The channels it ticks (step 3; null on a database before 00298, WhatsApp alone): the number and Meta's approval stop
  // only a follow-up that goes by WhatsApp, as the run's own stop does (core run-playbook).
  // Its message, read once from its rows (contracts campaignMessageOf), with or without a WhatsApp version.
  const [channels, rows, modes] = await Promise.all([
    listPlaybookChannels(ctx.supabase, data.id),
    listMessageVersionRows(ctx.supabase, tenantId, { name: data.template_name, language: data.template_language }),
    getSequenceModes(ctx.supabase, tenantId, [data.sequence_id]),
  ]);
  // Whether its next batch waits for an OK (contracts batchModeOf: its sequence's mode, or ask while its words are new).
  const mode = batchModeOf({ mode: modes.get(data.sequence_id), words_ok_at: data.words_ok_at });
  const message = campaignMessageOf(rows, data.template_name, data.template_language);
  if (whatsappStops(channels, number, message?.versions.whatsapp?.status ?? null)) return null;
  // Who heard, or is due a message, is the breath's one read (packages/db getRecentTouches), as every other page and the
  // send read it.
  const [followUps, recent] = await Promise.all([
    followUpTouchesFor(ctx, tenantId, now, out),
    getRecentTouches(ctx.supabase, tenantId, now),
  ]);
  const had: Record<string, string> = {};
  const queued: Record<string, string> = {};
  const held: Record<string, string> = {};
  const heard: Record<string, string[]> = {};
  const latest = (m: Record<string, string>, t: Touch) => {
    if (!m[t.contact_id] || Date.parse(t.at) > Date.parse(m[t.contact_id])) m[t.contact_id] = t.at;
  };
  // Only who holds a proposal out: the rows the facts are for.
  for (const t of followUps) if (out.contacts.has(t.contact_id)) latest(t.sent ? had : t.held ? held : queued, t);
  // Every message of theirs, sent or due, from the breath's read: the stand walks the run's ticks to the first none falls
  // within a week of (contracts followUpStandOf), so its day is the day the sweep would next send them.
  for (const [id, times] of Object.entries(recent)) if (out.contacts.has(id)) heard[id] = times;
  return {
    run_hour: data.run_hour,
    last_run_for: data.last_run_for,
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
export async function listPlaybookRows(ctx: RouteContext, tenantId: string): Promise<PlaybookDto[]> {
  // The query is returned as it is built, and runs when it is awaited.
  const read = (
    columns: string,
    moments = true,
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> => {
    const q = ctx.supabase.from("sequence_steps").select(columns).eq("tenant_id", tenantId);
    return (moments ? q.eq("kind", "moment") : q).order("created_at", {
      ascending: false,
    }) as unknown as ReturnType<typeof read>;
  };
  // A database 00168 has not reached has no list_key, and one 00155 has not reached no list_id: read again without
  // them, and no playbook runs on a People list (or on any list).
  let { data: rows, error } = await read(COLUMNS);
  const missing = (col: string) => !!error && new RegExp(col).test(error.message) && saysMissing(error.message);
  let columns = COLUMNS;
  // A database 00298 has not reached has no channels, and every playbook there goes by WhatsApp: read again without it,
  // and each of the reads below keeps that.
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
  // Each step's sequence's mode (decision 0064): what its batches do, which the run, Resume and Ask say by.
  const modes = await getSequenceModes(
    ctx.supabase,
    tenantId,
    (rows ?? []).map((r) => String(r.sequence_id)),
  );
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state" | "mode">),
    mode: modes.get(String(r.sequence_id)) ?? "ask",
    list_id: (r.list_id as string | null | undefined) ?? null,
    list_key: (r.list_key as string | null | undefined) ?? null,
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: parseParamSpecs(r.params),
  }));
}

/**
 * playbook_totals' answer (00374) in the card's words: storage's `last_run` is the wire's `lastRun` (banked in
 * the wire-casing measure, decision 0022), each object written in the order the fold wrote it, so GET playbooks answers the same
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
      history: t.history.map((item) => ({
        id: item.id,
        run_for: item.run_for,
        state: item.state,
        scheduled_for: item.scheduled_for,
        recipient_count: item.recipient_count,
        sent: item.sent,
        held: item.held,
        delivered: item.delivered,
        replied: item.replied,
      })),
    });
  }
  return out;
}

/**
 * The fold playbook_totals replaced, kept for one release for a database before 00374: each of `runs` (every run of any
 * playbook, newest first, listRuns) summed into its playbook's totals. Its runs are read unpaged, so past PostgREST's
 * thousand rows it reads short (playbooks/totals/playbook-totals.db.test.mjs shows where); it leaves with listRuns.
 */
function foldTotals(runs: BroadcastDto[]): Map<string, PlaybookTotals> {
  const totals = new Map<string, PlaybookTotals>();
  for (const run of runs) {
    if (!run.playbook_id) continue;
    const total = totals.get(run.playbook_id) ?? noTotals();
    total.runs += 1;
    total.sent += run.counts.sent;
    total.delivered += run.counts.delivered;
    total.replied += run.counts.replied;
    total.held += run.counts.skipped + run.counts.failed;
    if (total.history.length < HISTORY_ON_CARD) {
      total.history.push({
        id: run.id,
        run_for: run.run_for,
        state: run.state,
        scheduled_for: run.scheduled_for,
        recipient_count: run.recipient_count,
        sent: run.counts.sent,
        held: run.counts.skipped + run.counts.failed,
        delivered: run.counts.delivered,
        replied: run.counts.replied,
      });
    }
    if (!total.lastRun)
      total.lastRun = { id: run.id, state: run.state, run_for: run.run_for, recipient_count: run.recipient_count };
    if (run.state === "pending_approval" && !total.waiting)
      total.waiting = {
        id: run.id,
        recipient_count: run.recipient_count,
        name: run.name,
        run_for: run.run_for,
        trigger: audienceTrigger(run.audience),
      };
    totals.set(run.playbook_id, total);
  }
  return totals;
}

/**
 * What each moment playbook's runs earned, by its id (one that never ran is absent): the database's count
 * (playbook_totals, 00374), one call however long its history, or, on a database before it, for one release, the fold
 * over every run it replaced, so either deploy order works.
 */
async function playbookTotalsOf(ctx: RouteContext, tenantId: string): Promise<Map<string, PlaybookTotals>> {
  const read = await getPlaybookTotals(ctx.supabase, tenantId, HISTORY_ON_CARD);
  if (read === "missing") return foldTotals(await listRuns(ctx, tenantId));
  if (!isPlaybookTotalsDto(read)) throw new Error("playbook_totals answered a shape it does not know");
  return toPlaybookTotals(read);
}

/** The moment playbooks with what their runs earned: GET playbooks' rows (listPlaybookRows), each with its totals. */
export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [rows, totals] = await Promise.all([listPlaybookRows(ctx, tenantId), playbookTotalsOf(ctx, tenantId)]);
  return rows.map((r) => ({ ...r, totals: totals.get(r.id) ?? noTotals() }));
}

export type { PlaybookInput };

/**
 * Why a playbook on an archived list (00169, decision 0009) stays paused, in words, or null when its list is live or it
 * runs on none of the workspace's own: what a resume (core checkPlaybookPatch's port) and a run now ask. It is neither
 * resumed nor run until its list is restored or it is moved to another.
 */
async function archivedListRefusal(
  ctx: Pick<RouteContext, "supabase">,
  params: { id: string; trigger: string },
): Promise<string | null> {
  if (params.trigger !== "saved_list") return null;
  const { data: on, error } = await ctx.supabase
    .from("sequence_steps")
    .select("list_id")
    .eq("id", params.id)
    .maybeSingle();
  // A campaign whose list cannot be read is not one whose list stands: it would resume onto an archived list.
  if (error) throw new Error(`cannot read the campaign's list: ${error.message}`);
  const listId = (on as { list_id?: string | null } | null)?.list_id ?? null;
  const list = listId ? await listRow(ctx.supabase, listId) : null;
  return list?.archived_at
    ? `Its list, ${list.name}, is archived. Restore it on People, or move the campaign to another list.`
    : null;
}

/** The same, refused: a run now of such a playbook is not made (app/api/v1/playbooks/[id]/run). */
export async function refuseOnArchivedList(
  ctx: Pick<RouteContext, "supabase">,
  params: { id: string; trigger: string },
): Promise<void> {
  const words = await archivedListRefusal(ctx, params);
  if (words) throw new AppError("validation", words);
}

/**
 * What a change in place reads of this workspace (core checkPlaybookPatch), for PUT playbooks/:id and Ask's change card
 * alike: why its list keeps it paused (archivedListRefusal), its message and links for a change of its words (the ports a
 * new playbook's values are read through), and the business's zone for a change of its end. Each is read only when a
 * change asks it.
 */
export function playbookPatchPorts(ctx: RouteContext, tenantId: string): CheckPlaybookPatchPorts {
  return {
    ...templateValuePorts(ctx, tenantId),
    archivedList: (r) => archivedListRefusal(ctx, r),
    timezone: async () => (await getTenantFacts(ctx.supabase, tenantId)).timezone,
  };
}

/**
 * A write of a playbook the database refused, in words where it is the workspace's one proposal follow-up (00167,
 * sequence_steps_one_follow_up since 00440: two would each owe every proposal its nudge, 0006); any other refusal as it came.
 */
export function playbookWriteError(error: { code?: string; message: string }): Error {
  return error.code === "23505" && error.message.includes("sequence_steps_one_follow_up")
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
  value: unknown,
): Promise<ConsentChannel[]> {
  return checkPlaybookChannels(templateValuePorts(ctx, tenantId), row, value);
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
  return checkPlaybook(playbookCheckPorts(ctx, tenantId, known), body, existing);
}

/**
 * A new playbook's moment, its list and its class, judged as checkPlaybookInput judges them (core checkPlaybookMoment,
 * over the same ports): what a starter card is held to before its starter is filed (starter-templates.ts
 * checkStarterPlaybook), so a refusal comes before anything reaches Meta.
 */
export async function checkPlaybookMomentInput(
  ctx: RouteContext,
  tenantId: string,
  body: Record<string, unknown> | null,
  known?: ZoneAndSettings,
) {
  return checkPlaybookMoment(playbookCheckPorts(ctx, tenantId, known), body, null);
}

/** What a playbook's check reads of this workspace, beyond its message's: its lists, its deals, its calendar, its word. */
function playbookCheckPorts(ctx: RouteContext, tenantId: string, known?: ZoneAndSettings): CheckPlaybookPorts {
  return {
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
    // Whether a calendar is connected: an address in the settings, or one the settings lost (findCalendar), which is the
    // page's calendar state not being "none" (peopleVisits) -- the feed is not fetched for it.
    calendarOn: async () => {
      const c = await findCalendar(ctx, tenantId, known === undefined ? undefined : await loadLazily(known));
      return !!c.url || c.lostCalendar;
    },
    // What the workspace calls an appointment, read where businessShape reads it (people/deals.ts getAppointmentWord):
    // a refusal's words, and a new campaign's name on an appointment moment. Read only when one of them is said.
    appointmentWord: () => getAppointmentWord(ctx, tenantId),
  };
}
