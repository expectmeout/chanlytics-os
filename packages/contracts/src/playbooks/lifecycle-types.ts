/**
 * Campaigns' home, as the page reads it: what goes into the view model (`campaignsHomeOf`, lifecycle.ts) and what comes
 * out. The input is the shape of what the surfaces already carry (the playbooks' rows and pools, the broadcasts' runs and
 * reach, the library's templates, the reach-outs' chains), so the page hands them over as they are and derives nothing;
 * the output is every word and number the page draws, so it composes and never counts.
 *
 * A surface that has not landed yet is `undefined` and its sections say nothing; one that could not be read is `null`
 * and its sections say so. A number that is not known is `null`, never a zero it did not count.
 */
import type { ChannelStandingPart } from "../broadcasts/channels-standing";
import type { ChannelsReady } from "../broadcasts/reach-for";
import type { ConsentChannel } from "../consent/consent-channels";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";
import type { CampaignMessage } from "../templates/campaign-message";
import type { ChannelStand } from "./playbook-channels";

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
   * "today 10:00", "tomorrow 10:00", "today, within the hour" or "paused", by the business's clock; "after billing resumes"
   * while the workspace is paused (contracts nextRunLabel).
   */
  next: string;
  /** The trigger's words, or its list's name for a playbook on a list. */
  triggerLabel: string;
  candidates: number | null;
  held: number | null;
  named: LifecycleNamed | null;
  /** Why it runs nothing here (a follow-up where deals are off), or null. */
  off: string | null;
  listArchived?: boolean;
  totals: { waiting: { id: string; recipient_count: number } | null };
  /** The channels it goes by (the row's `channels`): WhatsApp alone where it names none, as one made before them. */
  channels?: readonly string[] | null;
  /**
   * What its channels are read by (playbook-channels.ts playbookChannelsRead): the class a playbook on a list sends
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
   * How it stands for this campaign (playbook-channels.ts ChannelStand, the reading its drawer's row shows): on, it
   * goes by it now; waits, it keeps it and cannot go by it yet (no line, no version, offers closed, the workspace
   * paused: a run holds those people until it can); could, it may go by it now and does not tick it (what one more tick
   * opens); off, neither, and the page draws nothing for it.
   */
  state: ChannelStand;
}

/** A moment the surface offers, with its own count and who it names. */
export interface LifecycleTrigger {
  id: string;
  offered: boolean;
  candidates: number | null;
  named: LifecycleNamed | null;
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
  /** Null where the campaign report could not be read: the funnel says so, and the runs still stand. */
  report: LifecycleReport | null;
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
  /** The workspace's WhatsApp rows (the settings surface's `templatesAll`): the call's text; null where unread. */
  library: readonly LifecycleTemplate[] | null | undefined;
  /** The workspace's messages (the settings surface's `messages`), which the Library counts; null where unread. */
  messages: readonly Pick<CampaignMessage, "name" | "hidden">[] | null | undefined;
  /** The reach-outs' chains; null where they could not be read. */
  reachOuts: readonly ReachOutChainDto[] | null | undefined;
}

/** Whether the read a tile is made of landed: drawn when it did, said quietly while it is out, the kit's failed read where it failed. */
export type LifecycleTileRead = "read" | "reading" | "failed";

/** A sentence in parts: a part with `b` is the page's emphasis. */
export type LifecycleSentence = ReadonlyArray<string | { b: string }>;

/** The kit's glyphs the home draws. */
export type LifecycleGlyph = "chat" | "bell" | "check" | "refresh" | "deal" | "phone" | "gift" | "send" | "bolt";

/** How a state is toned: ok is on, warn asks to be seen, plain is neither. */
export type LifecycleTone = "ok" | "warn" | "plain";

/** What a moment's message asks of a person: nothing (the receptionist), their yes to messages, or their yes to offers. */
export type LifecycleNeeds = "none" | "messages" | "offers";

/** What pressing a tile or a row does. */
export type LifecycleAct =
  /** Open the playbook's drawer. */
  | { kind: "open"; label: string; playbookId: string }
  /** Open the composer on this moment. */
  | { kind: "turn_on"; label: string; moment: string }
  /** Start a paused playbook again, in place. */
  | { kind: "resume"; label: string; playbookId: string }
  /** Go to a route: the library, a run. */
  | { kind: "route"; label: string; route: string };

/** One of the moments around a customer, in order. */
export interface LifecycleStage {
  id: "first_contact" | "visit" | "after" | "quiet" | "proposal";
  caps: string;
  name: string;
  glyph: LifecycleGlyph;
  /** The moment a new playbook starts from (the offered win-back for the quiet one); null for the receptionist. */
  moment: string | null;
  playbookId: string | null;
  /** How many are at it now; null where the moment could not be counted. */
  people: number | null;
  unit: string;
  /** on: a running playbook, or the receptionist; paused; off: none made; not_here: where it cannot run (deals off). */
  state: "always" | "on" | "paused" | "off" | "not_here";
  stateWords: string;
  /** The same on a phone, where there is room for less: "Live", the clock alone ("daily 10:00"), or the state's own words. */
  phoneWords: string;
  tone: LifecycleTone;
  needs: LifecycleNeeds;
  needsWords: string;
  covered: boolean;
  /** "Turn on · 3 tomorrow" on the one off moment that has people waiting, else null. */
  hint: string | null;
  /** What pressing it does; null where it does nothing (the receptionist). */
  act: LifecycleAct | null;
  /**
   * The channels its playbook goes by, one mark each in the product's order; none for the receptionist (it answers on
   * whatever a person wrote on), none for a moment that is off (what Turn on ticks is the composer's to say) and none
   * for a playbook that runs nothing here, as its drawer draws no Goes by row.
   */
  channels: readonly LifecycleChannelMark[];
}

/** A quiet line under the rail: a playbook or a campaign that is not one of the five moments. */
export interface LifecycleStrip {
  id: string;
  kind: "call_text" | "moment" | "list" | "reach_out";
  glyph: LifecycleGlyph;
  name: string;
  words: string;
  stateWords: string;
  tone: LifecycleTone;
  /** What pressing the line does: its drawer, or the library for the call's text. */
  open: LifecycleAct;
  /** The act at its right. */
  act: LifecycleAct;
  /** The channels it goes by, as a stage's; none for the call's text (the phone agent's own) and for a line that is off. */
  channels: readonly LifecycleChannelMark[];
}

/** A rung of the ladder of who can hear the workspace. */
export interface LifecycleRung {
  id: "people" | "messages" | "offers";
  label: string;
  n: number;
  /** n over the people in People, 0 to 1. */
  share: number;
  /** "Opens: visit reminder, how did it go", or null on the first rung. */
  opens: string | null;
  tone: LifecycleTone;
  /** What the meter says to a screen reader: "Can get your messages: 7 of 29 · 5 on WhatsApp, 3 by email". */
  meter: string;
  /**
   * The meter in parts, one per channel that reaches anyone, each its share of everyone (the "messages" rung, where the
   * count knows its channels and more than one reaches someone); null for one part in the ink.
   */
  parts: readonly { channel: ConsentChannel; share: number }[] | null;
  /** "5 on WhatsApp, 3 by email", under the rung where the parts are drawn; null otherwise. */
  byWords: string | null;
}

export interface LifecycleReachTile {
  read: LifecycleTileRead;
  /** Null unless the tile is read: while the broadcasts surface is out, or failed, or its people could not be counted. */
  rungs: readonly LifecycleRung[] | null;
  /** The receptionist asks for the yes, and the doors to get it: only where there is a number to ask on. */
  yes: { note: string; code: LifecycleAct; phrase: string; copy: string } | null;
  /** The phone's one short tile: "7" "of 29 can hear you", the offers pill, a meter and a line; null with the rungs. */
  phone: {
    n: number;
    of: string;
    share: number;
    meter: string;
    offers: { words: string; tone: LifecycleTone };
    note: string | null;
  } | null;
}

/** A line of "Coming up": a moment's next run, a moment that is off with people waiting, or a run on its way. */
export interface LifecycleComing {
  id: string;
  kind: "moment" | "off" | "run";
  when: { day: string; at: string };
  what: string;
  why: string;
  pill: { tone: LifecycleTone; label: string } | null;
  act: LifecycleAct;
  /** The time it is sorted by. */
  atMs: number;
}

export interface LifecycleComingTile {
  read: LifecycleTileRead;
  /** Empty unless the tile is read: a week with the runs unread is not a week with nothing in it. */
  rows: readonly LifecycleComing[];
  /** Said where nothing is set to go out in the week; null while the runs are unread or failed, which say so instead. */
  empty: string | null;
  /** What the sending rules say, one dim line. */
  rules: string;
}

/** One of the funnel's four steps. */
export interface LifecycleFunnelStep {
  id: "sent" | "delivered" | "read" | "replied";
  label: string;
  /** What the meter says to a screen reader: "Read: 5". */
  meter: string;
  n: number;
  /** n over sent, 0 to 1. */
  share: number;
}

/** A run that went out, for "What came back". */
export interface LifecycleCameBack {
  id: string;
  name: string;
  /** "Sep 14 · 10:00 AM · 2 sent". */
  words: string;
  /** "1 reply", "2 replies" or "No replies". */
  result: string;
  route: string;
}

export interface LifecycleResultsTile {
  read: LifecycleTileRead;
  days: number;
  /** The period in words ("30 days"), beside the tile's name. */
  note: string;
  /** Null where the campaign report could not be read: the tile says so and shows the runs. */
  headline: { n: number; words: string } | null;
  funnel: readonly LifecycleFunnelStep[] | null;
  /** What the funnel's steps are, as a screen reader hears the list (0030: no read step, no read in it); null with none. */
  funnelLabel: string | null;
  /** "3 said yes · 2 asked to stop". */
  yes: string | null;
  /** What the funnel's read is, where a text or an email went too (0030); null where WhatsApp alone sent. */
  readNote: string | null;
  /** "84 on WhatsApp, 48 by email": what went by each channel, where more than one sent; null otherwise. */
  byChannel: string | null;
  runs: readonly LifecycleCameBack[];
  /** Nothing went out and nobody answered: said once instead of four bars. */
  quiet: boolean;
}

/** A read the home could not make, said where its data would be: what stopped, what stands, and the surface a Retry reads. */
export interface LifecycleFailedRead {
  /** What could not be read: "your templates" (the kit's title says "Couldn't read your templates"). */
  what: string;
  /** What is still current, one sentence. */
  body: string;
  /** The surface its Retry reads again. */
  surface: "playbooks" | "settings" | "reach_outs" | "broadcasts";
}

/** Each read the home is made from that failed, or null where it was read (or has not landed yet, which says nothing). */
export interface LifecycleFailed {
  /** The library of WhatsApp messages: the call's text and the Library's count. */
  templates: LifecycleFailedRead | null;
  /** The moments' pools: how many people are at each. */
  counts: LifecycleFailedRead | null;
  /** The reach-outs' chains. */
  chains: LifecycleFailedRead | null;
  /** The campaign report behind "What came back". */
  report: LifecycleFailedRead | null;
  /** The broadcasts read, said in each tile made from it: its people could not be counted, or its runs, or the whole read failed. */
  reach: LifecycleFailedRead | null;
  coming: LifecycleFailedRead | null;
  results: LifecycleFailedRead | null;
}

export interface LifecycleHead {
  title: string;
  /** The line under the title, in parts. */
  sentence: LifecycleSentence;
  library: { label: string; count: number | null };
  newMessage: string;
  /** A quiet line under the sentence while the workspace's offers by email are paused, else null. */
  pausedLine: string | null;
  /**
   * Where the workspace stands on its channels (channels-standing.ts): the open ones as one clause, then each closed one
   * with its reason and, where a setting mends it, its door. Null where the readiness could not be read: nothing is said.
   */
  channels: readonly ChannelStandingPart[] | null;
}

export interface LifecycleHome {
  head: LifecycleHead;
  /** The rail: its name, how many moments are covered ("2 of 5 moments covered", and the phone's "2 of 5 on"), and the stages. */
  rail: { title: string; coveredWords: string | null; phoneWords: string | null; stages: readonly LifecycleStage[] };
  strips: readonly LifecycleStrip[];
  reach: LifecycleReachTile;
  coming: LifecycleComingTile | null;
  results: LifecycleResultsTile;
  failed: LifecycleFailed;
}
