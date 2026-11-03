/** The Line as its parts read it: one bag, filled as AskReal draws (line.tsx). */
import type { KeyboardEvent, ReactNode, RefObject } from "react";
import type {
  AskAnswer,
  AskLanguage,
  AskMessageVM,
  AskProposalOutcome,
  AskSayPreview,
  AskShowPreview,
  AskScope,
  AskSurface,
  AskThreadVM,
} from "@chanlytics/contracts";
import type { AskApi } from "@/legacy-bridge/ask";
import type { Mascot } from "@/legacy-bridge/mascot";
import type { LegacyFlash } from "../../legacy-verbs";
import type { ahSlideFrom, useAskSpeech, useAskTalk, useHoldPress, useHoldSpace } from "../hooks";
import type { LineRow, LineSection } from "../home";
import type { LineWords } from "../words";

/** What a turn in flight writes and its landing reads: its thread, its final message, and what it has said. */
export interface Turn {
  mine: number;
  threadId: string | null;
  qid: string;
  ctl: AbortController;
  final: AskMessageVM | null;
  spoke: boolean;
  said: number;
  spoken: boolean;
}

/** The answer's Say as written so far, and Show once a figure or a row has closed. */
export type LiveSay = Omit<AskSayPreview, "show"> & { show?: AskShowPreview | null };

/** The turn in flight, as the Line draws it. */
export interface LiveTurn {
  q: string;
  text: string;
  say: LiveSay | null;
  traces: string[];
  turn: Turn;
  at: number;
}

/** A quick question being read, no model; its answer opens the conversation. */
export interface QuickTurn {
  q: string;
  pending: boolean;
}

/** Where a quick answer was kept, once it was. */
type KeptQuick = { id: string; title: string } | null;

/** The conversation the Line holds; `kept` while a quick turn is on its way to a thread. */
export interface Conversation {
  id: string | null;
  title: string;
  messages: AskMessageVM[];
  scope: AskScope | null;
  kept?: Promise<KeptQuick> | null;
}

/** A question's way in: the chip's turn and how it was asked. */
export interface AskedHow {
  spoken?: boolean;
  following?: string | null;
  fresh?: boolean;
}

/** What the shell sends as it opens the Line (`askAbout`, frame-doors.ts). */
export interface AskedSeed {
  prompt?: string;
  mode?: string;
  thread?: string;
  about?: AskScope | string | boolean;
  fresh?: boolean;
}

type Ref<T> = RefObject<T>;
type ElementRef<T extends HTMLElement> = RefObject<T | null>;

/** The route under the Line. */
export interface LineRoute {
  page: string;
  param: string | null;
}

/** A move the keys walk (`answerMoves`, ../turn.tsx). */
export type LineMove = { type: "item" | "open"; to: string } | { type: "next"; q: string };

/** A row or a move taken (under.ts arActivate). */
export type LineTaken = Omit<LineRow, "label">;

/** An answer as the Line draws it (`A.answer`). */
export interface DrawnAnswer {
  answer: AskAnswer;
  cardOpen: Record<string, boolean>;
}

/** A turn of the thread that has both: what the thread draws in full. */
export interface FoldedTurn {
  q: AskMessageVM;
  a: AskMessageVM;
}

/** One question and its answer (`A.turns`). */
export interface LineTurn {
  q: AskMessageVM | null;
  a: AskMessageVM | null;
}

/** The state of one Line (state.ts useArLine). */
export interface LineState {
  query: string;
  setQuery: (q: string) => void;
  threads: AskThreadVM[];
  setThreads: (next: AskThreadVM[] | ((prev: AskThreadVM[]) => AskThreadVM[])) => void;
  active: Conversation | null;
  setActive: (next: Conversation | null | ((prev: Conversation | null) => Conversation | null)) => void;
  live: LiveTurn | null;
  setLive: (next: LiveTurn | null | ((prev: LiveTurn | null) => LiveTurn | null)) => void;
  quick: QuickTurn | null;
  setQuick: (next: QuickTurn | null) => void;
  scope: AskScope | null;
  setScope: (next: AskScope | null) => void;
  sel: number;
  setSel: (next: number | ((prev: number) => number)) => void;
  move: number;
  setMove: (next: number | ((prev: number) => number)) => void;
  lang: AskLanguage;
  setLang: (next: AskLanguage) => void;
  tick: number;
  setTick: (next: number | ((prev: number) => number)) => void;
  view: string;
  setView: (next: string | ((prev: string) => string)) => void;
  doomed: AskThreadVM | null;
  setDoomed: (next: AskThreadVM | null) => void;
  composing: boolean;
  setComposing: (next: boolean) => void;
  slideFrom: Ref<ReturnType<typeof ahSlideFrom>>;
  speech: ReturnType<typeof useAskSpeech>;
  toastNode: ReactNode;
  flash: (flash: LegacyFlash) => void;
  inputRef: ElementRef<HTMLTextAreaElement>;
  faceRef: ElementRef<HTMLSpanElement>;
  heroRef: ElementRef<HTMLDivElement>;
  stageRef: ElementRef<HTMLDivElement>;
  bodyRef: ElementRef<HTMLDivElement>;
  dialogRef: ElementRef<HTMLDivElement>;
  typing: Ref<boolean>;
  threadsReady: Ref<Promise<AskThreadVM[]> | null>;
  turnSeq: Ref<number>;
  asked: Ref<AskedSeed | null>;
  held: Ref<boolean>;
  openedAt: Ref<number>;
  pushed: Ref<boolean>;
  away: Ref<boolean>;
}

/** The Line as drawn so far: the props, the state, the acts, then what each hook and builder returns. */
export interface Line extends LineState {
  open: boolean;
  onClose: () => void;
  /** Ask, wired to the workspace: null only before the bridge installs it, when the Line draws nothing and nothing presses. */
  A: AskApi;
  M: Mascot;
  t: LineWords;
  route: LineRoute;
  surface: AskSurface;
  phone: boolean;
  // The acts (acts.tsx).
  nav: (to: string, how?: { leave?: boolean }) => void;
  editWords: (text?: unknown) => void;
  moveOn: () => void;
  clearLine: () => void;
  noteOutcome: (messageId: string, pid: string, o: AskProposalOutcome) => void;
  openThread: (th: { id: string }) => Promise<Conversation | null>;
  askDelete: (th: AskThreadVM) => void;
  removeThread: (th: AskThreadVM) => Promise<void>;
  stop: () => void;
  // The turn (turns.tsx).
  submit: (q?: unknown, chip?: AskScope | null, how?: AskedHow) => Promise<void>;
  // Talking (hooks.ts useArVoice).
  talk: ReturnType<typeof useAskTalk>;
  hold: ReturnType<typeof useHoldSpace>;
  buzz: (ms: number) => void;
  holdThree: ReturnType<typeof useHoldPress>;
  begin: (e?: { preventDefault?: () => void }) => void;
  end: () => void;
  below: boolean;
  // What is under the line (under.ts).
  latest: LineTurn | null;
  folded: FoldedTurn[];
  answerMsg: AskMessageVM | null;
  showRows: boolean;
  composingRows: boolean;
  rowsDrawn: boolean;
  sections: LineSection[];
  rows: LineRow[];
  drawn: DrawnAnswer | null;
  moves: LineMove[];
  words: string;
  spoken: string;
  nextInThread: boolean;
  thread: boolean;
  listen: boolean;
  nowQ: string;
  activate: (it: LineTaken | undefined) => void;
  onKey: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  // The field's end and what stands around it (draw.tsx).
  liftMic: () => void;
  right: ReactNode;
  body: ReactNode;
  heroSmall: boolean;
  heroMode: string;
  heroQ: string | null;
  restful: boolean;
  parts: ReturnType<AskApi["rightNowParts"]> | null;
  standing: boolean;
  hero: ReactNode;
  foot: ReactNode;
}
