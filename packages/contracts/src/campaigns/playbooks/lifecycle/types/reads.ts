/** Types: reads. */

import type { ChannelsReady } from "../../../broadcasts/reach-for";
import type { ConsentChannel } from "../../../../consent/channels";
import type { AppointmentWord } from "../../../../journey/appointment-word";
import type { ReachOutChainDto } from "../../../reach-out/dtos";
import type { CampaignMessage } from "../../../templates/campaign-message";
import type { ChannelStand } from "../../channels";
import type { SequenceMode } from "../../../sequences/sequence";

/** One moment's count as the playbooks surface keeps it (`pools`), less what the home does not read. */
export interface LifecyclePool {
  candidates: number;
  held: number;
  /** Everyone the moment names. */
  pool: number;
  /** How many of them said the yes its message needs, a number to send to or not. */
  saidYes: number;
}

/** Everyone a moment names and who of them said the yes it needs (`PlaybookNamed`). */
export interface LifecycleNamed {
  pool: number;
  saidYes: number;
}

/** A playbook as the surface's card holds it. */
export interface LifecyclePlaybook {
  id: string;
  name: string;
  trigger: string;
  state: string;
  run_hour: number;
  cadence_days: number;
  /**
   * The most one run sends (playbooks.cap_per_run): who is eligible past it goes on later runs. Absent where the card
   * was drawn without it, and the count is then said whole.
   */
  cap_per_run?: number | null;
  last_run_for: string | null;
  /**
   * "today 10:00 AM", "tomorrow 10:00 AM", "today, within the hour" or "paused", by the business's clock; "after billing resumes"
   * while the workspace is paused (contracts nextRunLabel).
   */
  next: string;
  /** The trigger's words, or its list's name for a playbook on a list. */
  triggerLabel: string;
  candidates: number | null;
  held: number | null;
  named: LifecycleNamed | null;
  /** Why it runs nothing here (a campaign past its last day), or null. */
  off: string | null;
  /**
   * Its last day as its words say it ("Oct 1"), where the business's today is past it (00416 `until`): it has ended, and
   * `off` says so. Null or absent otherwise.
   */
  ended?: string | null;
  /**
   * Its sequence's mode and when its words were last let go (decision 0064): what Resume says its next batch does
   * (contracts batchModeOf). Absent on a card drawn without them: Resume then says when and to how many alone.
   */
  mode?: SequenceMode | null;
  words_ok_at?: string | null;
  listArchived?: boolean;
  totals: { waiting: { id: string; recipient_count: number } | null };
  /** The channels it goes by (the row's `channels`): WhatsApp alone where it names none, as one made before them. */
  channels?: readonly string[] | null;
  /**
   * What its channels are read by (playbooks/channels.ts playbookChannelsRead): the class a playbook on a list sends
   * under, and the message it sends by its name and language (the surface's `templates` hold its versions). Absent on a
   * card drawn without them, and its marks then say only what it ticks.
   */
  policy_class?: string | null;
  template_name?: string | null;
  template_language?: string | null;
}

/** A message the playbooks surface offers, as far as the home reads it: which channels its versions hold. */
export interface LifecycleMessage {
  name: string;
  language: string;
  category?: string | null;
  /** Absent on a row stamped before messages were kept, which reads as WhatsApp's version alone. */
  message?: Pick<CampaignMessage, "versions">;
}

/** A channel a campaign goes by, as a mark on its card. */
export interface LifecycleChannelMark {
  channel: ConsentChannel;
  /** The channel's name on a page (VERSION_CHANNEL_WORDS): WhatsApp, Text, Email. */
  word: string;
  /**
   * How it stands for this campaign (playbooks/channels.ts ChannelStand, the reading its drawer's row shows): on, it
   * goes by it now; waits, it keeps it and cannot go by it yet (no line, no version, offers closed, the workspace
   * paused: a run holds those people until it can); could, it may go by it now and does not tick it (what one more tick
   * opens); off, neither, and the page draws nothing for it.
   */
  state: ChannelStand;
}

/** A moment that may run here, as the home reads it: whether a new campaign may start from it (its count is the surface's). */
export interface LifecycleTrigger {
  id: string;
  offered: boolean;
}

/** The playbooks surface, as the home reads it. */
export interface LifecyclePlaybooks {
  rows: readonly LifecyclePlaybook[];
  /** Each moment's count by the key a card or a moment names it by; null where it was not counted. */
  pools: Readonly<Record<string, LifecyclePool | null>>;
  triggers: readonly LifecycleTrigger[];
  timezone: string;
  /** False where the server could not count some moment: the rail says so once, over the people it shows as "—". */
  countsRead: boolean;
  /**
   * Whether the workspace can send on each channel now (null where that could not be read), and whether it is paused
   * (`paused`): the Coming-up rows say so instead of a time. The broadcasts surface carries the same readiness.
   */
  ready?: ChannelsReady | null;
  /**
   * The messages a playbook may send, with the versions each holds: what a playbook's marks read its message from.
   * Null where the templates could not be read, absent on a surface drawn without them: a mark then says nothing of what
   * one more tick would open.
   */
  templates?: readonly LifecycleMessage[] | null;
}

/** A run as the broadcasts surface lists it. */
export interface LifecycleRun {
  id: string;
  name: string;
  state: string;
  /** "today 9:00 AM", "tomorrow 10:00 AM" or "Sep 12 · 10:00 AM": when it went or goes. */
  when: string;
  scheduled_for: string;
  started_at: string | null;
  finished_at: string | null;
  recipient_count: number;
  playbook_id: string | null;
  counts: { sent: number; replied: number };
  /**
   * The day a playbook's run was made for, and what it was made over (its moment, or a reach-out's step): what the
   * approval's one predicate asks (runApprovalRefusal). Absent on a row read before the page carried them, and the run is
   * then never said to be late here; the verb still refuses it.
   */
  run_for?: string | null;
  audience?: unknown;
  /** A reach-out's going run: how many of its emails the check holds for its owner's say; absent where not counted. */
  held?: number | null;
}

/** Who can hear the workspace, counted over everyone in People once (`reachCountsOf`). */
export interface ReachCounts {
  people: number;
  /** Can be sent a message about their own visit on some channel the workspace can send on now. */
  canHear: number;
  /** Said yes to messages, whether or not the workspace can send on the channel. */
  saidMessages: number;
  /** Said yes to offers. */
  saidOffers: number;
  /**
   * `canHear` by channel: each person once, under the channel a send would reach them by (reach-any.ts `reachedOn`), so
   * the three add up to it. Absent from a count made before the channels were, and then said nowhere.
   */
  byChannel?: Record<ConsentChannel, number>;
}

/** What the campaign report read over the last days says: the totals the page's funnel is drawn from. */
export interface LifecycleReport {
  days: number;
  totals: {
    sent: number;
    delivered: number;
    read: number;
    replied: number;
    optIns: number;
    optOuts: number;
    /** The sends a read is a share of: WhatsApp's own (0030); absent, every send, as it always was. */
    readOf?: number;
  };
  /** What each channel sent in the period, the most first (0030); absent from a database before the channels were counted. */
  byChannel?: readonly { channel: ConsentChannel; sent: number }[];
  /** Each campaign's own numbers over the period (campaign_series' `sources`): the ledger's "Last 30 days" per row. */
  sources: readonly LifecycleSource[];
}

/**
 * One campaign's last 30 days as campaign_series counts them (its `sources`): a playbook's by its id; a one-off send's,
 * and each run of a playbook since deleted (broadcasts.playbook_id is set null), by its run's id.
 */
export interface LifecycleSource {
  id: string;
  kind: "playbook" | "broadcast";
  name: string;
  sent: number;
  replied: number;
  /** When it last sent, an ISO time; null where it never did. */
  lastAt: string | null;
}

/**
 * Each reach-out's last 30 days, by its root (GET reports/reach-outs' `chains`). `complete`: every chain was counted, so
 * one absent wrote nothing; false where they come from the report's twenty, so one absent may be past them and says "—".
 * `written` is emails; `businesses` the businesses they went to, which `wroteBack` is a count of: null where it is not
 * counted (a database before 00404), never guessed from `written`.
 */
export interface LifecycleChains {
  complete: boolean;
  byRoot: Readonly<Partial<Record<string, { written: number; businesses: number | null; wroteBack: number }>>>;
}

/** How the business works, as the home reads it (the playbooks surface's, from GET playbooks' businessShape). */
export interface LifecycleShape {
  /**
   * "feed": a calendar is connected, its feed readable now or not; "email": none, but a booking tool's notices arrive by
   * email; "none": neither. The appointment moments are counted only from a feed (decision 0002's readers lane owes the rest).
   */
  calendar: "feed" | "email" | "none";
  /** A deal was ever recorded here (GET playbooks' has_deals): the journey draws the proposal's stage only then, or held. */
  hasDeals: boolean;
  word: AppointmentWord;
}

/** The broadcasts surface, as the home reads it. */
export interface LifecycleBroadcasts {
  rows: readonly LifecycleRun[];
  /** Whether the workspace has a WhatsApp number: the yes to offers is got there. */
  number: { present: boolean };
  /**
   * Whether the workspace can send on each channel now, and whether its offers by email are paused (`email.offers`); null
   * where that could not be read. A line the receptionist can answer on is a number or any channel that is ready.
   */
  ready?: ChannelsReady | null;
  /** How a customer says yes in their own words; null link without a number. */
  optIn: { phrase: string; link: string | null };
  /** Null where the people could not be counted: the ladder says so. */
  reach: ReachCounts | null;
}

/** A template row, as far as the home reads it: the call's text. */
export interface LifecycleTemplate {
  name: string;
  language: string;
  meta_status?: string | null;
  variables: unknown;
  /** Why this product cannot send it, as the reader answers (templateBlocked): the call's text is never one of those. */
  blocked?: string | null;
}

export interface LifecycleInput {
  nowMs: number;
  /** The business's zone: the playbooks surface's own. */
  tz: string;
  playbooks: LifecyclePlaybooks | undefined;
  /** The broadcasts surface: undefined before it is read, null where it could not be (the tiles made from it say which). */
  broadcasts: LifecycleBroadcasts | null | undefined;
  /**
   * The rows the call's text is found among (the playbooks surface's `library`: the one GET templates names, `booking`,
   * found over every WhatsApp row as the edge sends it, or none); null where unread.
   */
  library: readonly LifecycleTemplate[] | null | undefined;
  /** The workspace's messages (the playbooks surface's `messages`), which the Library counts; null where unread. */
  messages: readonly Pick<CampaignMessage, "name" | "hidden">[] | null | undefined;
  /** The reach-outs' chains; null where they could not be read. */
  reachOuts: readonly ReachOutChainDto[] | null | undefined;
  /**
   * The campaigns' last 30 days, with each campaign's own (the campaign_results surface's report): undefined before it is
   * read, null where it could not be. "What came back" and each row's "Last 30 days" are drawn from it.
   */
  report: LifecycleReport | null | undefined;
  /** How the business works (the playbooks surface's `shape`): undefined with that surface. */
  shape: LifecycleShape | undefined;
  /**
   * The reach-outs' last 30 days, by root (the campaign_results surface's `chains`): undefined before it is read, null
   * where it could not be, and a chain's row then says "—".
   */
  chains: LifecycleChains | null | undefined;
}
