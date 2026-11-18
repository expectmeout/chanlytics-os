"use client";

/**
 * A lead's own preview, its one conversation (decision 0079; the redesign of 17 November 2026): what they said, what it
 * answered, a call they made and a thing they told it, as one list of lines the page draws in the order they happened.
 * The messages are the row's (the page's view model); a call and a thing told join the list as they happen in this
 * visit, since neither is kept with a time of its own. Opened again, what they told it is in What it knows, and the
 * calls of an earlier visit stand after the messages (the view model's `calls`), each read once for its words.
 *
 * A line that joined on this visit is `fresh`: the page draws it arriving, and writes a fresh answer out word by word.
 *
 * A call's line holds the words said on it, as the page last read them, and what the business would get after a real
 * one: asked for a few times once the call ends (the page's heard door), since the provider writes a call up a few
 * seconds after it. A write-up that never comes leaves the line as it is.
 *
 * The field under it has two ways of taking words: as a customer would ask (the message door), or told to it (the tell
 * door), which the page turns on where an answer would have come to the business.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
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
 * a few seconds, then less and less, inside the two minutes the server waits for one (server/previews/heard.ts WRITE_UP_MS).
 */
const AFTER_WAITS_MS = [2, 2, 3, 3, 4, 5, 6, 8, 10, 12, 15, 15].map((seconds) => seconds * SECOND_MS);
/** Reads that fail one after another before the page stops asking: a preview that ended, a network that is gone. */
const AFTER_FAILS = 3;

/** One line of the conversation; `fresh` where it joined the list on this visit. */
export type TalkLine = (
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
  | { kind: "told"; text: string }
) & { fresh?: boolean };

/** The row's turns as lines, then the calls of an earlier visit, which keep no place among them. */
const talkLinesOf = (turns: readonly PreviewTurnVM[], calls: PreviewPageVM["calls"]): TalkLine[] => [
  ...turns.map((turn): TalkLine =>
    turn.role === "user" ? { kind: "said", text: turn.text } : { kind: "answer", text: turn.text, then: turn.then },
  ),
  ...calls.map((call): TalkLine => ({ kind: "call", ...call, lines: [], got: null, writing: false })),
];

/** A call's line as it changes: the call it names, in the list where it stands. */
type CallLine = Extract<TalkLine, { kind: "call" }>;
const withCallChanged = (lines: readonly TalkLine[], id: string, change: Partial<CallLine>): TalkLine[] =>
  lines.map((line) => (line.kind === "call" && line.id === id ? { ...line, ...change } : line));

/**
 * A call's write-up, asked for until it is there, none is to come, its reads keep failing, or its waits are spent; each
 * answer changes the call's line where it stands. `open` is whether the page is still there to draw it.
 */
async function askForWriteUp(ask: {
  token: string;
  id: string;
  open: RefObject<boolean>;
  change: (change: Partial<CallLine>) => void;
}): Promise<void> {
  let failed = 0;
  for (const wait of AFTER_WAITS_MS) {
    await new Promise((go) => setTimeout(go, wait));
    if (!ask.open.current) return;
    const answer = await previewVerbs.heard(ask.token, ask.id);
    if (!ask.open.current) return;
    failed = answer.ok ? 0 : failed + 1;
    if (failed >= AFTER_FAILS) break;
    if (!answer.ok) continue;
    const { lines: whole, got, writing } = answer.data;
    // The words whole, now the call has ended: more than the last read of a live call held.
    ask.change({ ...(whole.length ? { lines: whole } : {}), got, writing });
    if (got || !writing) return;
  }
  ask.change({ writing: false });
}

/**
 * The calls of an earlier visit, each read once for its words: the row names the call, its own record holds what was
 * said. A read that fails leaves the line as it is, with how long the call ran.
 */
function useEarlierCalls(
  earlier: PreviewPageVM["calls"],
  token: string,
  open: RefObject<boolean>,
  setLines: (change: (was: TalkLine[]) => TalkLine[]) => void,
) {
  useEffect(() => {
    for (const call of earlier)
      void previewVerbs.heard(token, call.id).then((answer) => {
        if (!open.current || !answer.ok || !answer.data.lines.length) return;
        setLines((was) => withCallChanged(was, call.id, { lines: answer.data.lines, got: answer.data.got }));
      });
  }, [earlier, token, open, setLines]);
}

/** The conversation, and everything its field does. */
export function useTalk(vm: PreviewPageVM, token: string) {
  const [lines, setLines] = useState<TalkLine[]>(() => talkLinesOf(vm.turns, vm.calls));
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

  useEarlierCalls(vm.calls, token, open, setLines);

  const spent = vm.state === "spent" || left <= 0;
  const canTell = told < PREVIEW_TAUGHT.most;
  const questions = lines.filter((line) => line.kind === "said").map((line) => line.text);

  /** A message, asked as a customer would. */
  const say = async (words: string) => {
    const sentence = words.trim();
    if (!sentence || busy || spent) return;
    setBusy(true);
    setProblem(null);
    const asking: TalkLine = { kind: "said", text: sentence, fresh: true };
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
    setLines((was) => [
      ...was,
      { kind: "answer", text: answer.data.turn.text, then: answer.data.turn.then, fresh: true },
    ]);
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
    setLines((was) => [...was, { kind: "told", text: sentence, fresh: true }]);
    setTold(answer.data.taught);
    setText("");
    setTelling(false);
  };

  /** A call's write-up, asked for once it has ended, its line changed where it stands as each answer comes. */
  const writeUp = (id: string) =>
    askForWriteUp({ token, id, open, change: (change) => setLines((was) => withCallChanged(was, id, change)) });

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
    lastAsked: questions.at(-1) ?? null,
    /** The questions on the field not yet asked. */
    starters: vm.starters.filter((question) => !questions.includes(question)),
    /** A call that ended, as a line: its seconds as the page counted them, its words, and its write-up asked for. */
    endedCall: (call: CallEnded) => {
      setCalled(true);
      setLines((was) => [...was, { kind: "call", ...call, got: null, writing: call.id !== null, fresh: true }]);
      if (call.id) void writeUp(call.id);
    },
    /** Whether Make it mine leads: as the row said, or by what they have done in this visit. */
    leads: vm.leads || called || told > 0 || PREVIEW_LIMITS.messages - left >= PREVIEW_NEAR.triedMessages,
    /** The count of messages left, said only near its end. */
    near: left <= PREVIEW_NEAR.messages ? W.left(left) : null,
  };
}

export type Talk = ReturnType<typeof useTalk>;
