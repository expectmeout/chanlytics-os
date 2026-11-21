/**
 * What New ad's screen holds, and what its presses do (the Ads plan's 4.6, 6.2 and G18). The workspace keeps its one
 * draft, with its words (server/ads/draft.ts): each answer is that draft judged afresh as the business stands, and kept.
 *
 *  - Opened, it asks for the draft: the sentence is there the moment that answers, with no model in its way. Then it
 *    asks the ad writer for the words, once. Words that failed the checks are asked for once more, and after that the
 *    screen says it could not write them.
 *  - What the owner sets is theirs. The amount, the miles, the date and an answer to the draft's question show at once
 *    (the press follows with them), and the draft is judged again a moment after they stop. An answer from the server
 *    brings the draft as it was sent: it never overwrites what the owner set while it was on its way.
 *  - While the ad writer is out, what the owner sets waits and is judged as the words land. A change the words are
 *    written from (another picture) asks the writer again.
 *  - Opened, on this device or another, by + New, by the bell's row for a draft someone left, or by AI's card, it is
 *    the workspace's kept draft, words and all, and the writer is not asked twice. Nothing is held in the tab: a draft
 *    held there could put an older one back over what someone else changed since.
 *  - Turn on carries what it shows (decision 0050, call 3): where the owner set something the server has not judged
 *    yet, it is judged (and kept) first, so the press never names a number the server would not. It goes under a key
 *    of its own, kept until an answer comes, so a press sent again after no answer makes one ad.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { adMostOf, type AdSpecialKind } from "@chanlytics/contracts";
import type { TurnOnPressed } from "@/bridge/verbs/ads";
import type { AdCantDraft, AdDraftAnswer, AdDraftState, AdWordsAnswer } from "@/server/ads/draft-shape";
import type { AdDraftHere, AdLocal, AdTellResult, AdWordsHere } from "./model";
import type { AdSource } from "./source";

/** A draft as the screen holds it. */
interface Held {
  answer: AdDraftHere;
  local: AdLocal;
  words: AdWordsHere;
  version: number;
}

/** Where the screen stands. After Turn on, the ad it made, being set up at Meta. */
export type AdStand =
  | { at: "opening" }
  | { at: "failed" }
  | { at: "missing"; missing: AdCantDraft }
  | ({ at: "draft" } & Held)
  | { at: "turned_on"; adId: string };

/** What Turn on was last refused with: the server's own words, or that no answer came. */
type AdTurnRefused = { said: string } | { failed: true };

/** How long after the owner stops typing the draft is judged again. */
const JUDGE_AFTER_MS = 500;

const localOf = (answer: AdDraftHere): AdLocal => ({
  total_minor: answer.draft.total_minor,
  miles: answer.draft.miles,
  end_day: answer.draft.end_day,
  answers: answer.draft.answers,
});

/** The draft as it is sent: the server's own, with what the owner has set since, and the writer's name for its service. */
const sentDraft = (held: Pick<Held, "answer" | "local">): AdDraftState => ({
  service: held.answer.draft.service,
  picture: held.answer.draft.picture.id,
  versions: held.answer.draft.versions,
  ...(held.answer.draft.label ? { label: held.answer.draft.label } : {}),
  // Fix it's draft says which ad Meta turned down it takes the place of, all the way to Turn on.
  ...(held.answer.draft.fixes ? { fixes: held.answer.draft.fixes } : {}),
  // A wider place rides back as the server found it: the owner changes it by telling AI, never by typing.
  ...(held.answer.draft.area ? { area: held.answer.draft.area } : {}),
  ...held.local,
});

const draftWords = (answer: AdDraftHere): AdWordsHere =>
  answer.draft.versions.length > 0 ? { at: "written" } : { at: "writing" };

const standOf = (answer: AdDraftAnswer | null): AdStand => {
  if (answer === null) return { at: "failed" };
  if (!answer.can) return { at: "missing", missing: answer.missing };
  return { at: "draft", answer, local: localOf(answer), words: draftWords(answer), version: 0 };
};

/** What "Tell AI" came to, from the writer's answer. */
function tellOutcome(answer: AdWordsAnswer): AdTellResult {
  if (answer.changed && answer.changed.kind !== "none") return { kind: "changed", what: answer.changed.kind };
  if (answer.changed) return { kind: "none", fault: answer.changed.fault };
  return { kind: "failed" };
}

/** What an ask needs of the screen: where answers come from, where the draft is shown, and which answer is the newest. */
interface Asking {
  source: AdSource;
  show: (next: AdStand) => void;
  /** The screen as it stands now. */
  now: { current: AdStand };
  /** Which ask is the newest: an answer to an older one says nothing of the draft as it stands. */
  turns: { current: number };
  /** Whether the writer was already asked once more for words that failed the checks. */
  tried: { current: number };
  /** How many times the owner has set something: an answer to an ask sent before the last of it keeps what they set. */
  sets: { current: number };
  /** "Tell AI" is out. */
  tellingNow: { current: boolean };
  /** The draft is being read: one read at a time, however many times the screen is opened meanwhile. */
  opening: { current: boolean };
  /** Turn on is on its way; and its key, kept until an answer comes. */
  turningNow: { current: boolean };
  pressKey: { current: string | null };
  setTurning: (on: boolean) => void;
  setRefused: (refused: AdTurnRefused | null) => void;
  setTelling: (on: boolean) => void;
  /** What "Tell AI" last came to. */
  setOutcome: (outcome: AdTellResult | null) => void;
}

const draftNow = (io: Asking): Held | null => (io.now.current.at === "draft" ? io.now.current : null);

/** The amount, miles, date and answers to hold as an answer lands: the owner's own where they set one since the ask. */
const localAfter = (io: Asking, answer: AdDraftHere, setsAt: number): AdLocal =>
  io.sets.current !== setsAt && io.now.current.at === "draft" ? io.now.current.local : localOf(answer);

/** The ad writer, asked for the draft's words: once, and once more where its words failed the checks. */
async function writeWords(io: Asking, held: Held, noPrice = false): Promise<void> {
  const turn = ++io.turns.current;
  const setsAt = io.sets.current;
  io.show({ at: "draft", ...held, words: { at: "writing" } });
  const answer = await io.source.words({
    job: "write",
    draft: sentDraft(held),
    ...(noPrice ? { no_price: true } : {}),
  });
  if (turn !== io.turns.current) return;
  if (answer === null || !answer.can) {
    const local = draftNow(io)?.local ?? held.local;
    io.show(answer === null ? { at: "draft", ...held, local, words: { at: "none", why: "failed" } } : standOf(answer));
    return;
  }
  const local = localAfter(io, answer, setsAt);
  if (!answer.wrote?.ok) {
    const reason = answer.wrote?.ok === false ? answer.wrote.why : "other";
    if (reason === "checks" && io.tried.current === 0) {
      io.tried.current = 1;
      return writeWords(io, { ...held, local }, noPrice);
    }
    io.tried.current = 0;
    io.show({ at: "draft", answer, local, words: { at: "none", why: reason }, version: held.version });
    return;
  }
  io.tried.current = 0;
  const next: Held = { answer, local, words: { at: "written" }, version: 0 };
  io.show({ at: "draft", ...next });
  // What the owner set while the writer was out is judged now.
  if (io.sets.current !== setsAt) return judgeDraft(io, next);
}

/** The draft judged again as it stands, after an act where one is named. */
async function judgeDraft(io: Asking, held: Held, act?: "next_picture"): Promise<void> {
  const turn = ++io.turns.current;
  const setsAt = io.sets.current;
  const answer = await io.source.draft({ draft: sentDraft(held), ...(act ? { act } : {}) });
  if (turn !== io.turns.current) return;
  // No answer leaves the draft as it stands; a writer this ask overtook is asked again, so its words still come.
  if (answer === null) return held.words.at === "writing" ? writeWords(io, held) : undefined;
  if (!answer.can) return io.show(standOf(answer));
  const next: Held = { answer, local: localAfter(io, answer, setsAt), words: held.words, version: held.version };
  // Words asked for before this change, or let go by it (the service is no longer in Services), are asked for again.
  if (held.words.at === "writing" || (held.words.at === "written" && answer.draft.versions.length === 0))
    return writeWords(io, next);
  io.show({ at: "draft", ...next });
}

/**
 * The workspace's draft: the kept one, or a fresh one where none is kept. The sentence is there the moment the server
 * answers; words it does not hold yet are asked for once.
 */
async function openDraft(io: Asking): Promise<void> {
  const turn = ++io.turns.current;
  io.tried.current = 0;
  io.show({ at: "opening" });
  io.opening.current = true;
  const first = standOf(
    await io.source.draft({}).finally(() => {
      io.opening.current = false;
    }),
  );
  if (turn !== io.turns.current) return;
  io.show(first);
  if (first.at === "draft" && first.words.at === "writing") return writeWords(io, first);
}

/** Opened: the workspace's draft as it is kept now, judged again as the business stands. */
function reopenDraft(io: Asking): void {
  // Still on the page with its writer out, or its read: the answer on its way is this draft's, and nothing is asked
  // twice. An effect run twice (React's own check, in development) opens it once.
  if (io.opening.current || draftNow(io)?.words.at === "writing") return;
  void openDraft(io);
}

/** The owner set something: it shows at once, and is theirs over any answer already on its way. */
function setLocal(io: Asking, patch: Partial<AdLocal>): Held | null {
  const held = draftNow(io);
  if (!held) return null;
  io.sets.current += 1;
  const next: Held = { ...held, local: { ...held.local, ...patch } };
  io.show({ at: "draft", ...next });
  return next;
}

/** Typed: judged a moment after the typing stops. While the writer is out, it is judged as its words land. */
function typeIntoDraft(io: Asking, patch: Partial<AdLocal>, afterTyping: (run: () => void) => void): void {
  if (!setLocal(io, patch)) return;
  afterTyping(() => {
    const latest = draftNow(io);
    if (latest && latest.words.at !== "writing") void judgeDraft(io, latest);
  });
}

/** The draft's question, answered: judged at once, or as the words land while the writer is out. */
function answerKindQuestion(io: Asking, about: AdSpecialKind, answer: "no" | "yes"): void {
  const held = draftNow(io);
  const next = held ? setLocal(io, { answers: { ...held.local.answers, [about]: answer } }) : null;
  if (next && next.words.at !== "writing") void judgeDraft(io, next);
}

/** Whether a change of AI's is one the owner set over while it was out: the amount, the end, or the miles they set. */
const setOverByOwner = (answer: AdDraftHere, change: AdTellResult): boolean =>
  change.kind === "changed" &&
  (change.what === "amount" || change.what === "end" || (change.what === "area" && !answer.draft.area));

/**
 * "Tell AI what to change": the one change it made, or none, said under the line. Its answer brings the draft as it was
 * sent: what the owner set while it was out stays theirs, is judged with AI's change, and a change of AI's they set
 * over is not said as made.
 */
async function tellAiToChange(io: Asking, words: string): Promise<void> {
  const held = draftNow(io);
  if (!held || io.tellingNow.current) return;
  const turn = ++io.turns.current;
  const setsAt = io.sets.current;
  io.setTelling(true);
  io.setOutcome(null);
  const answer = await io.source.words({ job: "change", draft: sentDraft(held), asked: words });
  io.setTelling(false);
  if (turn !== io.turns.current) return;
  if (answer === null) {
    io.setOutcome({ kind: "failed" });
    // A writer this ask overtook is asked again, so its words still come.
    return held.words.at === "writing" ? writeWords(io, held) : undefined;
  }
  if (!answer.can) return io.show(standOf(answer));
  const setSince = io.sets.current !== setsAt;
  const change = tellOutcome(answer);
  io.setOutcome(setSince && setOverByOwner(answer, change) ? null : change);
  const next: Held = { answer, local: localAfter(io, answer, setsAt), words: draftWords(answer), version: 0 };
  // A new service waits for its own words: the writer is asked for them next, with what the owner set.
  if (next.words.at === "writing") return writeWords(io, next);
  io.show({ at: "draft", ...next });
  // What the owner set while AI was out is judged now, with AI's change.
  if (setSince) return judgeDraft(io, next);
}

/** What Turn on's press shows: the draft as the server judged it, with the amount, miles and date the owner set. */
const shownOf = (held: Held): TurnOnPressed => ({
  service: held.answer.draft.service,
  picture: held.answer.draft.picture.id,
  miles: held.local.miles,
  ...(held.answer.draft.area ? { area: { kind: held.answer.draft.area.kind, key: held.answer.draft.area.key } } : {}),
  most_minor: adMostOf(held.local),
  end_day: held.local.end_day,
  versions: held.answer.draft.versions.map((version) => ({ text: version.text, headline: version.headline })),
});

/** Whether the owner set something the server has not judged yet. */
const unjudged = (held: Held): boolean =>
  held.local.total_minor !== held.answer.draft.total_minor ||
  held.local.miles !== held.answer.draft.miles ||
  held.local.end_day !== held.answer.draft.end_day ||
  JSON.stringify(held.local.answers) !== JSON.stringify(held.answer.draft.answers);

/**
 * Turn on: what the owner set judged first where the server has not, then the press, under its key. Turned on, the
 * screen says the ad is being set up; refused, it says the server's words and judges the draft again, which may have
 * changed since it was drawn.
 */
async function turnOnDraft(io: Asking): Promise<void> {
  const first = draftNow(io);
  if (!first || io.turningNow.current) return;
  io.setTurning(true);
  io.setRefused(null);
  if (unjudged(first)) await judgeDraft(io, first);
  const held = draftNow(io);
  if (!held || held.words.at !== "written") return io.setTurning(false);
  io.pressKey.current ??= crypto.randomUUID();
  const answer = await io.source.turnOn(io.pressKey.current, shownOf(held));
  io.setTurning(false);
  if (answer === null) return io.setRefused({ failed: true });
  // An answer came: a press after it is a new intent, with a new key.
  io.pressKey.current = null;
  if ("ad" in answer) return io.show({ at: "turned_on", adId: answer.ad });
  io.setRefused({ said: answer.refused });
  await judgeDraft(io, held);
}

export interface AdDraftActs {
  /** The owner typed an amount, miles or a date: the sentence and the press follow at once. */
  type: (patch: Partial<AdLocal>) => void;
  /** Ask the ad writer again: "Try again", "Let AI rewrite it", "Take the price out". */
  write: (noPrice?: boolean) => void;
  nextPicture: () => void;
  answer: (about: AdSpecialKind, answer: "no" | "yes") => void;
  tell: (words: string) => void;
  nextVersion: () => void;
  /** Read the draft again: after the one thing missing was added, or an answer that never came. */
  again: () => void;
  /** Turn on, as the press shows it. */
  turnOn: () => void;
}

/** The screen's presses, each over the draft as it stands when pressed. */
const draftActs = (io: Asking, afterTyping: (run: () => void) => void): AdDraftActs => ({
  type: (patch) => typeIntoDraft(io, patch, afterTyping),
  write: (noPrice = false) => {
    const held = draftNow(io);
    io.tried.current = 0;
    if (held) void writeWords(io, held, noPrice);
  },
  nextPicture: () => {
    const held = draftNow(io);
    if (held) void judgeDraft(io, held, "next_picture");
  },
  answer: (about, answer) => answerKindQuestion(io, about, answer),
  tell: (words) => void tellAiToChange(io, words),
  nextVersion: () => {
    const held = draftNow(io);
    if (held) io.show({ at: "draft", ...held, version: held.version + 1 });
  },
  again: () => {
    io.setOutcome(null);
    void openDraft(io);
  },
  turnOn: () => void turnOnDraft(io),
});

interface AdDraftHereNow {
  stand: AdStand;
  telling: boolean;
  told: AdTellResult | null;
  turning: boolean;
  refused: AdTurnRefused | null;
  acts: AdDraftActs;
}

/** A moment after the owner stops typing, what was asked for runs: once, for the last of the typing. */
function useAfterTyping(): (run: () => void) => void {
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  };
  useEffect(() => clear, []);
  return (run) => {
    clear();
    timer.current = window.setTimeout(run, JUDGE_AFTER_MS);
  };
}

/** The draft, while `open` says the screen is. */
export function useAdDraft(open: boolean, source: AdSource): AdDraftHereNow {
  const [stand, setStand] = useState<AdStand>({ at: "opening" });
  const [isTelling, setTelling] = useState(false);
  const [outcome, setOutcome] = useState<AdTellResult | null>(null);
  const now = useRef<AdStand>(stand);
  now.current = stand;
  const turns = useRef(0);
  const tried = useRef(0);
  const sets = useRef(0);
  const tellingNow = useRef(false);
  const opening = useRef(false);
  const [isTurning, setTurning] = useState(false);
  const [refused, setRefused] = useState<AdTurnRefused | null>(null);
  const turningNow = useRef(false);
  const pressKey = useRef<string | null>(null);
  const io = useMemo<Asking>(() => {
    const show = (next: AdStand) => {
      now.current = next;
      setStand(next);
    };
    const tellIs = (on: boolean) => {
      tellingNow.current = on;
      setTelling(on);
    };
    const turnIs = (on: boolean) => {
      turningNow.current = on;
      setTurning(on);
    };
    return {
      source,
      show,
      now,
      turns,
      tried,
      sets,
      tellingNow,
      opening,
      turningNow,
      pressKey,
      setTurning: turnIs,
      setRefused,
      setTelling: tellIs,
      setOutcome,
    };
  }, [source]);

  useEffect(() => {
    if (open) reopenDraft(io);
  }, [open, io]);

  const afterTyping = useAfterTyping();
  return {
    stand,
    telling: isTelling,
    told: outcome,
    turning: isTurning,
    refused,
    acts: draftActs(io, afterTyping),
  };
}
