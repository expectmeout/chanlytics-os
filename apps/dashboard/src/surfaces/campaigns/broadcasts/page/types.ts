/**
 * What the send screen and the ledger pass between them (moved from legacy/pages/broadcasts.jsx, decision 0015): the
 * page's state and what each plain function works out of it, as the JSX kept them in one bag it added to as it went.
 * Nothing here draws.
 */
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { AskedPurpose, AudiencePreview, BroadcastDto, BroadcastVM, ParamSourceKind } from "@chanlytics/contracts";
import type { TemplateDto } from "@/surfaces/inbox/types";
import type { UnsavedWork } from "../../../legacy-parts";
import type { PlaybookCardVM } from "../../playbooks/surface";
import type { AudienceOption, BroadcastTemplate, BroadcastsSurface } from "../surface";
import type { bcWhenNote } from "../when";

export type Setter<T> = Dispatch<SetStateAction<T>>;

/**
 * What the shell's toast takes (data-bits `usePPToast`): its words, and the acts beside them. `LegacyFlash`
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
}

/** The one run waiting on you, as its sheet draws it (broadcasts/run.tsx BroadcastDetail's `sheet`). */
export interface BcSheet {
  position: [number, number] | null;
  canSend: boolean;
  playbook: PlaybookCardVM | null;
  template: TemplateDto | null;
  businessName: string;
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

/** The page's own state and reads, before anything is worked out of them. */
export interface BcBase {
  data: BroadcastsSurface;
  flash: Flash;
  canSend: boolean;
  audiences: AudienceOption[];
  templatesRead: boolean;
  offered: BcOffered;
  link: boolean;
  templates: BroadcastTemplate[];
  aud: string;
  setAud: Setter<string>;
  setWriting: Setter<boolean>;
  tplId: string;
  setTplId: Setter<string>;
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
  origin: string | null;
  setOrigin: Setter<string | null>;
  band: string | null;
  setBand: Setter<string | null>;
  now: number;
  armed: boolean;
  setArmed: Setter<boolean>;
  openId: string | null;
  openRun: (id: string | null) => void;
  yesOpen: boolean;
  setYesOpen: Setter<boolean>;
  yesDoor: ReactNode;
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
  activeCount: number;
  number: BroadcastsSurface["number"] | null;
  numberOk: boolean;
  overLimit: boolean;
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

/** The words each slot holds, and whether the send can go. */
export interface BcSlotWords {
  typed: string[];
  setTyped: (i: number, words: string) => void;
  chooseSource: (i: number, kind: ParamSourceKind) => void;
  filled: string[];
  previewValues: string[];
  specs: (string | { kind: ParamSourceKind })[];
  ready: boolean;
  shown: string[];
}

/** The people behind the count, and what the line under the list says about them. */
export interface BcPeople {
  sample: AudiencePreview | null;
  people: AudiencePreview["people"];
  noNumber: string | null;
  yesWords: string | null;
}

/** The one person the preview is drawn for, what they read, and when it lands. */
export interface BcPreview {
  person: AudiencePreview["people"][number] | null;
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

/** The ledger's runs: what is open, what went, the list under the band, and the run the address opens. */
export interface BcLedgerOf {
  rows: BroadcastVM[];
  open: BroadcastVM[];
  history: BroadcastVM[];
  shownHistory: BroadcastVM[];
  openRows: BroadcastVM[];
  recent: BroadcastVM[];
  runs: BroadcastVM[];
  sentN: number;
  runCard: (row: BroadcastVM) => ReactNode;
  openRow: BroadcastVM | null;
}

/** Everything the send screen and the ledger read, as the page has worked it out by the time it draws. */
export type BcV = BcBase &
  BcReach &
  BcSlotChoices &
  BcSlotWords &
  BcPeople &
  BcPreview &
  BcApproving &
  BcRunActs &
  BcSendActs &
  BcLedgerOf & {
    sheetFor: (row: BroadcastVM | null) => BcSheet | null;
    againFor: (b: BroadcastDto) => ReactNode;
  };
