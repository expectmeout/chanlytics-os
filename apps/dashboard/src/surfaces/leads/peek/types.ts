/**
 * What the lead peek is handed and what it hands back (moved from legacy/pages/leads-peek.jsx, decision 0015). The peek
 * is hookless: every piece of state is the Leads page's (`peekId`, `peekMode`, `armed`, `draft`), handed down with the
 * acts `LeadPeekActions` builds from the page's setters, so these are the shapes that cross between the two.
 */
import type { ReactNode } from "react";
import type { leadPeekMenu, LeadCallOutcome, LeadNotAFitWhy, LeadPeekVM, LeadStageInput } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import type { useLegacyToast } from "../../legacy-verbs";

/** What the peek shows under its top row: the lead, a draft of an email to them, a question, or an Erase in flight. */
export type PeekMode = "info" | "draft" | "why" | "erase" | "erasing";

/** The stages the peek's segmented control offers (a stage `excluded` is never set from here). */
type PeekStage = LeadPeekVM["stages"][number]["id"];

/** A question the peek will ask once the owner is back at the tab: did you send it, how did the call go. */
export interface Armed {
  kind: "sent" | "call";
  leadId: string;
  asked: boolean;
  outcome: LeadCallOutcome | null;
  note: string;
}

/**
 * The draft for their own inbox, as the page holds it. Every field is optional: the pane reads it off `{}` before a
 * draft is asked for, and Shorter and Warmer spread whatever is there.
 */
export interface DraftState {
  busy?: boolean;
  tone?: string;
  to?: string | null;
  subject?: string;
  body?: string;
  mailto?: string | null;
  refusal?: string | null;
}

/** One lead at a time on a phone (D5): where you are in the pile, and the two ways through it. */
export interface Deck {
  at: number;
  of: number;
  onPrev: () => void;
  onNext: () => void;
}

/** The page's setter for the armed question: a value, or a function of the last one (a state setter's two shapes). */
export type ArmedSetter = (v: Armed | null | ((a: Armed | null) => Armed | null)) => void;

/** The toast the shell raises (data-bits `usePPToast`). */
export type Flash = ReturnType<typeof useLegacyToast>[1];

/** The one act the ⋯ menu offers (contracts' `leadPeekMenu`). */
type PeekMenuItem = ReturnType<typeof leadPeekMenu>[number];

/** What a stage, an outcome, "Did you send it?" or Not a fit answers (the route's own answer, `setStage`). */
export interface StageData {
  toast: string;
  undo?: { op_id: string; version: number } | null;
  converted?: boolean;
  contact_id?: string | null;
}

/** What asking for the draft answers, and what it is asked with. */
interface DraftData {
  to: string;
  subject: string;
  body: string;
  mailto: string;
}
interface DraftInput {
  tone: "first" | "shorter" | "warmer";
  previous?: { subject: string | undefined; body: string | undefined };
}

/** The acts the peek sends out by name: the bridge's `window.__leadStage` and its three siblings, or a stand-in's. */
export interface LeadCourier {
  __leadStage: (id: string, input: LeadStageInput) => Promise<ApiResult<StageData>>;
  __leadUndo: (opId: string, version: number) => Promise<ApiResult<unknown>>;
  __leadDraft: (id: string, input: DraftInput) => Promise<ApiResult<DraftData>>;
  __leadErase: (id: string) => Promise<ApiResult<unknown>>;
}

/** What the peek reads of the page: the lead's view model and its mode, question, draft, busy flag, deck and width. */
export interface PeekState {
  vm?: LeadPeekVM | null;
  mode?: PeekMode | null;
  armed?: Armed | null;
  draft?: DraftState | null;
  busy?: boolean;
  deck?: Deck | null;
  phone?: boolean;
}

/** The acts the peek's panes call by name (`on.<name>`): what `LeadPeekActions` returns. */
export interface PeekActs {
  onClose: () => void;
  onExpand: () => void;
  onStage: (stage: PeekStage) => Promise<unknown>;
  onBack: () => void;
  onNotAFit: () => void;
  menu: PeekMenuItem[];
  onEraseAsk: () => void;
  onErase: () => Promise<void>;
  onWhy: (why: LeadNotAFitWhy) => Promise<void>;
  onKeep: (id: string) => unknown;
  onExclude: (id: string) => unknown;
  onPutBack: (id: string) => unknown;
  onCopy: (id: string) => unknown;
  onCopyPhone: (id: string) => unknown;
  onCall: (id: string) => void;
  onLogCall: (id: string) => void;
  onOutcome: (outcome: LeadCallOutcome) => void;
  onNote: (note: string) => void;
  onCancelCall: () => void;
  onSaveCall: () => Promise<void>;
  onDraft: (id: string) => Promise<void>;
  onTone: (tone: "shorter" | "warmer") => Promise<void>;
  onOpenMail: () => void;
  onCopyDraft: () => Promise<void>;
  onSaidSent: () => Promise<void>;
  onNotYet: () => void;
  reachOut: ReactNode;
}

/** What the Leads page hands `LeadPeekActions`: its state, its setters, its courier and its own acts. */
export interface PeekPage {
  vm: LeadPeekVM;
  flash: Flash;
  onOpenPerson: (id: string) => void;
  keep: (id: string) => unknown;
  exclude: (id: string) => unknown;
  putBack: (id: string) => unknown;
  copyEmail: (id: string) => unknown;
  copyPhone: (id: string) => unknown;
  draft: DraftState | null;
  armed: Armed | null;
  setMode: (mode: PeekMode) => void;
  setArmed: ArmedSetter;
  setDraft: (draft: DraftState | null) => void;
  setPeekId: (id: string | null) => void;
  /** The photo, expanded (D5): the page's own lightbox state. */
  expand?: (id: string) => void;
  /** Where the acts go: the bridge's, which is the window's own where nothing else is given. */
  courier?: LeadCourier;
  /** How the owner's phone is dialled: an href handed to the browser, never a call placed from here. */
  dial?: (href: string | null) => void;
}
