/**
 * The Playbooks override: each playbook's card, its words and its totals, and
 * the triggers a new one can start from. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import { read } from "@/legacy-bridge/api";
import {
  DEFAULT_CAMPAIGN_CHANNELS,
  PEOPLE_LISTS,
  REPLY_WINDOW_WORDS,
  numberHealth,
  type ChannelsReady,
  type ConsentChannel,
  type MonthSent,
  type NumberHealth,
  FOLLOW_UP_NEEDS_DEALS,
  PLAYBOOK_TRIGGERS,
  appointmentWordOf,
  momentOffered,
  nextRunLabel,
  playbookPoolKey,
  scheduleLine,
  triggerOf,
  triggerOffered,
  triggerWords,
  type LifecycleShape,
  type PlaybookDto,
} from "@chanlytics/contracts";
import type { Output } from "@/client/api";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { DEFAULT_REFRESH_TABLES } from "@/legacy-bridge/surface-realtime";
import { onlyOnItsPage } from "@/legacy-bridge/surface-registry";
import { sameChannels } from "@/lib/campaign-channels";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";
import { cmAddressOf, cmOfferedMessages, type CmOffered } from "../parts/channels";

// The frame (its tab counts and the route table's crumbs) and Today read this under its old name until they move.
declareSurfaceValue("playbooks", "__PLAYBOOKS");

/* ------------------------------- Playbooks ------------------------------- */

export interface PlaybookTotalsVM {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  /**
   * A run waiting for a person: the broadcast to approve or skip, with the day it was made for and the moment it kept
   * (what says whether an approval now would be refused, bcLateWords). A read from before the list carried them has none.
   */
  waiting: {
    id: string;
    recipient_count: number;
    name: string;
    run_for?: string | null;
    trigger?: string | null;
  } | null;
  /** The most recent runs, newest first; the totals above are over every run. */
  history: {
    id: string;
    run_for: string | null;
    state: string;
    scheduled_for: string;
    recipient_count: number;
    sent: number;
    held: number;
    delivered: number;
    replied: number;
  }[];
}

export interface PlaybookCardVM extends PlaybookDto {
  /** The key of the count this playbook's reach is read from (`pools`): its moment's, its list's, or its own where its message is stricter. */
  poolKey: string;
  totals: PlaybookTotalsVM;
  /** The trigger's words: "Win-back", "Nothing heard in 30 days". */
  triggerLabel: string;
  triggerHint: string;
  /** "Daily 10:00 AM · up to 25 · once per person, again after 90 days". */
  schedule: string;
  /** "today 10:00 AM", "tomorrow 10:00 AM" or "paused", by the business's clock. */
  next: string;
  /** How many on the trigger's list a run reaches right now -- a recorded yes and
   *  a number to send to -- clear of the week's breath, before the gap, which
   *  only the run applies; a follow-up's, clear of the proposals already
   *  followed up. Null when the server could not count the moment. */
  candidates: number | null;
  /** How many more it would reach but heard from a broadcast of any kind this week, and wait. Null with `candidates`. */
  held: number | null;
  /** Everyone its moment names, and who of them no run reaches whatever the week: the card's grey. Null when not read. */
  named: PlaybookNamed | null;
  /** Why it runs nothing here, where its moment is not offered (a proposal follow-up where deals are off, 0006). */
  off: string | null;
  /** Its list was archived (00169): paused until the list is restored or the playbook moved to another. */
  listArchived?: boolean;
}

/**
 * Everyone a moment names -- the trigger's list, everyone, or the day's visits --
 * and who of them no run reaches whatever the week: never said yes to what the
 * playbook sends, asked to stop, no number. Counted on the server with the
 * runner's own rules (contracts playbookRunReach), beside `candidates` and `held`.
 */
export interface PlaybookNamed {
  pool: number;
  noYes: number;
  stopped: number;
  noNumber: number;
  /** How many of them said the yes the playbook needs, a number or not: a yes with no number is not no yes. */
  saidYes: number;
  /**
   * No email address, where email was the only channel left; an address on file mail no longer goes to; no channel the
   * playbook ticks could carry its message (step 3).
   */
  noAddress?: number;
  addressStopped?: number;
  noChannel?: number;
  /** Who a run reaches on each channel, adding up to who it reaches now. Absent from a count made before channels. */
  byChannel?: Record<ConsentChannel, number>;
}

/**
 * One moment's count as the route makes it (server/campaigns/playbook-pools.ts TriggerPool): the figures for WhatsApp alone,
 * as every playbook went before, and, beside them, the same figures for each other set of channels a playbook on it may
 * tick, so the composer reads the count for the set in front of it as the owner ticks and unticks.
 */
export interface PoolRead {
  candidates: number;
  held: number;
  pool: number;
  noYes: number;
  stopped: number;
  noNumber: number;
  saidYes: number;
  no_address?: number;
  address_stopped?: number;
  no_channel?: number;
  by_channel?: Record<ConsentChannel, number>;
  by?: Array<Omit<PoolRead, "by"> & { channels: readonly string[] }>;
}

/** What a count says of who it names and who it leaves out: null where the moment could not be counted. */
export function namedOf(x: Omit<PoolRead, "by"> | null | undefined): PlaybookNamed | null {
  return x && typeof x.pool === "number"
    ? {
        pool: x.pool,
        noYes: x.noYes ?? 0,
        stopped: x.stopped ?? 0,
        noNumber: x.noNumber ?? 0,
        saidYes: x.saidYes ?? 0,
        ...(x.no_address === undefined ? {} : { noAddress: x.no_address }),
        ...(x.address_stopped === undefined ? {} : { addressStopped: x.address_stopped }),
        ...(x.no_channel === undefined ? {} : { noChannel: x.no_channel }),
        ...(x.by_channel ? { byChannel: x.by_channel } : {}),
      }
    : null;
}

/**
 * A count for the channels a playbook goes by: the figures for WhatsApp alone where it ticks that, the widest set the
 * count kept that lies within what it ticks, and, where none can carry it (a channel it ticks is not open to its
 * message), everyone the moment names left out with no channel to go by. Null where the moment was not counted.
 */
export function readingFor(
  pool: PoolRead | null | undefined,
  channels: readonly string[] | null | undefined,
): Omit<PoolRead, "by"> | null {
  if (!pool) return null;
  // None named is a playbook made before channels: WhatsApp alone. An empty set is none: no channel can carry it.
  const want = channels ?? DEFAULT_CAMPAIGN_CHANNELS;
  if (sameChannels(want, DEFAULT_CAMPAIGN_CHANNELS)) return pool;
  const within = (pool.by ?? []).filter((b) => b.channels.every((c) => want.includes(c)));
  const widest = within.sort((a, b) => b.channels.length - a.channels.length)[0];
  if (widest) return widest;
  if (want.includes("whatsapp")) return pool;
  return {
    candidates: 0,
    held: 0,
    pool: pool.pool,
    noYes: 0,
    stopped: 0,
    noNumber: 0,
    saidYes: 0,
    no_address: 0,
    address_stopped: 0,
    no_channel: pool.pool,
    by_channel: { whatsapp: 0, sms: 0, email: 0 },
  };
}

export interface PlaybookTriggerOption {
  id: string;
  label: string;
  hint: string;
  cls: string;
  list: string | null;
  /** list, cadence, visit, saved or deal — a visit trigger needs the calendar and has no gap; a deal's, once per proposal. */
  kind: string;
  /**
   * Whether a NEW playbook may start from it (contracts momentOffered): not a retired moment, and of the two win-backs
   * the one this workspace can read. The cards of playbooks already made on one still read their moment from here.
   */
  offered: boolean;
  /** Null, with `held` and `named`: the server could not count this moment -- never a zero it did not count. */
  candidates: number | null;
  held: number | null;
  named: PlaybookNamed | null;
}

/**
 * A message a playbook may send, with the channels it holds now (contracts messageHolds) and its email and text versions'
 * words, for the preview to draw a person on an email or a text as they read it (parts/preview-by.ts; absent on a template
 * stamped before they were kept): the same offered message the broadcast composer reads (parts/channels.ts cmOfferedMessages).
 */
export type PlaybookTemplate = CmOffered;

export interface PlaybooksSurface {
  rows: PlaybookCardVM[];
  /**
   * Each moment's count by the key a card, a moment or a list names it by (`poolKey`, a trigger's id, a list's token), for
   * every set of channels a playbook may tick; null where it was not counted. The cards and the moments read the figures
   * for what they go by; the composer reads the set in front of it.
   */
  pools: Record<string, PoolRead | null>;
  /** Whether the workspace can send on each channel now; null where that could not be read (parts/channels.ts cmReadyOf). */
  ready: ChannelsReady | null;
  /**
   * What the workspace's campaigns have sent by email and by text this calendar month, in its zone (server/campaigns/
   * month-sent.ts); null where that could not be read, and the page then says nothing of the month. The head says it from half
   * used (contracts allowanceLine) and a composer before a send (contracts allowanceBeforeSend).
   */
  month_sent: MonthSent | null;
  timezone: string;
  /** False when the server could not count some moment: the page says so once, over the cards. */
  countsRead: boolean;
  /** Whether a visit trigger can run: the workspace's calendar state. */
  calendar: "ok" | "unavailable" | "none";
  /**
   * How the business works, as Campaigns' home reads it (contracts LifecycleShape, from GET playbooks' businessShape): the
   * calendar its appointment moments are counted from, whether deals are on, and what it calls an appointment.
   */
  shape: LifecycleShape;
  triggers: PlaybookTriggerOption[];
  /**
   * Every list a playbook may run on (decision 0009), each by its token (`seg:<id>` for People's, `list:<id>` for the
   * workspace's own) with its own count: People's first, then the workspace's. Empty when none could be read.
   */
  lists: {
    /** The list's token: what the composer picks and the card links by. */
    id: string;
    name: string;
    smart: boolean;
    /** One of People's lists, not the workspace's own. */
    builtin: boolean;
    candidates: number | null;
    held: number | null;
    named: PlaybookNamed | null;
  }[];
  /** The messages a playbook may send, with their variables and the channels each holds. */
  /** Null: the templates read failed -- its own state, never "no template yet". */
  templates: PlaybookTemplate[] | null;
  number: { present: boolean; health: NumberHealth };
  businessName: string;
  /** Its postal address where the Business record holds one: the foot of an email names it (contracts emailFoot). */
  businessAddress?: string | null;
  bookingLink: boolean;
  /** The reply window in words, for the tips that say what a reply is (contracts REPLY_WINDOW_WORDS). */
  replyWindow: string;
  fetchedAt: number;
}

/** Count the whole pool, not one run's cap. */

/**
 * How the business works, from GET playbooks' answer (its businessShape): what the workspace calls an appointment, and
 * whether its appointment moments are counted from a calendar's feed, from a booking tool's emails, or from neither. A
 * server from before the word answers none, and the one derivation reads how its customers buy here instead, so either
 * deploy order works.
 */
function businessShapeOf(
  pb: Pick<Output<"GET playbooks">, "deals_on" | "appointment_word" | "bookings_by_email">,
  calendarOn: boolean,
): LifecycleShape {
  return {
    calendar: calendarOn ? "feed" : pb.bookings_by_email === true ? "email" : "none",
    dealsOn: !!pb.deals_on,
    word: appointmentWordOf({ stored: pb.appointment_word ?? null, sellsBy: pb.deals_on ? "proposal" : null }),
  };
}

/**
 * Playbooks: the rows with what their runs earned, the triggers with the
 * count of people a run would pick now and how many wait for the week's
 * breath -- counted on the server over everyone, by the runner's own
 * predicate, so the number on the chip is the number a run starts from --
 * and the messages a playbook may send.
 */
export const playbooksOverride: SurfaceOverride = {
  key: "playbooks",
  value: "playbooks",
  events: ["surface:playbooks"],
  // A run the sweep made, or one approved or stopped elsewhere (00321), and a playbook paused, renamed or retimed by a
  // teammate (00364), move a playbook's row and its "next run": heard wherever the tab is. A message moves a playbook's
  // replies: read again only while its page is on screen, and once when it comes back (surface-registry.ts).
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "broadcasts", "playbooks"],
  refreshWhen: onlyOnItsPage("playbooks", DEFAULT_REFRESH_TABLES),
  apply: async () => {
    const [pb, tpl, ch, cfg] = await Promise.all([
      read("GET playbooks"),
      read("GET templates").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      read("GET settings").catch((e: unknown) => e as Error),
    ]);
    const now = new Date();
    // The pools are the route's: who a run would pick NOW, and who waits for
    // the week's breath, over everyone in People with their visits. A moment
    // the route could not count is null here too, never a zero it did not count.
    // They are read for WhatsApp alone (every playbook went by it), and a playbook that ticks more reads its own set.
    const pools: Record<string, PoolRead | null> = pb.pools ?? {};
    const pool = (trigger: string) => pools[trigger]?.candidates ?? null;
    const held = (trigger: string) => pools[trigger]?.held ?? null;
    // And everyone each moment names, with who of them no run reaches whatever the week.
    const named = (trigger: string): PlaybookNamed | null => namedOf(pools[trigger]);
    const wa =
      ch instanceof Error
        ? null
        : ((ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null);
    const brain = cfg instanceof Error ? null : (cfg.config?.brain ?? null);
    if (tpl instanceof Error) console.error("playbooks_templates_fetch_failed", tpl.message);
    if (ch instanceof Error) console.error("playbooks_channels_fetch_failed", ch.message);
    const tz = pb.timezone || "America/New_York";
    // A playbook on a list is counted by its list's token (`seg:<id>` or `list:<id>`, decision 0009), and named for it.
    const listsKept = pb.lists ?? [];
    const peopleLists = pb.people_lists ?? [];
    const momentKey = (p: { trigger: string; list_id?: string | null; list_key?: string | null }) =>
      p.trigger !== "saved_list" ? p.trigger : p.list_key ? `seg:${p.list_key}` : `list:${p.list_id ?? ""}`;
    // A playbook whose message is stricter than its moment's class (an After-the-visit one still sending its offer) is
    // counted on its own: its run enrols by the message's yes (the route's strictMessagePools).
    const keyOf = (p: { id: string; trigger: string; list_id?: string | null; list_key?: string | null }) =>
      playbookPoolKey(p.id) in (pb.pools ?? {}) ? playbookPoolKey(p.id) : momentKey(p);
    // A built-in is named by contracts when the route's People read failed: it is never deleted. One of the
    // workspace's own is named by the lists read; unread, it is a list that could not be read, never a deleted one.
    const listNameOf = (p: { list_id?: string | null; list_key?: string | null }) =>
      p.list_key
        ? (peopleLists.find((l) => l.key === p.list_key)?.label ??
          PEOPLE_LISTS.find((l) => l.id === p.list_key)?.label ??
          null)
        : (listsKept.find((l) => l.id === p.list_id)?.name ?? null);
    const unnamed = pb.lists === null ? "A list that could not be read" : "A list that was deleted";
    // The moments that may run here (0006): a proposal's only where deals are on, as the route counts them. The cards read
    // their moment from them, a retired one's too; which a NEW playbook may start from is each one's `offered` below.
    const moments = PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, !!pb.deals_on));
    // A connected calendar counts whether or not its feed can be read just now: the win-back by visits is offered on it.
    const calendarOn = (pb.calendar ?? "none") !== "none";
    // How the business works, and the word every moment's words below say.
    const shape = businessShapeOf(pb, calendarOn);
    const { word } = shape;
    setSurfaceValue("playbooks", {
      pools,
      shape,
      ready: pb.ready ?? null,
      month_sent: pb.month_sent ?? null,
      rows: pb.playbooks.map((p) => {
        const t = triggerOf(p.trigger);
        const onArchived = p.trigger === "saved_list" && !!listsKept.find((l) => l.id === p.list_id)?.archived;
        // Its reach is the count for the channels it goes by.
        const reading = readingFor(pools[keyOf(p)], p.channels);
        return {
          ...p,
          poolKey: keyOf(p),
          // Its list was archived (00169): paused until the list is restored or the playbook moved to another.
          listArchived: onArchived,
          triggerLabel:
            p.trigger === "saved_list" ? (listNameOf(p) ?? unnamed) : t ? triggerWords(t, word).label : p.trigger,
          triggerHint: t ? triggerWords(t, word).hint : "",
          schedule: scheduleLine(p, word),
          // While the workspace is paused no time is promised: the card says so instead of "tomorrow 10:00 AM".
          next: nextRunLabel(p, tz, now, pb.ready?.paused === true),
          candidates: reading ? reading.candidates : null,
          held: reading ? reading.held : null,
          named: namedOf(reading),
          // A follow-up made while deals were on runs nothing once they are off: the card says why (0006).
          off: t && !triggerOffered(t, !!pb.deals_on) ? FOLLOW_UP_NEEDS_DEALS : null,
        };
      }),
      timezone: tz,
      countsRead: moments.every((t) => t.kind === "saved" || !!pb.pools?.[t.id]),
      lists: [
        ...peopleLists.map((l) => ({ id: `seg:${l.key}`, name: l.label, smart: true, builtin: true })),
        // An archived list is offered to no new playbook (00169); the ones on it say so on their card.
        ...listsKept
          .filter((l) => !l.archived && !l.viewer)
          .map((l) => ({ id: `list:${l.id}`, name: l.name, smart: l.smart, builtin: false })),
      ].map((l) => ({ ...l, candidates: pool(l.id), held: held(l.id), named: named(l.id) })),
      calendar: pb.calendar ?? "none",
      triggers: moments.map((t) => ({
        id: t.id,
        label: triggerWords(t, word).label,
        hint: triggerWords(t, word).hint,
        cls: t.cls,
        list: t.list,
        kind: t.kind,
        offered: momentOffered(t, { dealsOn: !!pb.deals_on, calendarOn }),
        candidates: pool(t.id),
        held: held(t.id),
        named: named(t.id),
      })),
      // Every channel's rows are read: an email or a text of a message's name and language is a version of it.
      templates: tpl instanceof Error ? null : cmOfferedMessages(tpl),
      number: {
        present: !!wa,
        health: numberHealth({
          quality: wa?.quality ?? null,
          event: wa?.quality_event ?? null,
          limit: wa?.messaging_limit ?? null,
        }),
      },
      businessName: brain?.business_name || "the business",
      businessAddress: cmAddressOf(brain),
      bookingLink: !!brain?.booking_link,
      replyWindow: REPLY_WINDOW_WORDS,
      fetchedAt: now.getTime(),
    });
  },
};
