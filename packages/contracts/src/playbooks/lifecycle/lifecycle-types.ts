/**
 * Campaigns' home, as the page reads it: what goes into the view model (`campaignsHomeOf`, lifecycle.ts) and what comes
 * out. The input is the shape of what the surfaces already carry (the playbooks' rows and pools, the broadcasts' runs and
 * reach, the library's templates, the reach-outs' chains), so the page hands them over as they are and derives nothing;
 * the output is every word and number the page draws, so it composes and never counts.
 *
 * A surface that has not landed yet is `undefined` and its sections say nothing; one that could not be read is `null`
 * and its sections say so. A number that is not known is `null`, never a zero it did not count.
 */
import type { ChannelStandingPart } from "../../broadcasts/channels-standing";
import type { ChannelsReady } from "../../broadcasts/reach-for";
import type { ConsentChannel } from "../../consent/consent-channels";
import type { AppointmentWord } from "../../journey/appointment-word";
import type { JourneyStageId } from "../../journey/journey";
import type { ReachOutChainDto } from "../../reach-out/reach-out-dtos";
import type { CampaignMessage } from "../../templates/campaign-message";
import type { ChannelStand } from "../playbook-channels";
import type { LIFECYCLE_WORDS } from "./lifecycle-words";

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
  /**
   * Each autonomy class's mode by class (GET playbooks' `modes`): a Resume asked on a row says a class under `auto` in
   * full (decision 7). Null where unread, absent on a surface drawn without it: the question then says when and to how
   * many alone.
   */
  modes?: Readonly<Record<string, string>> | null;
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
 */
export interface LifecycleChains {
  complete: boolean;
  byRoot: Readonly<Partial<Record<string, { written: number; wroteBack: number }>>>;
}

/** How the business works, as the home reads it (the playbooks surface's, from GET playbooks' businessShape). */
export interface LifecycleShape {
  /**
   * "feed": a calendar is connected, its feed readable now or not; "email": none, but a booking tool's notices arrive by
   * email; "none": neither. The appointment moments are counted only from a feed (decision 0002's readers lane owes the rest).
   */
  calendar: "feed" | "email" | "none";
  dealsOn: boolean;
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
  /** Start a paused campaign again, asked in place: when its next run is, and to how many (decision 7). */
  | { kind: "resume"; label: string; playbookId: string; ask: { question: string; detail: string } }
  /** Go to a route: the library, a run. */
  | { kind: "route"; label: string; route: string };

/** One of the moments around a customer, in order. */
export interface LifecycleStage {
  /** The journey's stage (journey.ts): free of the word, and the ledger's group and its address (`campaigns/in:before`). */
  id: JourneyStageId;
  caps: string;
  name: string;
  glyph: LifecycleGlyph;
  /** The moment a new playbook starts from (the offered win-back for the quiet one); null for the receptionist. */
  moment: string | null;
  /** The campaign that leads it: a running one first, else the newest; null where none stands on it, and for the receptionist. */
  playbookId: string | null;
  /** How many are at it now; null where the moment could not be counted. */
  people: number | null;
  unit: string;
  /**
   * on: a running playbook, or the receptionist; paused; off: none made; not_here: where it cannot run (deals off) or
   * cannot be counted (no calendar).
   */
  state: "always" | "on" | "paused" | "off" | "not_here";
  stateWords: string;
  /** The same on a phone, where there is room for less: "Live", the clock alone ("daily 10:00 AM"), or the state's own words. */
  phoneWords: string;
  tone: LifecycleTone;
  needs: LifecycleNeeds;
  needsWords: string;
  covered: boolean;
  /** Its playbook is on and a run of it waits for the person's approval: the node says so, where the check stood. */
  waits: boolean;
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
  /** What its card says of its campaigns: the one's name and clock ("Visit reminder · daily 9:00 AM"), or "3 campaigns · 2 on · 1 paused"; null where none stands on it. */
  summary: string | null;
  /** How its campaigns stand, for the card's meter: only where it holds two or more, else null. */
  bar: LifecycleBar | null;
}

/** How a moment's campaigns stand, for its card's meter (on in ok, waiting in warn, paused at rest), of how many. */
export interface LifecycleBar {
  on: number;
  waiting: number;
  paused: number;
  of: number;
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
  /**
   * The phone's one line, in the Moments head (8 Oct 2026; it was a tile of its own, the canvas's A4, with a bar and a
   * note): "7 of 29 can hear you", and who said yes to offers beside it, toned where nobody has; null with the rungs.
   * `yes` is the door to how that yes is got (the desk's "Show the code", in the words its door carries elsewhere),
   * where the desk's tile has one: the removed tile's sentence said the receptionist asks, and opened nothing.
   */
  phone: {
    /** Null where nobody is in People yet: the line is not drawn. */
    words: string | null;
    offers: { words: string; tone: LifecycleTone } | null;
    yes: { label: string; route: string } | null;
  } | null;
}

/** A run waiting on a person, as its line in "Coming up" approves or skips it in place. */
export interface LifecycleWaiting {
  runId: string;
  /** Who gets it once it is approved (the run's own count, made when the run was). */
  people: number;
  /**
   * Why it cannot be approved now, in the verb's own sentence (playbook-approval.ts waitingRunOffer: its day has passed,
   * a visit's run would go a day late, or the workspace is paused); null where it can. Skip is then the act left. A run
   * that is decided on its sheet alone (a reach-out's, or one whose playbook is gone) has no `waiting` at all: its line
   * opens it.
   */
  refusal: string | null;
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
  /** The run this line approves or skips where it stands; null for every line that waits on nobody. */
  waiting: LifecycleWaiting | null;
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

/** A row's last 30 days: a playbook's or a one-off's sent and replied (campaign_series), a chain's written and wrote back (Reports' words), counted where nothing went ("none"), or not counted ("uncounted", "—"). */
export type LifecycleRowResults =
  | { kind: "sent"; sent: number; replied: number }
  | { kind: "written"; written: number; wroteBack: number }
  | "none"
  | "uncounted";

/** One row of the ledger: a campaign, or one of First contact's own (the receptionist, the call's text). */
export interface LifecycleRow {
  id: string;
  kind: "receptionist" | "call_text" | "playbook" | "list" | "offer" | "chain" | "sent_once";
  name: string;
  /** What it is, in a line under its name: its moment's hint, its list, its cadence, a chain's search and steps. */
  hint: string;
  status: "always" | "on" | "waiting" | "paused" | "not_here" | "off";
  stateWords: string;
  /** The same on a phone: the clock alone while it is on. */
  phoneWords: string;
  tone: LifecycleTone;
  needs: LifecycleNeeds;
  needsWords: string;
  channels: readonly LifecycleChannelMark[];
  /** Who its moment or list names now (the card's pool), and what the number counts; null where not counted. */
  people: { n: number | null; unit: string };
  results: LifecycleRowResults;
  /** Its next run in words and the moment it is sorted by: a waiting run now, a paused one never (null). */
  next: { words: string; atMs: number | null };
  /** Its door, an address the page draws as a link: the drawer, the Library, a one-off's run in Sent; null for the receptionist. */
  open: LifecycleAct | null;
  /** A run of it waiting on the person, approved or skipped on the row (decision 14); null otherwise. */
  waiting: LifecycleWaiting | null;
  /** The one act its state asks: Resume (asked in place), Turn on, or a chain's waiting run; null for the rest. */
  act: LifecycleAct | null;
  /** What a search matches: its name, its hint and its group's caption, lower-cased. */
  search: string;
}

/** A group of the ledger: a moment of the journey, then Lists & offers, Reach-outs and the one-off sends. */
export interface LifecycleGroup {
  /** Free of the word: the address `campaigns/in:<id>`. */
  id: JourneyStageId | "lists" | "reach_out" | "sent_once";
  caps: string;
  glyph: LifecycleGlyph;
  /** "3 campaigns · 2 on · 1 paused", or what an empty moment says of itself ("Off", "Needs your calendar"). */
  meta: string;
  rows: readonly LifecycleRow[];
  /** Turn on (the hinted one where it is); the calendar's door; "Find businesses to write to"; none on a moment holding its one campaign. */
  add: LifecycleAct | null;
}

/** The words the ledger's page says once (LIFECYCLE_WORDS.ledger), handed over with it. */
export type LedgerWords = (typeof LIFECYCLE_WORDS)["ledger"];

/** Every campaign of the workspace, grouped, counted, and the words to draw it with. */
export interface LifecycleLedger {
  /** The journey's stages in order, then lists, reach_out, and sent_once where the tools stand. */
  groups: readonly LifecycleGroup[];
  /** Campaigns only: the receptionist and the call's text are never counted. */
  counts: { all: number; running: number; needs: number; paused: number };
  /** Seven campaigns or more (decision 15): the tool line, the tabs, the heads, the phone's strip and search. */
  tools: boolean;
  /** Under the tools, the period's one-off sends as a footer and its door to Sent; null where there are none or they are a group. */
  sentOnce: { n: number; open: LifecycleAct } | null;
  /** "Last 30 days". */
  period: string;
  /** Whether the period's numbers are in: "—" in every row while reading or failed. */
  results: LifecycleTileRead;
  words: LedgerWords;
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
  surface: "playbooks" | "settings" | "reach_outs" | "broadcasts" | "campaign_results";
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
  /** Every campaign, grouped by the moment it stands on (spec 2026-10-09 §4.1). */
  ledger: LifecycleLedger;
  reach: LifecycleReachTile;
  coming: LifecycleComingTile | null;
  results: LifecycleResultsTile;
  failed: LifecycleFailed;
}
