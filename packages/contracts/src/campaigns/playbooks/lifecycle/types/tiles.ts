/** Types: tiles. */

import type { ChannelStandingPart } from "../../../broadcasts/channels-standing";
import type { ConsentChannel } from "../../../../consent/channels";
import type { JourneyStageId } from "../../../../journey/journey";
import type { LIFECYCLE_WORDS } from "../words";
import { type LifecycleChannelMark } from "./reads";

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
   * on: a running playbook, or the receptionist; paused; off: none made; not_here: where it cannot be counted (no
   * calendar).
   */
  state: "always" | "on" | "paused" | "off" | "not_here";
  stateWords: string;
  /** The same on a phone, where there is room for less: "Live", the clock alone ("daily 10:00 AM"), or the state's own words. */
  phoneWords: string;
  tone: LifecycleTone;
  needs: LifecycleNeeds;
  needsWords: string;
  covered: boolean;
  /** A run of its playbook waits for the person's approval, whether or not the playbook is paused: the node says so, where the check stood. */
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
   * Why it cannot be approved now, in the verb's own sentence (playbooks/approval.ts waitingRunOffer: its day has passed,
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

/** A row's last 30 days: a playbook's or a one-off's sent and replied (campaign_series), a chain's businesses (else emails written) and wrote back (Reports' words), counted where nothing went ("none"), or not counted ("uncounted", "—"). */
export type LifecycleRowResults =
  | { kind: "sent"; sent: number; replied: number }
  | { kind: "written"; written: number; businesses: number | null; wroteBack: number }
  | "none"
  | "uncounted";

/** One row of the ledger: a campaign, or one of First contact's own (the receptionist, the call's text). */
export interface LifecycleLine {
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
  /**
   * Who its moment or list names now (the card's pool), and what the number counts; null where not counted. `words`, where
   * a row says more than one number (a reach-out's "17 waiting · 9 writing", 00426), is said in its place; `n` still sorts.
   */
  people: { n: number | null; unit: string; words?: string };
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
  rows: readonly LifecycleLine[];
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
  /** The surface its Retry reads again: the composer's, Sent's runs or who each audience reaches. */
  surface: "playbooks" | "settings" | "reach_outs" | "broadcasts" | "audiences" | "campaign_results";
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
  /**
   * The rail: its name, how many moments are covered of how many (`covered` of `of`, the one count; said "2 of 5 moments
   * covered", and the phone's "2 of 5 on"), and the stages.
   */
  rail: {
    title: string;
    covered: number;
    of: number;
    coveredWords: string | null;
    phoneWords: string | null;
    stages: readonly LifecycleStage[];
  };
  /** Every campaign, grouped by the moment it stands on (spec 2026-10-09 §4.1). */
  ledger: LifecycleLedger;
  reach: LifecycleReachTile;
  coming: LifecycleComingTile | null;
  results: LifecycleResultsTile;
  failed: LifecycleFailed;
}
