/** The state of one Line, and the refs its effects and handlers share. */
import { useRef, useState } from "react";
import type { AskLanguage, AskScope, AskThreadVM } from "@chanlytics/contracts";
import type { AskApi } from "@/legacy-bridge/ask";
import { useAskSpeech, type ahSlideFrom } from "../hooks";
import type { AskedSeed, Conversation, LineState, LiveTurn, QuickTurn } from "./types";
import { useAskToast } from "../shell";

/** The state of one Line: the words, the conversations, the turn in flight, where the keys stand, and the refs its effects and handlers share. */
export const useArLine = (A: AskApi | undefined): LineState => {
  const [query, setQuery] = useState("");
  const [threads, setThreads] = useState<AskThreadVM[]>([]);
  const [active, setActive] = useState<Conversation | null>(null); // { id, title, messages, scope }
  const [live, setLive] = useState<LiveTurn | null>(null); // the turn in flight: { q, text, traces }
  const [quick, setQuick] = useState<QuickTurn | null>(null); // a quick question being read, no model: { q, pending: true }; its answer opens `active`
  const [scope, setScope] = useState<AskScope | null>(null);
  const [sel, setSel] = useState(0); // the row the keys stand on
  const [move, setMove] = useState(-1); // the answer's move they stand on, none at first
  const [lang, setLang] = useState<AskLanguage>(() => (A ? A.language() : "en"));
  const [tick, setTick] = useState(0);
  const [view, setView] = useState("rows"); // "rows", or "earlier": every conversation
  // The conversation a × or the Delete key asked to delete, waiting for a yes (N5).
  const [doomed, setDoomed] = useState<AskThreadVM | null>(null);
  // A phone's field in use (focused, so its keyboard is up): the takeover composes. The rows (Right now, Brief me, the
  // page's questions, and the words' own rows once typed) go as the field slides up over their place; the three keep
  // their size, centred in what is left with the standing pills under them, and listen, each key heard lifting them
  // (spec 5.9, "Composing").
  const [composing, setComposing] = useState(false);
  // Where the field and the three stood as the field was focused (ahSlideFrom), until the slide has run.
  const slideFrom = useRef<ReturnType<typeof ahSlideFrom>>(null);
  const speech = useAskSpeech(A);
  const [toastNode, flash] = useAskToast();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const faceRef = useRef<HTMLSpanElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  // The dialog itself: where a phone's takeover puts focus as it opens (S10).
  const dialogRef = useRef<HTMLDivElement>(null);
  // "Type instead" pressed while listening: what was heard stays in the field to finish, never asked (spec 5.3).
  const typing = useRef(false);
  // The thread list as it is being fetched on open: a question typed before it lands still finds its twin.
  const threadsReady = useRef<Promise<AskThreadVM[]> | null>(null);
  // The current turn: a turn left behind (stopped, cleared, another opened, a later question) writes nothing.
  const turnSeq = useRef(0);
  // What the shell asked for as it opened the Line, kept until the Line is open (the wiring audit's N3).
  const asked = useRef<AskedSeed | null>(null);
  // A hold on the mic in progress, or just lifted: the click its lift makes is not a press (see pressMic).
  const held = useRef(false);
  // When the Line opened: the question says how long it waited (the turn's shape, opened_ms).
  const openedAt = useRef(0);
  // Whether the takeover's Back entry is in the history (useArClose pushes it on a phone, nav takes it for a place).
  const pushed = useRef(false);
  // On a desk, whether the member has gone to work in the page beside the panel (focus left it): the field stops taking
  // focus back as answers land until they come back to the panel (useArFocus).
  const away = useRef(false);
  return {
    query,
    setQuery,
    threads,
    setThreads,
    active,
    setActive,
    live,
    setLive,
    quick,
    setQuick,
    scope,
    setScope,
    sel,
    setSel,
    move,
    setMove,
    lang,
    setLang,
    tick,
    setTick,
    view,
    setView,
    doomed,
    setDoomed,
    composing,
    setComposing,
    slideFrom,
    speech,
    toastNode,
    flash,
    inputRef,
    faceRef,
    heroRef,
    stageRef,
    bodyRef,
    dialogRef,
    typing,
    threadsReady,
    turnSeq,
    asked,
    held,
    openedAt,
    pushed,
    away,
  };
};
