import "server-only";
import {
  AppError,
  FOLLOW_UP_ONE,
  parseParamSpecs,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_TOUCH_WINDOW_MS,
  playbookStopBy,
  purposeOfTemplate,
  MOMENT_TRIGGERS,
  consultFirstOf,
  poolListContext,
  poolRowsOf,
  withVisitsOf,
  listsFor,
  membersOf,
  resolveList,
  playbookRunReach,
  playbookPoolKey,
  enrolPurpose,
  messageAboutOfTrigger,
  triggerOf,
  triggerOffered,
  dealsAreOn,
  ruleNeedsViewer,
  viewerListWords,
  DEFAULT_CAMPAIGN_CHANNELS,
  readyOrWhatsApp,
  type ChannelsReady,
  type ConsentChannel,
  type DealPaceVM,
  type FollowUpFactsDto,
  type PersonRowDto,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
  type RunMessage,
} from "@chanlytics/contracts";
import { checkPlaybook, type PlaybookInput } from "@chanlytics/core";
import {
  followUpTouchesSince,
  listRow,
  playbookChannels,
  readAllRows,
  savedListsFor,
  templatesFor,
  touchIndex,
  touchesSince,
  workspacePaused,
  type Touch,
} from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import { listRuns } from "@/server/campaigns/broadcasts";
import { calendarOf } from "@/server/calendar/calendar-settings";
import { peopleVisits, type ZoneAndSettings } from "@/server/calendar/people-visits";
import { otherChannelSets } from "@/lib/campaign-channels";
import { archivedListWords } from "@/server/people/audience";
import { templateValuePorts } from "@/server/ports/campaign-ports";
import { whatsappHealthOf } from "@/server/campaigns/channels-ready";
import { everyone } from "@/server/people/people";
import { sellsByOf } from "@/server/people/deals";
import { lazily, type Lazy } from "@/server/lazy";
import { log } from "@/server/log";

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
 * Whether the number or Meta's approval stops a follow-up before it draws anyone: the run's own stop (contracts
 * playbookStopBy, the one core's run-playbook asks) over the channels it ticks (null, a database before 00298, is WhatsApp
 * alone) and the number as the send screen reads it (none cannot send). So a follow-up that also goes by email or text is
 * not stopped by Meta not approving its WhatsApp template, as its run is not, and one that does not tick WhatsApp is not
 * stopped by the number at all.
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
      numberCanSend: !!number?.canSend,
    }) !== null
  );
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
  const [channels, tpl] = await Promise.all([
    playbookChannels(ctx.supabase, p.id),
    ctx.supabase
      .from("templates")
      .select("meta_status, category")
      .eq("tenant_id", tenantId)
      .eq("channel", "whatsapp")
      .eq("name", p.template_name)
      .eq("language", p.template_language)
      .maybeSingle(),
  ]);
  if (tpl.error) throw new Error(tpl.error.message);
  if (whatsappStops(channels, number, tpl.data?.meta_status ?? null)) return null;
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
    ...(channels ? { channels } : {}),
  };
}

/** A cap no workspace reaches: the pool is counted, not capped. */
export const PLAYBOOK_POOL = 100_000;

interface PoolCounts {
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
  /**
   * No email address, where email was the only channel left; an address on file mail no longer goes to (it bounced, or they
   * marked a message as spam); and no channel the playbook ticks could carry its message.
   */
  no_address: number;
  address_stopped: number;
  no_channel: number;
  /** Who a run reaches on each channel (step 3), adding up to `candidates`. */
  by_channel: Record<ConsentChannel, number>;
}

/**
 * One moment's count for the channels a playbook on it ticks (reach-for.ts): the figures above are for WhatsApp alone,
 * as every playbook went before, and `by` holds the same count for each other set the workspace could tick for this kind
 * of message (campaign-channels.ts otherChannelSets), so a composer that ticks and unticks reads the one in front of it.
 */
export interface TriggerPool extends PoolCounts {
  by?: Array<PoolCounts & { channels: ConsentChannel[] }>;
}

/**
 * The playbooks whose message is stricter than their moment's class (contracts enrolPurpose): an After-the-visit playbook
 * made when that moment was a re-engagement and still sending its offer, or a reminder whose template Meta has since
 * filed as marketing. A run enrols them by the message's yes, so each is counted by it, under playbookPoolKey, beside its
 * moment's own count. Only a playbook on a moment whose class is not marketing can be stricter, so the templates are read
 * only when there is one; a read that fails leaves each uncounted (null), never counted by a yes its run does not use.
 */
async function strictMessagePools(
  ctx: RouteContext,
  tenantId: string,
  playbooks: readonly Pick<PlaybookDto, "id" | "trigger" | "template_name" | "template_language">[],
  count: (trigger: PlaybookTrigger, message: RunMessage) => TriggerPool,
): Promise<Record<string, TriggerPool | null>> {
  const mine = playbooks.filter((p) => {
    const t = triggerOf(p.trigger);
    return !!t && t.kind !== "reach_out" && enrolPurpose(t.cls, null) === "conversational";
  });
  const pools: Record<string, TriggerPool | null> = {};
  if (!mine.length) return pools;
  const categories = await templatesFor(ctx.supabase, tenantId).then(
    (rows) => new Map(rows.map((r) => [`${r.name}/${r.language}`, r.category])),
    (e: unknown) => {
      log.error("playbook_pools_templates_failed", { tenant_id: tenantId, error: e });
      return null;
    },
  );
  for (const p of mine) {
    const category = categories?.get(`${p.template_name}/${p.template_language}`);
    // A template that is gone is a run that is off, counted as its moment is; one filed as an offer is counted as one.
    if (categories === null) pools[playbookPoolKey(p.id)] = null;
    else if (category !== undefined && enrolPurpose(triggerOf(p.trigger)?.cls, { category }) === "marketing")
      pools[playbookPoolKey(p.id)] = count(p.trigger, { category });
  }
  return pools;
}

/** What `triggerPools` is handed beside the turn's own reads: the playbooks, to count the ones a message makes stricter. */
interface PoolsFrom {
  /** Everyone in People (readers/everyone.ts), the audience pool's too, read just where the pools read their own. */
  people?: Lazy<PersonRowDto[]>;
  /** The calendar's zone and settings, so the visits' lookup reads neither of them. */
  known?: ZoneAndSettings;
  /** The workspace's playbooks: those whose message is stricter than their moment are counted by it (strictMessagePools). */
  playbooks?: readonly Pick<PlaybookDto, "id" | "trigger" | "template_name" | "template_language">[];
  /**
   * Whether the workspace can send on each channel now (channels-ready.ts), which a count is made against. Null where
   * that could not be read: counted as before the channels were, by WhatsApp, which the pages' own number banner judges.
   */
  ready?: ChannelsReady | null;
}

/** What counting a moment is made from: the people with their visits, the week's touches, the pace, and what each channel can send on. */
interface PoolCounting {
  vms: Parameters<typeof playbookRunReach>[0];
  breath: Parameters<typeof playbookRunReach>[2];
  nowMs: number;
  pace: Parameters<typeof playbookRunReach>[4];
  ready: ChannelsReady;
}

/**
 * How one moment is counted (the runner's own predicate, over everyone): with no message in view, its class's yes alone,
 * or a playbook's own message where that is stricter, for WhatsApp alone as every playbook went, and for each other set of
 * channels a playbook of this kind of message may tick (campaign-channels.ts otherChannelSets), each counted once.
 */
function poolCounter({ vms, breath, nowMs, pace, ready }: PoolCounting) {
  const countFor = (
    trigger: PlaybookDto["trigger"],
    listIds: ReadonlySet<string> | null,
    message: RunMessage,
    channels: readonly ConsentChannel[],
  ): PoolCounts => {
    const { reach, saidYes } = playbookRunReach(
      vms,
      { trigger, cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0, message, channels, ready },
      breath,
      nowMs,
      pace,
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
      no_address: reach.no_address ?? 0,
      address_stopped: reach.address_stopped ?? 0,
      no_channel: reach.no_channel ?? 0,
      by_channel: reach.by_channel ?? { whatsapp: 0, sms: 0, email: 0 },
    };
  };
  return (trigger: PlaybookDto["trigger"], listIds: ReadonlySet<string> | null, message: RunMessage): TriggerPool => {
    const base = countFor(trigger, listIds, message, DEFAULT_CAMPAIGN_CHANNELS);
    const purpose = enrolPurpose(triggerOf(trigger)?.cls, message);
    // The moment's message is about their visit or proposal, or the business's own news, which by email waits for the
    // workspace's offers as an offer does (contracts isOfferByEmail, decision D2): the sets a composer may tick follow it.
    const by = otherChannelSets(ready, purpose, messageAboutOfTrigger(trigger)).map((channels) => ({
      channels,
      ...countFor(trigger, listIds, message, channels),
    }));
    return by.length > 0 ? { ...base, by } : base;
  };
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
  /**
   * What the caller already holds this turn, or how to read it from the turn (readers/playbooks.ts): everyone in People
   * and the calendar's zone and settings, which the visits' lookup then reads neither of. Without them, each is read here.
   */
  from: PoolsFrom = {},
): Promise<{
  pools: Record<string, TriggerPool | null>;
  calendar: "ok" | "unavailable" | "none";
  /**
   * The workspace's own lists, each counted under "list:<id>"; null when they could not be read. An archived one
   * (00169) is here for the playbooks that still name it, and offered to no new one.
   */
  lists: { id: string; name: string; smart: boolean; archived: boolean; viewer?: boolean }[] | null;
  /** People's lists a playbook may run on here (none that is about whoever is looking), each counted under "seg:<id>". */
  people: { key: string; label: string; group: string }[];
}> {
  // The pools are a reading, never the page: a read that fails leaves the
  // playbooks themselves untouched. A moment it could not count is null, never
  // a zero: the page drew empty pools as "0 of 0" and "nobody to send to", and
  // offered the QR for a yes nobody knew was missing.
  let rows: PersonRowDto[];
  try {
    rows = await (from.people === undefined ? everyone(ctx, tenantId) : lazily(from.people));
  } catch (e) {
    log.error("playbook_pools_people_failed", { tenant_id: tenantId, error: e });
    return {
      pools: Object.fromEntries(MOMENT_TRIGGERS.map((t) => [t.id, null])),
      calendar: "none",
      lists: null,
      people: [],
    };
  }
  const pv = await peopleVisits(ctx, tenantId, rows, now, from.known).catch((e: unknown) => {
    log.error("playbook_pools_visits_failed", { tenant_id: tenantId, error: e });
    return null;
  });
  const calendar = pv?.calendar.state ?? "none";
  // The pool's one reading (contracts audience-pool.ts), as a run reads it: no one looking, and no deal where deals
  // are off. The visits are marked as consultations by the same rule the edge's runner reads them by.
  const vms = poolRowsOf(
    withVisitsOf(rows, pv?.visits ?? new Map(), pv?.calendar ?? { state: "none", timezone: tz, source: "calendar" }),
    { tz, now, viewer: null, dealsOn: deals.on, ready: from.ready ?? null },
  );
  // Who already had their proposal's follow-up, from any playbook (proposalFollowUps): no run reaches them again for
  // that proposal (0006), so the moment's count leaves them out as its run does. Read only where deals are on;
  // unreadable, the moment is not counted.
  const followUps = deals.on
    ? await proposalFollowUps(ctx, tenantId, now).catch((e: unknown) => {
        log.error("playbook_pools_follow_ups_failed", { tenant_id: tenantId, error: e });
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
  const count = poolCounter({
    vms,
    breath,
    nowMs: now.getTime(),
    pace: deals.pace,
    ready: readyOrWhatsApp(from.ready),
  });
  for (const t of MOMENT_TRIGGERS) {
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
    pools[t.id] = count(t.id, null, null);
  }
  Object.assign(pools, await strictMessagePools(ctx, tenantId, from.playbooks ?? [], (t, m) => count(t, null, m)));
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
    pools[d.token] = m.state === "ok" ? count("saved_list", m.ids, null) : null;
  }
  let lists: { id: string; name: string; smart: boolean; archived: boolean; viewer?: boolean }[] | null = null;
  const people = builtins.map((d) => ({ key: d.ref.id, label: d.label, group: d.group }));
  try {
    const kept = await savedListsFor(ctx.supabase, tenantId);
    lists = kept.map((l) => ({
      id: l.id,
      name: l.name,
      smart: l.rule != null,
      archived: !!l.archived_at,
      // About whoever is looking: counted for no playbook, and offered to none.
      viewer: ruleNeedsViewer(l.rule),
    }));
    for (const l of kept) {
      const def = resolveList({ kind: "saved", id: l.id }, kept);
      const m = def ? membersOf(def, vms, listCtx, kept) : null;
      pools[`list:${l.id}`] = m && m.state === "ok" ? count("saved_list", m.ids, null) : null;
    }
  } catch (e) {
    log.error("playbook_pools_lists_failed", { tenant_id: tenantId, error: e });
  }
  return { pools, calendar, lists, people };
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  // The moments. A reach-out's steps are its own sheet's (Reach out, Part 4), never cards here.
  // The query is returned as it is built, and runs when it is awaited, so the runs' read starts first, as it did.
  const read = (
    columns: string,
    moments = true,
  ): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> => {
    const q = ctx.supabase.from("playbooks").select(columns).eq("tenant_id", tenantId);
    return (moments ? q.eq("kind", "moment") : q).order("created_at", {
      ascending: false,
    }) as unknown as ReturnType<typeof read>;
  };
  const [first, runs] = await Promise.all([read(COLUMNS), listRuns(ctx, tenantId)]);
  // A database 00168 has not reached has no list_key, and one 00155 has not reached no list_id: read again without
  // them, and no playbook runs on a People list (or on any list).
  let { data: rows, error } = first;
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
    },
    body,
    existing,
  );
}
