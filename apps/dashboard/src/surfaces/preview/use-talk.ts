"use client";

/**
 * A lead's own preview, its one conversation (decision 0079; the redesign of 17 November 2026): what they said, what it
 * answered, a call they made and a thing they told it, as one list of lines the page draws in the order they happened.
 * The messages are the row's (the page's view model); a call and a thing told join the list as they happen in this
 * visit, since neither is kept with a time of its own: opened again, a call's line is gone and what they told it is in
 * What it knows.
 *
 * A call's line holds the words said on it, as the page last read them, and what the business would get after a real
 * one: asked for a few times once the call ends (the page's heard door), since the provider writes a call up a few
 * seconds after it. A write-up that never comes leaves the line as it is.
 *
 * The field under it has two ways of taking words: as a customer would ask (the message door), or told to it (the tell
 * door), which the page turns on where an answer would have come to the business.
 */
import { useEffect, useRef, useState } from "react";
import {
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  PREVIEW_NEAR,
  PREVIEW_TAUGHT,
  SECOND_MS,
  type PreviewGotVM,
  type PreviewHeardLine,
  type PreviewPageVM,
  type PreviewTurnVM,
} from "@chanlytics/contracts";
import type { CallEnded } from "./use-call";
import { previewVerbs } from "./verbs";

/**
 * When a call's write-up is asked for after its end: soon and often at first, since the provider usually writes one in
 * a few seconds, then less and less, to about the minute and a half the server waits for one (PREVIEW_WRITE_UP_MS).
 */
const AFTER_WAITS_MS = [2, 2, 3, 3, 4, 5, 6, 8, 10, 12, 15, 15].map((seconds) => seconds * SECOND_MS);
/** Reads that fail one after another before the page stops asking: a preview that ended, a network that is gone. */
const AFTER_FAILS = 3;

/** One line of the conversation. */
export type TalkLine =
  | { kind: "said"; text: string }
  | { kind: "answer"; text: string; then: PreviewTurnVM["then"] }
  | {
      kind: "call";
      seconds: number;
      /** The call's own name at the page's doors, or null where the page never learned it. */
      id: string | null;
      /** What was said on it, as last read. */
      lines: PreviewHeardLine[];
      /** What the business would get after a real one, once its write-up is there. */
      got: PreviewGotVM | null;
      /** Whether its write-up is still being waited for. */
      writing: boolean;
    }
  | { kind: "told"; text: string };

/** The row's turns as lines. */
const linesOf = (turns: readonly PreviewTurnVM[]): TalkLine[] =>
  turns.map((turn) =>
    turn.role === "user" ? { kind: "said", text: turn.text } : { kind: "answer", text: turn.text, then: turn.then },
  );

/** The conversation, and everything its field does. */
export function useTalk(vm: PreviewPageVM, token: string) {
  const [lines, setLines] = useState<TalkLine[]>(() => linesOf(vm.turns));
  const [left, setLeft] = useState(vm.left);
  const [told, setTold] = useState(vm.taught.length);
  const [telling, setTelling] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [called, setCalled] = useState(false);
  // Whether the page is still open: a call's write-up is asked for after its end, and a page left stops asking.
  const open = useRef(true);
  useEffect(() => {
    open.current = true;
    return () => {
      open.current = false;
    };
  }, []);

  const spent = vm.state === "spent" || left <= 0;
  const canTell = told < PREVIEW_TAUGHT.most;
  const asked = lines.filter((line) => line.kind === "said").map((line) => line.text);

  /** A message, asked as a customer would. */
  const say = async (words: string) => {
    const sentence = words.trim();
    if (!sentence || busy || spent) return;
    setBusy(true);
    setProblem(null);
    const asking: TalkLine = { kind: "said", text: sentence };
    setLines((was) => [...was, asking]);
    setText("");
    const answer = await previewVerbs.say(token, sentence);
    setBusy(false);
    if (!answer.ok) {
      // The message goes back into the field, with what happened beside it. Its own line is taken out, wherever it
      // stands by now: a call may have ended, and joined the list, while it waited.
      setLines((was) => was.filter((line) => line !== asking));
      setText(sentence);
      setProblem(answer.message ?? W.failed);
      return;
    }
    setLines((was) => [...was, { kind: "answer", text: answer.data.turn.text, then: answer.data.turn.then }]);
    setLeft(answer.data.left);
  };

  /** A thing told to it: in its record at once, and a line of the conversation. */
  const tell = async (words: string) => {
    const sentence = words.replace(/\s+/g, " ").trim();
    if (!sentence || busy || !canTell) return;
    setBusy(true);
    setProblem(null);
    const answer = await previewVerbs.tell(token, sentence);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.message ?? W.teachFailed);
      return;
    }
    setLines((was) => [...was, { kind: "told", text: sentence }]);
    setTold(answer.data.taught);
    setText("");
    setTelling(false);
  };

  /** A call's line, changed where it stands. */
  const changeCall = (id: string, change: Partial<Extract<TalkLine, { kind: "call" }>>) =>
    setLines((was) => was.map((line) => (line.kind === "call" && line.id === id ? { ...line, ...change } : line)));

  /** A call's write-up, asked for until it is there, none is to come, its reads keep failing, or its waits are spent. */
  const writeUp = async (id: string) => {
    let failed = 0;
    for (const wait of AFTER_WAITS_MS) {
      await new Promise((go) => setTimeout(go, wait));
      if (!open.current) return;
      const answer = await previewVerbs.heard(token, id);
      if (!open.current) return;
      if (!answer.ok) {
        failed += 1;
        if (failed >= AFTER_FAILS) break;
        continue;
      }
      failed = 0;
      const { lines: said, got, writing } = answer.data;
      // The words whole, now the call has ended: more than the last read of a live call held.
      changeCall(id, { ...(said.length ? { lines: said } : {}), got, writing });
      if (got || !writing) return;
    }
    changeCall(id, { writing: false });
  };

  return {
    lines,
    left,
    spent,
    busy,
    problem,
    text,
    setText,
    telling,
    /** The field's other way: telling it. Off where it holds its three. */
    startTelling: () => setTelling(canTell),
    stopTelling: () => setTelling(false),
    canTell,
    send: () => (telling ? tell(text) : say(text)),
    say,
    /** The last thing they asked, which Ask again asks once more. */
    lastAsked: asked.at(-1) ?? null,
    /** The questions on the field not yet asked. */
    starters: vm.starters.filter((question) => !asked.includes(question)),
    /** A call that ended, as a line: its seconds as the page counted them, its words, and its write-up asked for. */
    endedCall: (call: CallEnded) => {
      setCalled(true);
      setLines((was) => [...was, { kind: "call", ...call, got: null, writing: call.id !== null }]);
      if (call.id) void writeUp(call.id);
    },
    /** Whether Make it mine leads: as the row said, or by what they have done in this visit. */
    leads: vm.leads || called || told > 0 || PREVIEW_LIMITS.messages - left >= PREVIEW_NEAR.triedMessages,
    /** The count of messages left, said only near its end. */
    near: left <= PREVIEW_NEAR.messages ? W.left(left) : null,
  };
}

export type Talk = ReturnType<typeof useTalk>;
