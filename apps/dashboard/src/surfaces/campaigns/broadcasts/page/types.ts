/**
 * What the send screen and the ledger pass between them (moved from legacy/pages/broadcasts.jsx, decision 0015): the
 * page's state and what each plain function works out of it, as the JSX kept them in one bag it added to as it went.
 * Nothing here draws.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type {
  AskedPurpose,
  AudiencePreview,
  BroadcastDto,
  BroadcastVM,
  ChannelsReady,
  ConsentChannel,
  ParamSourceKind,
  PreviewVersions,
  ReachSplit,
} from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { UnsavedWork } from "../../../kit/record/work";
import type { CmViaTick } from "../../parts/channels";
import type { CmPreviewBy } from "../../parts/preview-by";
import type { PlaybookCardVM } from "../../playbooks/surface";
import type { AudienceOption, AudiencesSurface } from "../audiences-surface";
import type { BroadcastTemplate, BroadcastsSurface } from "../surface";
import type { bcWhenNote } from "../when";

export type Setter<T> = Dispatch<SetStateAction<T>>;

/**
 * What the shell's toast takes (frame/flash.tsx `usePPToast`): its words, and the acts beside them. `LegacyFlash`
 * (legacy-verbs.ts) names only the tone and the words; the toast's own take an act and doors too.
 */
interface BcFlash {
  tone?: string;
  msg: ReactNode;
  /** A press the toast carries; it calls it and ignores what it answers. */
  action?: { label: string; onClick: () => unknown } | null;
  links?: { label: string; to: string }[];
}
export type Flash = (flash: BcFlash) => void;

/** What the send screen kept in the tab when the page was left (`useUnsavedWork`'s value). */
export interface BcKept {
  aud: string;
  tplId?: string;
  params?: Params;
  sources?: Sources;
  name?: string;
  whenAt?: number | null;
  /** The channels ticked in the Send by row; a send kept before the row was drawn has none, and goes by WhatsApp. */
  channels?: ConsentChannel[];
}

/** The values typed into each template's slots, by template id. */
export type Params = Record<string, string[]>;
/** What fills each template's slots, by template id. */
export type Sources = Record<string, ParamSourceKind[]>;

/** What a template's slot is, as the row carries it (Meta's variables, with the position and the example it gave). */
export interface BcSlotVar {
  position?: number;
  label?: string;
  example?: string | number;
}

/** What the run's own acts take of a row: which it is, and its name for the toast. */
export interface BcActRow {
  id: string;
  name: string;
  state?: string;
  /** A sequence's run's day, which its name carries after it and its toast does not (contracts runTitleOf). */
  run_for?: string | null;
}

/** The one run waiting on you, as its sheet draws it (broadcasts/run.tsx BroadcastDetail's `sheet`). */
export interface BcSheet {
  position: [number, number] | null;
  canSend: boolean;
  playbook: PlaybookCardVM | null;
  /** The message, with its email and text versions where the page holds them (the composers' templates carry them). */
  template: (TemplateDto & { versions?: PreviewVersions }) | null;
  businessName: string;
  /** Its postal address where the Business record holds one: an offer's email names it in its foot. */
  businessAddress: string | null;
  /** Whether the workspace is paused, from the page's readiness (ChannelsReady.paused); null where that was not read. */
  paused: boolean | null;
  armed: boolean;
  onArm: (on: boolean) => void;
  stopping: boolean;
  approving: boolean;
  approve: (words?: unknown) => Promise<void>;
  skip: () => Promise<void>;
}

/** Every template this product can put on the wire, and why the rest cannot. */
interface BcOffered {
  sendable: BroadcastTemplate[];
  blocked: BroadcastTemplate[];
  why: string | null;
}

/**
 * What the page is drawn from: Sent's surface, and who each audience reaches once that is read (audiences-surface.ts, every
 * page of People). A run's sheet, To send and Get their yes draw without it, and Send it again joins a run's sheet once it is
 * in; a composer is opened with it whole (home/use-home.ts useComposerData).
 */
export type BcData = BroadcastsSurface & Partial<Omit<AudiencesSurface, "fetchedAt">>;

/** What a composer is opened with: Sent's surface and who each audience reaches, both read. */
export type BcWhole = BroadcastsSurface & Omit<AudiencesSurface, "fetchedAt">;

/** The page's own state and reads, before anything is worked out of them. */
export interface BcBase {
  data: BcData;
  flash: Flash;
  canSend: boolean;
  audiences: AudienceOption[];
  templatesRead: boolean;
  offered: BcOffered;
  link: boolean;
  /** Whether the Google listing keeps a review link: what a review-link slot may be filled with. */
  review: boolean;
  templates: BroadcastTemplate[];
  aud: string;
  setAud: Setter<string>;
  setWriting: Setter<boolean>;
  tplId: string;
  setTplId: Setter<string>;
  /** The channels ticked in the Send by row, as the owner left them (what is on is BcReach's `on`). */
  channels: ConsentChannel[];
  setChannels: Setter<ConsentChannel[]>;
  /**
   * The send the switch "Also send to the N who hear from you within a week of it" (contracts heardTooWords) was switched
   * on for (reach.ts bcSendKey), or null: off, the send leaves out whoever hears from a campaign or a broadcast within a
   * week of it; on, it carries
   * `breathe: false`. It answers for that message, list and channels alone: on any other send it is off.
   */
  heardTooFor: string | null;
  setHeardTooFor: Setter<string | null>;
  params: Params;
  setParams: Setter<Params>;
  sources: Sources;
  setSources: Setter<Sources>;
  composing: boolean;
  setComposing: Setter<boolean>;
  name: string;
  setName: Setter<string>;
  whenAt: number | null;
  setWhenAt: Setter<number | null>;
  busy: boolean;
  setBusy: Setter<boolean>;
  clearWords: () => void;
  work: UnsavedWork;
  who: number;
  setWho: Setter<number>;
  now: number;
  armed: boolean;
  setArmed: Setter<boolean>;
  openId: string | null;
  /** A run opened, or none, which closes it. */
  openRun: (id: string | null) => void;
  yesDoor: ReactNode;
  /** The same door as a link on its own, for the fold under "Who's held back" (state.tsx useBcYes). */
  yesLink: ReactNode;
  armId: string | null;
  setArmId: Setter<string | null>;
  stopping: string | null;
  setStopping: Setter<string | null>;
  addingStarters: boolean;
  setAddingStarters: Setter<boolean>;
  starterPending: number;
}

/** Who the send reaches with the message picked. */
export interface BcReach {
  active: AudienceOption | null;
  tpl: BroadcastTemplate | null;
  purpose: AskedPurpose;
  sizeOf: (a: AudienceOption | null) => number;
  /**
   * Who the send goes to at the time it goes (the time picked, else now): those it reaches, less those it leaves out while
   * it breathes. The count the reach line says, and the one act's: "Send to N now" and its Confirm, or Schedule's send.
   */
  activeCount: number;
  /**
   * Of those it reaches, how many hear from a campaign or a broadcast within a week of the send, either side: the time
   * picked, else now (contracts heardFor over the reading's `heardTouches`, as the route judges it).
   */
  heard: number;
  /** Whether the send leaves them out: unless the switch sends to them too (and always where nobody heard). */
  breathe: boolean;
  /** The switch pressed: on sends to them too, for this message, list and channels alone. */
  setHeardToo: (on: boolean) => void;
  /** How many it leaves out: `heard` while the send breathes, none once it sends to them too. */
  leftOut: number;
  /**
   * Who it reaches on each channel under the switch (contracts reachAfterBreath over the reading's split): the channel
   * clause, the split bar, the month's line and the day's limit read this. Null with no preview.
   */
  split: ReachSplit | null;
  number: BroadcastsSurface["number"] | null;
  /** The WhatsApp number can send, or WhatsApp is not one of the channels on and the number is nothing to this send. */
  numberOk: boolean;
  overLimit: boolean;
  /** Why the audience is past the number's day's limit, in contracts' sentence (overLimitRefusal); null while it fits. `overLimit` is its presence. */
  overLimitWords: string | null;
  /** Whether the workspace can send on each channel, with the message's own versions laid over it (parts/channels.ts). */
  channelReady: ChannelsReady;
  /** The channels the send goes by: ticked, and open to this message. Never more than the ticks, may be none. */
  on: ConsentChannel[];
  /** The Send by row: every channel, on or off, and why one is closed. */
  ticks: CmViaTick[];
  /** The audience as the channels on read it: who it reaches, on which channel, and who it holds. Null with no preview. */
  reading: AudiencePreview | null;
}

/** What each slot of the message may take, and what it takes now. */
export interface BcSlotChoices {
  vars: BcSlotVar[];
  SRC: Record<ParamSourceKind, string>;
  HINTS: Record<Exclude<ParamSourceKind, "text">, string>;
  choices: ParamSourceKind[][];
  srcOf: (i: number) => ParamSourceKind;
  exampleOf: (kind: ParamSourceKind) => string;
  labels: string[];
}

/** The first thing that keeps the send from going, as the foot says it: a thing still to fill in or pick, or a refusal. */
export interface BcSay {
  tone: "plain" | "warn";
  words: string;
}

/** The words each slot holds, and whether the send can go, and if not, the first thing that stops it. */
export interface BcSlotWords {
  typed: string[];
  setTyped: (i: number, words: string) => void;
  chooseSource: (i: number, kind: ParamSourceKind) => void;
  filled: string[];
  previewValues: string[];
  specs: (string | { kind: ParamSourceKind })[];
  /** Nothing stops it and it is not on its way: `say` is null (reach.ts bcStopOf is the one rule for both). */
  ready: boolean;
  say: BcSay | null;
  shown: string[];
}

/** The people behind the count, and what the line under the list says about them. */
export interface BcPeople {
  sample: AudiencePreview | null;
  people: AudiencePreview["people"];
  noNumber: string | null;
  yesWords: string | null;
  /** The reach split by channel, said where the send goes by more than WhatsApp alone; null otherwise. */
  splitWords: string | null;
  /** Who is held, by reason, said where the send goes by more than WhatsApp alone; none otherwise. */
  heldLines: { n: number; words: string }[];
  /** The split as the To line says it after the count ("12 on WhatsApp, 12 by email"), where the send goes by more than WhatsApp alone. */
  reachBy: string | null;
}

/** The one person the preview is drawn for, what they read, and when it lands. */
export interface BcPreview {
  person: AudiencePreview["people"][number] | null;
  /** The channel the send reaches them on, which is the version of the message they read: none for a person held back. */
  channel: ConsentChannel | null;
  /** The message as that channel carries it, handed to the preview (parts/preview-by.ts); null with no message picked. */
  preview: CmPreviewBy | null;
  forPerson: string[];
  noName: boolean;
  personNote: string | null;
  goesAt: number;
  maxDays: number;
  whenNote: ReturnType<typeof bcWhenNote>;
}

/** One approve at a time: the row being approved, and the ref the guard holds before the button has drawn that. */
export interface BcApproving {
  approvingRef: { current: string | null };
  approving: string | null;
  setApproving: Setter<string | null>;
}

/** Stop and approve, on a run. */
export interface BcRunActs {
  cancel: (row: BcActRow) => Promise<boolean>;
  approve: (row: BcActRow, words?: string | null) => Promise<boolean>;
}

/** The send, and the starter set added from the send screen. */
export interface BcSendActs {
  submit: (scheduled: boolean) => Promise<void>;
  addStarters: () => Promise<void>;
}

/** The runs a sheet reads: every run, those still to go out in their order, and the run the address opens. */
export interface BcRunsOf {
  rows: BroadcastVM[];
  openRows: BroadcastVM[];
  openRow: BroadcastVM | null;
}

/** Everything the send screen and Sent's sheets read, as the page has worked it out by the time it draws. */
export type BcV = BcBase &
  BcReach &
  BcSlotChoices &
  BcSlotWords &
  BcPeople &
  BcPreview &
  BcApproving &
  BcRunActs &
  BcSendActs &
  BcRunsOf & {
    sheetFor: (row: BroadcastVM | null) => BcSheet | null;
    againFor: (b: BroadcastDto) => ReactNode;
  };
