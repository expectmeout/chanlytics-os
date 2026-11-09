/** The turn: a question asked, what its stream sends, and what is done as it lands. */
import type { AskAnswer, AskAttached, AskMessageVM, AskScope, AskThreadVM, PageContext } from "@chanlytics/contracts";
import type { SendEvent } from "@/bridge/ask";
import type { AskedHow, Conversation, Line, Turn } from "./types";
import { withAnswerLanded } from "@chanlytics/contracts";
import { allArrived, photosAsked } from "./attached";
import { arFailed, arPhone, arRoute } from "./place";

/** A phone lets go of the field as a question is asked, and its keyboard: the answer lands to be read, never dimmed (D4). */
const arLetGo = (el: HTMLElement | null) => {
  if (arPhone() && el && typeof el.blur === "function") el.blur();
};

// A quick question (contracts askIntent): answered from what the page holds, with no model, as the first turn of a
// conversation, kept as it is drawn (A.keepQuick: in the thread whose first question it repeats, else a new one), whose
// id the conversation takes as it lands (`kept`). A later question, a conversation opened or Clear meanwhile: not drawn.
const arQuickTurn = async (ln: Line, q: string, pending: Promise<AskAnswer>, spoken: boolean) => {
  const { A, M, turnSeq, threads, threadsReady, setQuick, setActive, setThreads } = ln;
  const mine = ++turnSeq.current;
  setQuick({ q, pending: true });
  const answer = await pending;
  if (mine !== turnSeq.current) return;
  const kept = (threadsReady.current || Promise.resolve(threads))
    .then((list: AskThreadVM[]) =>
      A.keepQuick({ text: q, answer, threadId: (list.find((th) => A.sameQuestion(th.title, q)) || {}).id || null }),
    )
    .catch(() => null);
  const m = { atMs: Date.now(), citations: [], followups: [], proposals: [] };
  setQuick(null);
  setActive({
    id: null,
    title: q,
    scope: null,
    kept,
    messages: [
      { ...m, id: "u-" + m.atMs, role: "user", text: q } as Partial<AskMessageVM> as AskMessageVM,
      {
        ...m,
        id: "k-" + m.atMs,
        role: "assistant",
        text: A.answerText(answer),
        answer,
      } as Partial<AskMessageVM> as AskMessageVM,
    ],
  });
  void kept.then((th) => {
    if (th) {
      setActive((prev) => (prev && prev.kept === kept ? { ...prev, id: th.id, title: th.title } : prev));
      void A.threads().then(setThreads);
    }
  });
  M.mood.set("idle");
  M.mood.react("nod");
  if (spoken) arAnswerAloud(ln, A.answerSpoken(answer));
};
/** A conversation a quick answer opened, once its turn is kept: in the thread it landed in, or in none if it was not. */
const arKept = async (c: Conversation): Promise<Conversation> => {
  const th = await c.kept;
  return { ...c, kept: null, ...(th ? { id: th.id, title: th.title } : {}) };
};

/** The thread whose first question this one repeats, opened with the chip it is asked with, not the twin's stored scope. */
const arTwinOf = async (
  { A, threads, threadsReady, openThread, setScope }: Line,
  q: string,
  chip: AskScope | null,
): Promise<Conversation | null> => {
  const list = await (threadsReady.current || Promise.resolve(threads));
  const twin = list.find((th) => A.sameQuestion(th.title, q));
  if (!twin) return null;
  const opened = await openThread(twin);
  if (chip) setScope(chip);
  return opened;
};

/** What a question goes with: what stands beside the field; a Retry brings what it first came with, and a page's own search goes alone. */
const arFilesAsked = (attached: Line["attached"], how: AskedHow | undefined): readonly AskAttached[] =>
  how?.files ?? (how?.fresh ? [] : photosAsked(attached));

/** The page, as it is now: the rows on screen and the row the words name, if they name one -- in the thread it joins, by its last answer's items first (bridge/ask/context.ts). A page that cannot say what it holds sends none: the question still goes. */
const arPageNow = (A: Line["A"], q: string, base: Conversation | null): PageContext | null => {
  try {
    return A.context ? A.context(arRoute(), q, base && base.messages) : null;
  } catch {
    return null;
  }
};

// One turn: the question goes in, the words stream back, the answer lands. A quick question needs no model (arQuickTurn).
// A question that repeats a thread's first question resumes that thread rather than opening a twin. `turn` is what the
// stream writes and the landing reads: its thread's id, the final message, and what it has said. Asking (as opening
// another conversation does) stops an answer read aloud, which went on over the next one (D14).
export const arSubmitter = (ln: Line) => {
  const {
    A,
    query,
    live,
    active,
    turnSeq,
    scope,
    surface,
    openedAt,
    inputRef,
    speech,
    attached,
    clearAttached,
    flash,
    t,
    setQuery,
    setView,
    setLang,
    setQuick,
  } = ln;
  const submit = async (qArg?: unknown, chipArg?: AskScope | null, how?: AskedHow) => {
    const q = (typeof qArg === "string" ? qArg : query).trim(),
      chip = chipArg !== undefined ? chipArg : scope; // a seed names its opening's chip; `how.spoken` marks a question the recogniser heard
    if (live) return;
    const fromField = !how?.files && !how?.fresh;
    if (fromField && !allArrived(attached)) {
      flash({ msg: <>{t.attachWait}</> });
      return;
    }
    const files = arFilesAsked(attached, how);
    if (!q && files.length === 0) return;
    arLetGo(inputRef.current);
    speech.stop();
    const spoken = !!(how && how.spoken),
      following = (how && how.following) || null,
      held = how && how.fresh ? null : active; // `how.following`: the follow-up of Ask's home's row, which the route clears; `how.fresh`: a page's own search (Leads' first day), a conversation of its own, never the one the Line still holds (Ruben, 23 Oct 2026)
    setQuery("");
    if (fromField) clearAttached();
    setView("rows");
    setLang(A.language(q));
    const pending = held || following || files.length ? null : A.quick(q);
    if (pending) return arQuickTurn(ln, q, pending, spoken);
    setQuick(null);
    let base = held && held.kept ? await arKept(held) : held; // asked once a quick turn is kept, which it reads
    if (!base && !files.length) base = await arTwinOf(ln, q, chip);
    const { thread, turn } = arBeginTurn(ln, { q, files, chip, base, how: { spoken } });
    // Spoken: Ask's voice says it is working, once, if the answer has not begun by then (ask/aloud.ts).
    if (spoken) speech.wait(A.language(q), () => turn.spoke || !!turn.final || turn.mine !== turnSeq.current);
    const context = arPageNow(A, q, base);
    await A.send(
      {
        text: q,
        threadId: turn.threadId,
        scope: thread.scope,
        surface,
        following: following ? { id: following } : null,
        openedMs: openedAt.current ? Date.now() - openedAt.current : null,
        context,
        files: files.map((f) => f.id),
        ...(q ? {} : { language: A.language() }),
        signal: turn.ctl.signal,
      },
      (ev) => arTurnHeard(ln, turn, ev),
    );
    arTurnLanded(ln, turn);
  };
  return submit;
};

/** What the stream sends: its thread, named on the conversation it began while that is open (stopped too: the next question carries on in it); then, while the turn is the current one, a read that landed, the Say so far, the words, the end. */
const arTurnHeard = ({ M, turnSeq, setActive, setLive }: Line, turn: Turn, ev: SendEvent) => {
  if (ev.t === "thread") {
    turn.threadId = ev.id;
    setActive((prev) =>
      prev && prev.messages.some((m) => m.id === turn.qid)
        ? { ...prev, id: ev.id, title: prev.title || ev.title }
        : prev,
    );
    return;
  }
  if (turn.mine !== turnSeq.current) return;
  if (ev.t === "trace") {
    setLive((prev) => (prev ? { ...prev, traces: [...prev.traces, ev.text].slice(-3) } : prev));
    // a read that landed: the three's orbit surges and a light runs down them (mascot mood.ts pulse)
    M.mood.pulse(0.7);
    return;
  }
  if (ev.t === "say") {
    // The answer's Say as written so far: it replaces what was drawn; the final message is the answer. An empty one takes back an answer the server set aside, and the reads show again.
    const back = !ev.headline && !ev.detail;
    setLive((prev) =>
      prev ? { ...prev, say: back ? null : { headline: ev.headline, detail: ev.detail, show: ev.show || null } } : prev,
    );
    if (!back) turn.spoke = true;
    const len = ev.headline.length + ev.detail.length;
    if (len > turn.said) M.mood.beat(Math.min(1, (len - turn.said) / 6));
    turn.said = len;
    return;
  }
  if (ev.t === "delta") {
    setLive((prev) => (prev ? { ...prev, text: prev.text + ev.text } : prev));
    turn.spoke = true;
    M.mood.beat(Math.min(1, ev.text.length / 6));
    return;
  }
  if (ev.t === "final") turn.final = ev.message;
  else if (ev.t === "error") turn.final = arFailed("e-" + Date.now(), ev.text);
};

/** The turn done, if still the current one: the answer on the line, the thread's title read again, and the answer's `now` place gone to. */
const arTurnLanded = (
  { A, M, t, turnSeq, setLive, setActive, setThreads, buzz, nav, speech, flash }: Line,
  turn: Turn,
) => {
  if (turn.mine !== turnSeq.current) return;
  const final = turn.final ?? arFailed("e-" + Date.now(), t.cutOff);
  turn.final = final;
  setLive(null);
  buzz(8);
  // Done: a failure shakes; an answer that streamed nods on its own as the row settles, one that did not nods here.
  M.mood.set("idle");
  if (final.failed) M.mood.react("shake");
  else if (!turn.spoke) M.mood.react("nod");
  setActive((prev) =>
    prev
      ? { ...prev, id: turn.threadId || prev.id, messages: withAnswerLanded(prev.messages, final, Date.now()) }
      : prev,
  ); // a search card the answer made sets aside the one waiting above it, as the route kept it (contracts withAnswerLanded)
  if (turn.spoken && !final.failed) arAnswerAloud({ speech, flash, t }, A.answerSpoken(A.answer(final).answer));
  if (turn.threadId)
    void A.threads().then((list: AskThreadVM[]) => {
      setThreads(list);
      const now = list.find((x) => x.id === turn.threadId);
      if (now) setActive((prev) => (prev && prev.id === turn.threadId ? { ...prev, title: now.title } : prev));
    });
  // "Open the 3:34 AM call": the app goes there as the answer lands (the answer's `now`, section 5.1).
  const o = final.failed
    ? null
    : final.answer
      ? final.answer.do.open
      : final.navigate && final.navigate.to
        ? final.navigate
        : null;
  if (o && o.now) setTimeout(() => nav(o.to), 250);
};
// A question spoken is answered aloud by itself (the spec's §3.5 as amended 4 and 5 Oct): the words Read aloud would
// read, in Ask's voice, after the line it says while it works (ask/aloud.ts); a typed one stays quiet.
const arAnswerAloud = ({ speech, flash, t }: Pick<Line, "speech" | "flash" | "t">, say: string) => {
  if (say && speech.canSpeak)
    void speech.answer(say).then((why: string | null) => {
      if (why !== null) flash({ tone: "danger", msg: <>{why || t.readFailed}</> });
    });
};

// A turn begun on the Line, typed or spoken: the question on its thread (the conversation open, else a new one) and the
// turn's record, which the stream writes and the landing reads.
const arBeginTurn = (
  { turnSeq, setActive, setLive }: Line,
  {
    q,
    files,
    chip,
    base,
    how,
  }: { q: string; files: readonly AskAttached[]; chip: AskScope | null; base: Conversation | null; how: AskedHow },
) => {
  const userMsg = {
    id: "u-" + Date.now(),
    role: "user",
    text: q,
    ...(files.length ? { files } : {}),
    atMs: Date.now(),
    citations: [],
    followups: [],
    proposals: [],
  } as Partial<AskMessageVM> as AskMessageVM;
  const thread = base
    ? { ...base, messages: [...base.messages, userMsg], scope: chip || base.scope || null }
    : { id: null, title: q, messages: [userMsg], scope: chip || null }; // asked with the chip's scope, else the thread's own, which it then holds (the Phase 5 plan, D9)
  setActive(thread);
  const turn = {
    mine: ++turnSeq.current,
    threadId: thread.id,
    qid: userMsg.id,
    ctl: new AbortController(),
    final: null,
    spoke: false,
    said: 0,
    spoken: !!how.spoken,
  };
  setLive({ q, files, text: "", say: null, traces: [], turn, at: Date.now() }); // the turn in flight: Stop lets go of it (ctl), its thread is named on its question's conversation (qid)
  return { thread, turn };
};
