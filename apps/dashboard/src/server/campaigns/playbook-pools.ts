import "server-only";
import {
  campaignMessagesOf,
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
  ruleNeedsViewer,
  DEFAULT_CAMPAIGN_CHANNELS,
  PLAYBOOK_CAP_CHOICES,
  PLAYBOOK_LIMITS,
  readyOrWhatsApp,
  runReadingOf,
  type ChannelsReady,
  type ConsentChannel,
  type DealPaceVM,
  type PersonRowDto,
  type PlaybookDto,
  type PlaybookTrigger,
  type RunMessage,
  type RunSplit,
} from "@chanlytics/contracts";
import { savedListsFor, templatesFor } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import {
  calendarRead,
  visitsIn,
  type CalendarRead,
  type PeopleVisits,
  type ZoneAndSettings,
} from "@/server/calendar/people-visits";
import { otherChannelSets } from "@/lib/campaign-channels";
import { noFollowUps, poolTouches, proposalFollowUps, type FollowUpsRead } from "@/server/campaigns/playbooks";
import { everyone } from "@/server/people/people";
import { lazily, settled, type Lazy, type Settled } from "@/server/lazy";
import { log } from "@/server/log";

/**
 * The Playbooks page's pools: the number on each moment's chip, counted on the server over everyone with their visits
 * by the runner's own predicate (contracts playbookRunReach), so the number on the chip is the number a run starts
 * from. What they are counted from is read together (poolReads) and counted in one pass (triggerPools). The playbooks
 * themselves, and what their runs earned, are playbooks.ts's: this was its second half until the file passed its
 * length (9 Oct 2026).
 */

/** A cap no workspace reaches: the pool is counted, not capped (here, and by Ask's campaign card). */
export const PLAYBOOK_POOL = 100_000;

interface PoolCounts {
  /** Who a run would pick now. */
  candidates: number;
  /** Who waits only for the week's breath: eligible, but another message reaches them within a week of today, sent or due. */
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
  /**
   * One run's split by channel at each cap a campaign here may take, where it differs from `by_channel` (contracts
   * runReadingOf): what the composer holds the month's allowance against.
   */
  run_split?: RunSplit;
}

/**
 * One moment's count for the channels a playbook on it ticks (reach-for.ts): the figures above are for WhatsApp alone,
 * as every playbook went before, and `by` holds the same count for each other set the workspace could tick for this kind
 * of message (campaign-channels.ts otherChannelSets), so a composer that ticks and unticks reads the one in front of it.
 */
interface TriggerPool extends PoolCounts {
  by?: Array<PoolCounts & { channels: ConsentChannel[] }>;
}

/** What a playbook's count by its own message is judged from: its moment, and the message it names. */
type StrictCandidate = Pick<PlaybookDto, "id" | "trigger" | "template_name" | "template_language">;

/** Every row of the workspace's messages, as the categories are read from them. */
type TemplateRows = Awaited<ReturnType<typeof templatesFor>>;

/** The playbooks on a moment whose class is not marketing: the only ones a message can make stricter. */
const mayBeStricter = <P extends StrictCandidate>(playbooks: readonly P[]): P[] =>
  playbooks.filter((p) => {
    const t = triggerOf(p.trigger);
    return !!t && t.kind !== "reach_out" && enrolPurpose(t.cls, null) === "conversational";
  });

/**
 * The playbooks whose message is stricter than their moment's class (contracts enrolPurpose): an After-the-visit playbook
 * made when that moment was a re-engagement and still sending its offer, or a reminder whose template Meta has since
 * filed as marketing, or a visit reminder that has only an email, written as an offer. A run enrols them by the message's
 * yes, so each is counted by it, under playbookPoolKey, beside its moment's own count. The message's category is the one
 * contracts campaignMessagesOf reads from every row of the workspace (Meta's where it has a WhatsApp version, else the
 * strictest of its own rows'). Only a playbook on a moment whose class is not marketing can be stricter, so the templates
 * are read only when there is one (poolReads, with the pools' other reads); a read that fails leaves each uncounted
 * (null), never counted by a yes its run does not use.
 */
function strictMessagePools(
  tenantId: string,
  playbooks: readonly StrictCandidate[],
  templates: Settled<TemplateRows | null>,
  count: (trigger: PlaybookTrigger, message: RunMessage) => TriggerPool,
): Record<string, TriggerPool | null> {
  const mine = mayBeStricter(playbooks);
  const pools: Record<string, TriggerPool | null> = {};
  if (!mine.length) return pools;
  if (!templates.ok) log.error("playbook_pools_templates_failed", { tenant_id: tenantId, error: templates.error });
  const rows = templates.ok ? templates.value : null;
  const categories = rows
    ? new Map(campaignMessagesOf(rows).map((m) => [`${m.name}/${m.language}`, m.category]))
    : null;
  for (const p of mine) {
    const category = categories?.get(`${p.template_name}/${p.template_language}`);
    // A message that is gone is a run that is off, counted as its moment is; one filed as an offer is counted as one.
    if (categories === null) pools[playbookPoolKey(p.id)] = null;
    else if (category !== undefined && enrolPurpose(triggerOf(p.trigger)?.cls, { category }) === "marketing")
      pools[playbookPoolKey(p.id)] = count(p.trigger, { category });
  }
  return pools;
}

/**
 * What the pools are counted from, each read asked for as this is made and none behind another: everyone in People, the
 * calendar (its lookup and its feed), who had a proposal's follow-up, the templates a stricter message is judged by and
 * the workspace's lists. Each is held with how it settled, and a failure is said where the pools reach it, in the words
 * it always was.
 */
interface PoolReads {
  people: Promise<Settled<PersonRowDto[]>>;
  calendar: Promise<Settled<CalendarRead>>;
  /** None where no deal was ever recorded: no proposal is out. */
  followUps: Promise<Settled<FollowUpsRead>>;
  /** Null where no playbook's message can be stricter than its moment: not read. */
  templates: Promise<Settled<TemplateRows | null>>;
  lists: Promise<Settled<Awaited<ReturnType<typeof savedListsFor>>>>;
}

/**
 * The pools' reads, all asked now. They were asked one behind another, people, then the calendar's settings, its feed,
 * the proposals out and their follow-ups, the templates and the lists, each waiting on the one before though none reads
 * what another answered, and every one of them behind the page's first reads: about ten waits in a row on a page whose
 * every read is a wait (9 Oct 2026, the slowest read Campaigns opens on). The two that do hang on an answer take it as
 * a promise: whether a deal was ever recorded here (no proposal's follow-up is read where none was) and the playbooks
 * (the templates are read only for one whose message may be stricter), so a caller that is still reading those hands
 * them over unread.
 */
export function poolReads(
  ctx: RouteContext,
  tenantId: string,
  now: Date,
  from: {
    people?: Lazy<PersonRowDto[]>;
    known?: ZoneAndSettings;
    hasDeals: boolean | PromiseLike<boolean>;
    playbooks: readonly StrictCandidate[] | PromiseLike<readonly StrictCandidate[]>;
  },
): PoolReads {
  // Each inside an async function, so one that throws as it is asked is a failed read like any other.
  return {
    people: settled((async () => (from.people === undefined ? everyone(ctx, tenantId) : lazily(from.people)))()),
    calendar: settled(calendarRead(ctx, tenantId, now, from.known)),
    followUps: settled((async () => ((await from.hasDeals) ? proposalFollowUps(ctx, tenantId, now) : noFollowUps()))()),
    templates: settled(
      (async () => (mayBeStricter(await from.playbooks).length ? templatesFor(ctx.supabase, tenantId, null) : null))(),
    ),
    lists: settled(savedListsFor(ctx.supabase, tenantId)),
  };
}

/** Everyone's visits off the calendar's read, or null where it failed or could not be indexed: said once, in the log. */
function visitsOrNull(
  tenantId: string,
  read: Settled<CalendarRead>,
  rows: PersonRowDto[],
  now: Date,
): PeopleVisits | null {
  try {
    if (!read.ok) throw read.error;
    return visitsIn(read.value, rows, now);
  } catch (e) {
    log.error("playbook_pools_visits_failed", { tenant_id: tenantId, error: e });
    return null;
  }
}

/** Who had a proposal's follow-up, or null where that could not be read: said once, in the log. */
function followUpsOrNull(tenantId: string, read: Settled<FollowUpsRead>): FollowUpsRead | null {
  if (read.ok) return read.value;
  log.error("playbook_pools_follow_ups_failed", { tenant_id: tenantId, error: read.error });
  return null;
}

type SavedLists = Awaited<ReturnType<typeof savedListsFor>>;

/** A list of the workspace's own, as the Playbooks page is told of it. */
type OwnList = { id: string; name: string; smart: boolean; archived: boolean; viewer?: boolean };

/**
 * The workspace's own lists and each one's pool under "list:<id>", counted by `countOf` (null: a list that cannot be
 * resolved or counted here). Lists that could not be read are null, said in the log; a list that could not be counted
 * is said there too, and the page takes the lists with what was counted before it, as it always did.
 */
function ownListPools(
  tenantId: string,
  read: Settled<SavedLists>,
  countOf: (def: NonNullable<ReturnType<typeof resolveList>>, kept: SavedLists) => TriggerPool | null,
): { lists: OwnList[] | null; pools: Record<string, TriggerPool | null> } {
  const pools: Record<string, TriggerPool | null> = {};
  let lists: OwnList[] | null = null;
  try {
    if (!read.ok) throw read.error;
    const kept = read.value;
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
      pools[`list:${l.id}`] = def ? countOf(def, kept) : null;
    }
  } catch (e) {
    log.error("playbook_pools_lists_failed", { tenant_id: tenantId, error: e });
  }
  return { lists, pools };
}

/** What `triggerPools` is handed beside the turn's own reads: the playbooks, to count the ones a message makes stricter. */
interface PoolsFrom {
  /** Everyone in People (readers/everyone.ts), the audience pool's too: the turn's one read of them. */
  people?: Lazy<PersonRowDto[]>;
  /** The calendar's zone and settings, so the visits' lookup reads neither of them. */
  known?: ZoneAndSettings;
  /**
   * The workspace's playbooks: those whose message is stricter than their moment are counted by it (strictMessagePools),
   * and one run's split is counted at each one's cap too (splitCaps).
   */
  playbooks?: readonly (StrictCandidate & Pick<PlaybookDto, "cap_per_run">)[];
  /**
   * The pools' reads, where the caller asked for them before it had the rest (readers/playbooks.ts, with the page's
   * first reads). Without them they are asked here, together.
   */
  reads?: PoolReads;
  /**
   * Whether the workspace can send on each channel now (channels-ready.ts), which a count is made against. Null where
   * that could not be read: counted as before the channels were, by WhatsApp, which the pages' own number banner judges.
   */
  ready?: ChannelsReady | null;
}

/**
 * What counting a moment is made from: the people with their visits, the week's touches, the pace, what each channel can
 * send on, and the caps one run's split is counted at (splitCaps).
 */
interface PoolCounting {
  vms: Parameters<typeof playbookRunReach>[0];
  breath: Parameters<typeof playbookRunReach>[2];
  nowMs: number;
  pace: Parameters<typeof playbookRunReach>[4];
  ready: ChannelsReady;
  caps: readonly number[];
}

/**
 * The caps one run's split is counted at: every cap the composer offers (contracts PLAYBOOK_CAP_CHOICES) and each
 * campaign's own, within the bounds a cap is held to, so the composer finds the split for any cap it can be set to.
 */
function splitCaps(playbooks: readonly Pick<PlaybookDto, "cap_per_run">[]): number[] {
  const { min, max } = PLAYBOOK_LIMITS.cap_per_run;
  const own = playbooks.map((p) => p.cap_per_run).filter((cap) => Number.isInteger(cap) && cap >= min && cap <= max);
  return [...new Set([...PLAYBOOK_CAP_CHOICES, ...own])];
}

/**
 * How one moment is counted (the runner's own predicate, over everyone): with no message in view, its class's yes alone,
 * or a playbook's own message where that is stricter, for WhatsApp alone as every playbook went, and for each other set of
 * channels a playbook of this kind of message may tick (campaign-channels.ts otherChannelSets), each counted once. One
 * run's split at each cap is read off the same draw (contracts runReadingOf), never counted again.
 */
function poolCounter({ vms, breath, nowMs, pace, ready, caps }: PoolCounting) {
  const countFor = (
    trigger: PlaybookDto["trigger"],
    listIds: ReadonlySet<string> | null,
    message: RunMessage,
    channels: readonly ConsentChannel[],
  ): PoolCounts => {
    const drawn = playbookRunReach(
      vms,
      { trigger, cap_per_run: PLAYBOOK_POOL, gap_days: 0, cadence_days: 0, message, channels, ready },
      breath,
      nowMs,
      pace,
      listIds,
    );
    const { reach, saidYes } = drawn;
    return {
      ...runReadingOf(drawn, trigger, caps),
      held: reach.heardAny,
      pool: reach.pool,
      noYes: reach.noYes,
      stopped: reach.stopped,
      noNumber: reach.noNumber,
      saidYes,
      no_address: reach.no_address ?? 0,
      address_stopped: reach.address_stopped ?? 0,
      no_channel: reach.no_channel ?? 0,
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
  touched: Record<string, readonly string[]>,
  tz: string,
  now: Date,
  /**
   * Whether a deal was ever recorded here, and the workspace's pace (contracts dealPaceOf): a proposal's moment is
   * counted by the pace, as its run is (0006); with no deal on file nobody waits on one, and its follow-ups are not
   * read.
   */
  deals: { any: boolean; pace: Pick<DealPaceVM, "waitDays"> | null },
  /**
   * What the caller already holds this turn, or how to read it from the turn (readers/playbooks.ts): everyone in People
   * and the calendar's zone and settings, which the visits' lookup then reads neither of, or the pools' reads themselves
   * where it asked for them early (poolReads). Without them, each is read here, all at once.
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
  const reads =
    from.reads ??
    poolReads(ctx, tenantId, now, {
      people: from.people,
      known: from.known,
      hasDeals: deals.any,
      playbooks: from.playbooks ?? [],
    });
  const everyoneRead = await reads.people;
  if (!everyoneRead.ok) {
    log.error("playbook_pools_people_failed", { tenant_id: tenantId, error: everyoneRead.error });
    return {
      pools: Object.fromEntries(MOMENT_TRIGGERS.map((t) => [t.id, null])),
      calendar: "none",
      lists: null,
      people: [],
    };
  }
  const rows = everyoneRead.value;
  const pv = visitsOrNull(tenantId, await reads.calendar, rows, now);
  const calendar = pv?.calendar.state ?? "none";
  // The pool's one reading (contracts audience-pool.ts), as a run reads it: no one looking. The visits are marked as
  // consultations by the same rule the edge's runner reads them by.
  const vms = poolRowsOf(
    withVisitsOf(rows, pv?.visits ?? new Map(), pv?.calendar ?? { state: "none", timezone: tz, source: "calendar" }),
    { tz, now, viewer: null, ready: from.ready ?? null },
  );
  // Who already had their proposal's follow-up, from any playbook (proposalFollowUps): no run reaches them again for
  // that proposal (0006), so the moment's count leaves them out as its run does. Read only where a deal was recorded;
  // unreadable, the moment is not counted.
  const followUps = followUpsOrNull(tenantId, await reads.followUps);
  const breath = poolTouches(touched, followUps ?? noFollowUps(), now);
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
    caps: splitCaps(from.playbooks ?? []),
  });
  for (const t of MOMENT_TRIGGERS) {
    // A moment the calendar names (a visit, or the Lapsed list) is not counted when the calendar could not be read;
    // one of the workspace's lists is counted per list, below.
    if (t.kind === "saved" || ((t.kind === "visit" || t.id === "lapsed") && !pv)) {
      pools[t.id] = null;
      continue;
    }
    // A proposal's moment is not counted where who already had a follow-up could not be read.
    if (t.kind === "deal" && !followUps) {
      pools[t.id] = null;
      continue;
    }
    pools[t.id] = count(t.id, null, null);
  }
  Object.assign(
    pools,
    strictMessagePools(tenantId, from.playbooks ?? [], await reads.templates, (t, m) => count(t, null, m)),
  );
  // Every list a playbook may run on (decision 0009), counted as a run on it would count it: who is on it (membersOf),
  // then the runner's own rules, under its token (`seg:<id>` for People's, `list:<id>` for the workspace's own). A
  // playbook has no one looking, so a list about "me" is never offered; one it can't count here is null, never a zero.
  const listCtx = poolListContext({
    calendar,
    hasDeals: deals.any,
    consultFirst: consultFirstOf(pv?.rules),
    viewer: null,
  });
  const builtins = listsFor(listCtx, []).filter((d) => d.ref.kind === "builtin");
  for (const d of builtins) {
    const m = membersOf(d, vms, listCtx);
    pools[d.token] = m.state === "ok" ? count("saved_list", m.ids, null) : null;
  }
  const people = builtins.map((d) => ({ key: d.ref.id, label: d.label, group: d.group }));
  const own = ownListPools(tenantId, await reads.lists, (def, kept) => {
    const m = membersOf(def, vms, listCtx, kept);
    return m.state === "ok" ? count("saved_list", m.ids, null) : null;
  });
  Object.assign(pools, own.pools);
  return { pools, calendar, lists: own.lists, people };
}
