/**
 * Campaigns' home, as the page reads it: what goes into the view model (`campaignsHomeOf`, lifecycle.ts) and what comes
 * out. The input is the shape of what the surfaces already carry (the playbooks' rows and pools, the broadcasts' runs and
 * reach, the library's templates, the reach-outs' chains), so the page hands them over as they are and derives nothing;
 * the output is every word and number the page draws, so it composes and never counts.
 *
 * A surface that has not landed yet is `undefined` and its sections say nothing; one that could not be read is `null`
 * and its sections say so. A number that is not known is `null`, never a zero it did not count.
 */
import type { ChannelsReady } from "../broadcasts/reach-for";
import type { ReachOutChainDto } from "../reach-out/reach-out-dtos";

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
  last_run_for: string | null;
  /** "today 10:00", "tomorrow 10:00", "today, within the hour" or "paused", by the business's clock. */
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
}

/** What the campaign report read over the last days says: the totals the page's funnel is drawn from. */
export interface LifecycleReport {
  days: number;
  totals: { sent: number; delivered: number; read: number; replied: number; optIns: number; optOuts: number };
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

/** A template row, as far as the home reads it: the library's count, and the call's text. */
export interface LifecycleTemplate {
  name: string;
  language: string;
  meta_status?: string | null;
  variables: unknown;
  hidden_at?: string | null;
}

export interface LifecycleInput {
  nowMs: number;
  /** The business's zone: the playbooks surface's own. */
  tz: string;
  playbooks: LifecyclePlaybooks | undefined;
  /** The broadcasts surface: undefined before it is read, null where it could not be (the tiles made from it say which). */
  broadcasts: LifecycleBroadcasts | null | undefined;
  /** The workspace's WhatsApp rows (the settings surface's `templatesAll`); null where they could not be read. */
  library: readonly LifecycleTemplate[] | null | undefined;
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
  /** What the meter says to a screen reader: "Can get your messages: 7 of 29". */
  meter: string;
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
  /** "3 said yes · 2 asked to stop". */
  yes: string | null;
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
