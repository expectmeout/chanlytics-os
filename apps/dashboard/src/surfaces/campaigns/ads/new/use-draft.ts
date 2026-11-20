/**
 * What New ad's screen holds, and what its presses do (the Ads plan's 4.6 and G18). The draft is the screen's own until
 * Turn on: the server keeps none, and judges it afresh each time it is asked.
 *
 *  - Opened, it asks for the draft: the sentence is there the moment that answers, with no model in its way. Then it
 *    asks the ad writer for the words, once. Words that failed the checks are asked for once more, and after that the
 *    screen says it could not write them.
 *  - What the owner sets is theirs. The amount, the miles, the date and an answer to the draft's question show at once
 *    (the press follows with them), and the draft is judged again a moment after they stop. An answer from the server
 *    brings the draft as it was sent: it never overwrites what the owner set while it was on its way.
 *  - While the ad writer is out, what the owner sets waits and is judged as the words land. A change the words are
 *    written from (another picture) asks the writer again.
 *  - The draft, with its words, is kept for the tab: closed and opened again, or the page loaded again, it is the same
 *    draft, and the writer is not asked twice.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { AdSpecialKind } from "@chanlytics/contracts";
import type { AdCantDraft, AdDraftAnswer, AdDraftState, AdWordsAnswer } from "@/server/ads/draft-shape";
import type { AdDraftHere, AdLocal, AdTold, AdWordsHere } from "./model";
import type { AdSource } from "./source";

/** A draft as the screen holds it. */
interface Held {
  answer: AdDraftHere;
  local: AdLocal;
  words: AdWordsHere;
  version: number;
}

/** Where the screen stands. */
export type AdStand =
  { at: "opening" } | { at: "failed" } | { at: "missing"; missing: AdCantDraft } | ({ at: "draft" } & Held);

/** How long after the owner stops typing the draft is judged again. */
const JUDGE_AFTER_MS = 500;

/**
 * The drafts kept for this tab, by where they were made: the workspace's own, and the page's example. Each is in the
 * tab's own storage too, so a page loaded again opens the same draft; where storage is blocked (a private window) it
 * is kept for as long as the page is.
 */
const kept = new Map<string, Held>();
const KEPT_KEY = "ads-new-draft";
/** The shape a kept draft is in: one kept in another shape is let go, and a fresh one is drafted. */
const KEPT_SHAPE = 1;

const keyOf = (source: AdSource): string =>
  `${typeof window === "undefined" ? "" : window.location.pathname.split("/").slice(0, 3).join("/")}:${source.sample ? "sample" : "live"}`;

const isKept = (value: unknown): value is { shape: number; held: Held } =>
  typeof value === "object" &&
  value !== null &&
  "shape" in value &&
  value.shape === KEPT_SHAPE &&
  "held" in value &&
  typeof value.held === "object" &&
  value.held !== null;

function keptOf(key: string): Held | null {
  const here = kept.get(key);
  if (here) return here;
  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(`${KEPT_KEY}:${key}`) ?? "null");
    return isKept(stored) ? stored.held : null;
  } catch {
    // Storage can be blocked, or hold something that is no draft: then none is kept.
    return null;
  }
}

function keep(key: string, held: Held | null): void {
  if (held) kept.set(key, held);
  else kept.delete(key);
  try {
    if (held) window.sessionStorage.setItem(`${KEPT_KEY}:${key}`, JSON.stringify({ shape: KEPT_SHAPE, held }));
    else window.sessionStorage.removeItem(`${KEPT_KEY}:${key}`);
  } catch {
    // Storage can be blocked: the draft is still kept for as long as the page is.
  }
}

const localOf = (answer: AdDraftHere): AdLocal => ({
  total_minor: answer.draft.total_minor,
  miles: answer.draft.miles,
  end_day: answer.draft.end_day,
  answers: answer.draft.answers,
});

/** The draft as it is sent: the server's own, with what the owner has set since. */
const sentOf = (held: Pick<Held, "answer" | "local">): AdDraftState => ({
  service: held.answer.draft.service,
  picture: held.answer.draft.picture.id,
  versions: held.answer.draft.versions,
  ...held.local,
});

const wordsOf = (answer: AdDraftHere): AdWordsHere =>
  answer.draft.versions.length > 0 ? { at: "written" } : { at: "writing" };

const standOf = (answer: AdDraftAnswer | null): AdStand => {
  if (answer === null) return { at: "failed" };
  if (!answer.can) return { at: "missing", missing: answer.missing };
  return { at: "draft", answer, local: localOf(answer), words: wordsOf(answer), version: 0 };
};

/** What "Tell AI" came to, from the writer's answer. */
function toldOf(answer: AdWordsAnswer): AdTold {
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
}

/** The amount, miles, date and answers to hold as an answer lands: the owner's own where they set one since the ask. */
const localAfter = (io: Asking, answer: AdDraftHere, setsAt: number): AdLocal =>
  io.sets.current !== setsAt && io.now.current.at === "draft" ? io.now.current.local : localOf(answer);

/** The ad writer, asked for the draft's words: once, and once more where its words failed the checks. */
async function writeWords(io: Asking, held: Held, noPrice = false): Promise<void> {
  const turn = ++io.turns.current;
  const setsAt = io.sets.current;
  io.show({ at: "draft", ...held, words: { at: "writing" } });
  const answer = await io.source.words({ job: "write", draft: sentOf(held), ...(noPrice ? { no_price: true } : {}) });
  if (turn !== io.turns.current) return;
  if (answer === null || !answer.can) {
    const local = io.now.current.at === "draft" ? io.now.current.local : held.local;
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
  const answer = await io.source.draft({ draft: sentOf(held), ...(act ? { act } : {}) });
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

/** A fresh draft: the sentence the moment the server answers, then its words, asked for once. */
async function openDraft(io: Asking): Promise<void> {
  const turn = ++io.turns.current;
  io.tried.current = 0;
  io.show({ at: "opening" });
  const first = standOf(await io.source.draft({}));
  if (turn !== io.turns.current) return;
  io.show(first);
  if (first.at === "draft" && first.words.at === "writing") return writeWords(io, first);
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
  /** Read the draft again from nothing: after the one thing missing was added, or an answer that never came. */
  again: () => void;
  /** Let the kept draft go: it was turned on, where that can be done. */
  forget: () => void;
}

interface AdDraftHereNow {
  stand: AdStand;
  telling: boolean;
  told: AdTold | null;
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
  const [telling, setTelling] = useState(false);
  const [outcome, setOutcome] = useState<AdTold | null>(null);
  const now = useRef<AdStand>(stand);
  now.current = stand;
  const turns = useRef(0);
  const tried = useRef(0);
  const sets = useRef(0);
  const io = useMemo<Asking>(() => {
    const show = (next: AdStand) => {
      now.current = next;
      setStand(next);
      if (next.at === "draft") {
        const { answer, local, words, version } = next;
        keep(keyOf(source), { answer, local, words, version });
      }
    };
    return { source, show, now, turns, tried, sets };
  }, [source]);

  // Opened: the draft kept for the tab where there is one, judged again as the business now stands; else a fresh one.
  useEffect(() => {
    if (!open) return;
    const had = keptOf(keyOf(io.source));
    if (!had) {
      void openDraft(io);
      return;
    }
    // Still on the page with its writer out: the answer on its way is this draft's, and the writer is not asked twice.
    if (now.current.at === "draft" && now.current.words.at === "writing") return;
    io.show({ at: "draft", ...had });
    void (had.words.at === "writing" ? writeWords(io, had) : judgeDraft(io, had));
  }, [open, io]);

  const afterTyping = useAfterTyping();
  const draftNow = (): Held | null => (now.current.at === "draft" ? now.current : null);
  /** The owner set something: it shows at once, and is theirs over any answer already on its way. */
  const setLocal = (patch: Partial<AdLocal>): Held | null => {
    const held = draftNow();
    if (!held) return null;
    sets.current += 1;
    const next: Held = { ...held, local: { ...held.local, ...patch } };
    io.show({ at: "draft", ...next });
    return next;
  };
  const acts: AdDraftActs = {
    type: (patch) => {
      if (!setLocal(patch)) return;
      afterTyping(() => {
        const latest = draftNow();
        // While the writer is out, what was typed is judged as its words land.
        if (latest && latest.words.at !== "writing") void judgeDraft(io, latest);
      });
    },
    write: (noPrice = false) => {
      const held = draftNow();
      tried.current = 0;
      if (held) void writeWords(io, held, noPrice);
    },
    nextPicture: () => {
      const held = draftNow();
      if (held) void judgeDraft(io, held, "next_picture");
    },
    answer: (about, answer) => {
      const held = draftNow();
      const next = held ? setLocal({ answers: { ...held.local.answers, [about]: answer } }) : null;
      if (next && next.words.at !== "writing") void judgeDraft(io, next);
    },
    tell: (words) => {
      const held = draftNow();
      if (!held || telling) return;
      const turn = ++turns.current;
      setTelling(true);
      setOutcome(null);
      void source.words({ job: "change", draft: sentOf(held), asked: words }).then((answer) => {
        setTelling(false);
        if (turn !== turns.current) return;
        if (answer === null) {
          setOutcome({ kind: "failed" });
          // A writer this ask overtook is asked again, so its words still come.
          if (held.words.at === "writing") void writeWords(io, held);
          return;
        }
        if (!answer.can) return io.show(standOf(answer));
        setOutcome(toldOf(answer));
        const next: Held = { answer, local: localOf(answer), words: wordsOf(answer), version: 0 };
        // A new service waits for its own words: the writer is asked for them next.
        if (next.words.at === "writing") return void writeWords(io, next);
        io.show({ at: "draft", ...next });
      });
    },
    nextVersion: () => {
      const held = draftNow();
      if (held) io.show({ at: "draft", ...held, version: held.version + 1 });
    },
    again: () => {
      keep(keyOf(source), null);
      setOutcome(null);
      void openDraft(io);
    },
    forget: () => {
      keep(keyOf(source), null);
      setOutcome(null);
    },
  };
  return { stand, telling, told: outcome, acts };
}
