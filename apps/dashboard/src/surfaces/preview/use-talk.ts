"use client";

/**
 * A lead's own preview, its one conversation (decision 0079; the redesign of 17 November 2026): what they said, what it
 * answered, a call they made and a thing they told it, as one list of lines the page draws in the order they happened.
 * The messages are the row's (the page's view model); a call and a thing told join the list as they happen in this
 * visit, since neither is kept with a time of its own: opened again, a call's line is gone and what they told it is in
 * What it knows.
 *
 * The field under it has two ways of taking words: as a customer would ask (the message door), or told to it (the tell
 * door), which the page turns on where an answer would have come to the business.
 */
import { useState } from "react";
import {
  LEAD_PREVIEW_WORDS as W,
  PREVIEW_LIMITS,
  PREVIEW_NEAR,
  PREVIEW_TAUGHT,
  type PreviewPageVM,
  type PreviewTurnVM,
} from "@chanlytics/contracts";
import { previewVerbs } from "./verbs";

/** One line of the conversation. */
export type TalkLine =
  | { kind: "said"; text: string }
  | { kind: "answer"; text: string; then: PreviewTurnVM["then"] }
  | { kind: "call"; seconds: number }
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

  const spent = vm.state === "spent" || left <= 0;
  const canTell = told < PREVIEW_TAUGHT.most;
  const asked = lines.filter((line) => line.kind === "said").map((line) => line.text);

  /** A message, asked as a customer would. */
  const say = async (words: string) => {
    const sentence = words.trim();
    if (!sentence || busy || spent) return;
    setBusy(true);
    setProblem(null);
    setLines((was) => [...was, { kind: "said", text: sentence }]);
    setText("");
    const answer = await previewVerbs.say(token, sentence);
    setBusy(false);
    if (!answer.ok) {
      // The message goes back into the field, with what happened beside it.
      setLines((was) => was.slice(0, -1));
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
    /** A call that ended, as a line: its seconds as the page counted them. */
    endedCall: (seconds: number) => {
      setCalled(true);
      setLines((was) => [...was, { kind: "call", seconds }]);
    },
    /** Whether Make it mine leads: as the row said, or by what they have done in this visit. */
    leads: vm.leads || called || told > 0 || PREVIEW_LIMITS.messages - left >= PREVIEW_NEAR.triedMessages,
    /** The count of messages left, said only near its end. */
    near: left <= PREVIEW_NEAR.messages ? W.left(left) : null,
  };
}

export type Talk = ReturnType<typeof useTalk>;
