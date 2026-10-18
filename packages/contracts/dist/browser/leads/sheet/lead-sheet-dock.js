import { clockDate, clockNear } from "../../shared/clock.js";
import { DAY_MS } from "../../shared/time.js";
import { capitalize } from "../../shared/words.js";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies.js";
import { holdWords, isReachOutHold } from "../../reach-out/reach-out-words.js";
import { sequenceLeftWords } from "../../sequences/sequence-words.js";
export const LEAD_PLACE_WORDS = {
  waiting: "Waits for your OK",
  held: "Held",
  to_send: "For you to send",
  replied: "Wrote back",
  next: "Up next",
  in: "In it",
  done: "Done",
  left: "Left"
};
const PENDING = /* @__PURE__ */ new Set(["planned", "claimed", "queued"]);
const ASKS_ANSWER = /* @__PURE__ */ new Set(["interested", "question"]);
const ASKS_FOR = 14 * DAY_MS;
const wroteBack = (t, nowMs) => t.readings.some(
  (r) => !r.undone && (r.claim === "person" || r.claim === "owner") && ASKS_ANSWER.has(r.intent) && nowMs - Date.parse(r.read_at) <= ASKS_FOR
);
const placeStepOf = (n) => n === null ? 1 : n + 1;
const NO_SEND = { sendId: null, hold: null, holdDetail: null, runId: null };
function pendingPlaceOf(sends, t, nowMs, tz) {
  const held = sends.find((s) => s.state === "held");
  if (held) {
    const hold = isReachOutHold(held.reason) ? held.reason : null;
    const step2 = placeStepOf(held.n);
    return {
      ...NO_SEND,
      group: "held",
      step: step2,
      sendId: held.id,
      hold,
      // What the check flagged ("the opening said “…”"), where the story carries it (00457): Decide shows it too.
      holdDetail: held.hold_detail ?? null,
      line: LEAD_PLACE_LINES.held(step2, hold && holdWords(hold, held.hold_detail ?? null))
    };
  }
  const drafted = sends.find((s) => s.state === "drafted");
  if (drafted) {
    const step2 = placeStepOf(drafted.n);
    return {
      ...NO_SEND,
      group: "to_send",
      step: step2,
      sendId: drafted.id,
      runId: drafted.run_id ?? null,
      line: LEAD_PLACE_LINES.toSend(step2)
    };
  }
  const pending = sends.find((s) => PENDING.has(s.state));
  if (!pending) return null;
  const step = placeStepOf(pending.n);
  if (pending.state === "planned" && t.chain && t.chain.waiting_run_id)
    return { ...NO_SEND, group: "waiting", step, line: LEAD_PLACE_LINES.waiting(step) };
  const when = pending.send_at ? clockNear(Date.parse(pending.send_at), tz, nowMs) : null;
  return { ...NO_SEND, group: "next", step, line: LEAD_PLACE_LINES.next(step, when) };
}
function leftWhyOf(t, sends) {
  const last = sends.at(-1);
  if (t.stopped_at) return "owner_stopped";
  if (t.closed_reason === "said_no") return "said_no";
  if (sends.some((s) => s.bounced)) return "bounced";
  if (t.booked_at) return "booked";
  return last && (last.state === "skipped" || last.state === "failed") ? last.reason ?? "removed" : null;
}
function settledPlaceOf(sends, t, nowMs, tz) {
  const last = sends.at(-1);
  const why = leftWhyOf(t, sends);
  if (why)
    return { ...NO_SEND, group: "left", step: placeStepOf(last ? last.n : null), line: LEAD_PLACE_LINES.left(why) };
  const gone = sends.filter((s) => s.left);
  const steps = t.chain && t.chain.steps ? t.chain.steps.length : 0;
  if (steps > 0 && gone.length >= steps) return { ...NO_SEND, group: "done", step: steps, line: LEAD_PLACE_LINES.done };
  const sent = gone.at(-1);
  const at = sent && sent.sent_at ? clockDate(Date.parse(sent.sent_at), tz, nowMs) : null;
  const step = placeStepOf(sent ? sent.n : null);
  return { ...NO_SEND, group: "in", step, line: LEAD_PLACE_LINES.in(step, at) };
}
export function leadSheetPlaceOf(t, nowMs, tz) {
  if (!t || !t.chain) return null;
  const sends = [...t.sends].sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
  if (wroteBack(t, nowMs)) {
    const last = sends.filter((s) => s.left).at(-1);
    return { ...NO_SEND, group: "replied", step: placeStepOf(last ? last.n : null), line: LEAD_PLACE_LINES.replied };
  }
  const ended = t.place && (t.place.state === "left" || t.place.state === "done") ? t.place : null;
  if (ended) {
    const step = placeStepOf(sends.filter((s) => s.left).at(-1)?.n ?? null);
    return ended.state === "done" ? { ...NO_SEND, group: "done", step, line: LEAD_PLACE_LINES.done } : { ...NO_SEND, group: "left", step, line: LEAD_PLACE_LINES.left(ended.why ?? "removed") };
  }
  const pending = pendingPlaceOf(sends, t, nowMs, tz);
  if (pending) return pending;
  if (sends.length === 0 && !t.stopped_at && t.closed_reason !== "said_no")
    return { ...NO_SEND, group: "next", step: 1, line: LEAD_PLACE_LINES.queued };
  return settledPlaceOf(sends, t, nowMs, tz);
}
const LEAD_PLACE_LINES = {
  /** The card's headline says what they wrote and where it is answered; the box says only what the sequence did. */
  replied: "Stopped for them",
  held: (step, why) => why ? `Step ${step} held: ${why}` : `Step ${step} is held by the check`,
  toSend: (step) => `Step ${step} is drafted for you to send yourself`,
  waiting: (step) => `Step ${step} waits for your OK with the rest of its batch`,
  next: (step, when) => when ? `Step ${step} ${when}` : `Step ${step} is planned`,
  in: (step, at) => at ? `Step ${step} sent ${at}` : `Step ${step} is next, after its wait`,
  queued: "Step 1 goes in its next batch",
  done: "Every step went",
  /** Why, alone: the word beside the name and the box's verb already say Left. */
  left: (why) => capitalize(sequenceLeftWords(why))
};
const LEAD_CANT_JOIN_WORDS = {
  callFirst: "Call first",
  notYet: "Can't join yet"
};
const NEEDS_YOU = /* @__PURE__ */ new Set(["waiting", "held", "to_send", "replied"]);
export function leadSheetWordOf(p) {
  if (p.place) {
    const g = p.place.group;
    return { word: LEAD_PLACE_WORDS[g], tone: NEEDS_YOU.has(g) ? "warn" : g === "next" || g === "in" ? "ok" : "plain" };
  }
  switch (p.state) {
    case "review":
      return { word: "To review", tone: "warn" };
    case "replied":
      return { word: LEAD_PLACE_WORDS.replied, tone: "warn" };
    case "elsewhere":
    case "sequence":
      return { word: LEAD_PLACE_WORDS.in, tone: "ok" };
    case "closed":
      return { word: p.closed ? p.closed.title : LEAD_PLACE_WORDS.left, tone: "plain" };
    case "phone":
      return { word: LEAD_CANT_JOIN_WORDS.callFirst, tone: "warn" };
    default:
      return p.blocked ? { word: LEAD_CANT_JOIN_WORDS.notYet, tone: "warn" } : { word: "Ready", tone: "plain" };
  }
}
const LEAD_BOX_WORDS = {
  joins: "Joins",
  in: "In",
  left: "Left",
  cantJoin: LEAD_CANT_JOIN_WORDS.notYet,
  /** Sequences take leads you add, and none is chosen for this search yet: Change, beside it, picks one. */
  choose: "Choose where they go",
  goesWith: "Goes with",
  none: "No sequence takes leads you add",
  /** While their story or the sequences are still being read: nothing said yet that the reads could take back. */
  reading: "Reading where they stand",
  noneLine: "Make one in Sequences; you come back here",
  afterOk: "Step 1 after your OK",
  /** Step 1 by its subject as this lead would get it (the refined canvas): "Step 1, “A quieter phone”, after your OK". */
  afterOkNamed: (subject) => `Step 1, \u201C${subject}\u201D, after your OK`,
  onceKept: "Once you keep it",
  inNextBatch: "In its next batch",
  /** No email to write to: no sequence is named, since none could take them (a sequence to leads writes email). */
  phoneOnly: "Needs an email to join a sequence. Call them instead.",
  elsewhere: "A business is written to once, so this one stays with that sequence"
};
export function leadSheetBoxOf(p) {
  const B = LEAD_BOX_WORDS;
  if (p.inSequence && p.place) {
    const verb = p.place.group === "left" ? B.left : B.in;
    return { verb, name: p.inSequence.name, rootId: p.inSequence.rootId, line: p.place.line, change: false };
  }
  if (p.reading) return { verb: null, name: null, rootId: null, line: B.reading, change: false };
  if (p.state === "elsewhere" && p.elsewhere)
    return { verb: B.in, name: p.elsewhere.name, rootId: p.elsewhere.rootId, line: B.elsewhere, change: false };
  if (p.state === "closed" && p.closed)
    return { verb: null, name: null, rootId: null, line: `${p.closed.title}. ${p.closed.line}`, change: false };
  if (p.searchWrites)
    return {
      verb: B.goesWith,
      name: p.searchWrites.name,
      rootId: p.searchWrites.rootId,
      line: B.inNextBatch,
      change: false
    };
  if (p.state === "phone") return { verb: null, name: null, rootId: null, line: B.phoneOnly, change: false };
  if (p.unchosen) return { verb: null, name: null, rootId: null, line: B.choose, change: p.canChange };
  if (!p.target) return { verb: null, name: null, rootId: null, line: `${B.none}. ${B.noneLine}`, change: false };
  const t = { name: p.target.name, rootId: p.target.rootId, change: p.canChange };
  if (p.blocked) return { ...t, verb: B.cantJoin, line: p.blocked };
  const after = p.firstSubject ? B.afterOkNamed(p.firstSubject) : B.afterOk;
  return { ...t, verb: B.joins, line: p.state === "review" ? B.onceKept : after };
}
export const LEAD_DOCK_WORDS = {
  /** The dock names where Add goes (the refined canvas, decision 04), so a wrong default shows before the press. */
  ready: { line: (sequence) => `Joins ${sequence}`, fact: "Nothing goes until you approve" },
  checking: { line: "Checking their mailbox", fact: "Add waits a few seconds" },
  reading: { line: "Reading where they stand", fact: "A moment" },
  noEmail: { line: "No email to write to", fact: "Call them" },
  /** Add is off in the sequence chosen: its reason is the fact, and Not a fit and Later stay. */
  cantJoin: { line: LEAD_CANT_JOIN_WORDS.notYet },
  /** None chosen for this search: Change, in the box above, picks one; Not a fit and Later stay. */
  choose: { line: "Which sequence?", fact: "Change, above, picks where they go" },
  elsewhere: { line: "One sequence at a time", fact: "Take them out there to add them here" },
  noSequence: { line: "Nothing to add to yet", fact: "Starts from this lead, and comes back" },
  review: { line: "To review", fact: "Keep counts it, and sends it on" },
  waiting: { line: "Waits for your OK", fact: "A batch, so in the sequence" },
  held: { line: "Held by the check", fact: "Its email, decided here" },
  toSend: { line: "Yours to send", fact: "From your own inbox" },
  search: { line: "Goes in its next batch", fact: "Not a fit is how one stays out" },
  first: { line: "On a new list of this pile's", fact: "You write to them once, at the end" },
  replied: (intent, at) => ({
    line: "Wrote back",
    fact: [intent, at].filter(Boolean).join(" \xB7 ") || "Answer them in the Inbox"
  }),
  approve: "Approve",
  decide: "Decide",
  openDraft: "Open the draft",
  answer: "Answer",
  call: "Call",
  add: "Add",
  later: "Later",
  notFit: "Not a fit",
  keep: "Keep",
  exclude: "Leave out",
  openIt: "Open it",
  newSequence: "New sequence",
  itsSequence: "Its sequence",
  hold: "Add to a new list",
  putBack: "Put back",
  ready_: "Move back to Ready",
  /** Held, decided here (the canvas's HeldDecide): the same choices, and the same verb, as the sequence's Leads tab. */
  decideAsk: "What to do with its email?",
  decideOnly: (sequence) => `Only this one email. The rest of its batch waits in \u201C${sequence}\u201D.`,
  /** What the check flagged, said before the choices, so a held email is never decided blind. */
  decideFlag: (hold, detail) => `${capitalize(holdWords(hold, detail))}.`,
  back: "Back",
  /** The desk's key row under the dock: in a pile, the dock's own keys and Undo; out of one, J and K walk the rows. */
  undoKey: "undo",
  moveKeys: "next, before"
};
const dockAct = (a, label, icon, key = null, off = null) => ({ act: a, label, icon, key, sub: null, off });
const dockLaterOf = (f) => f.canLater ? [dockAct("later", LEAD_DOCK_WORDS.later, "clock", "l")] : [];
function placeDock(f, place) {
  const D = LEAD_DOCK_WORDS;
  const dock = (w, acts) => ({
    ...w,
    waiting: false,
    x: false,
    acts
  });
  if (place.group === "waiting") return dock(D.waiting, [dockAct("approve", D.approve, "chevron", "a")]);
  if (place.group === "held") return dock(D.held, [dockAct("decide", D.decide, "chevron", "a")]);
  if (place.group === "to_send") return dock(D.toSend, [dockAct("open_draft", D.openDraft, "send", "a")]);
  if (place.group === "replied") return repliedDock(f);
  return null;
}
function repliedDock(f) {
  const D = LEAD_DOCK_WORDS;
  const r = f.reply;
  const intent = r && isReplyIntent(r.intent) ? capitalize(REPLY_INTENT_WORDS[r.intent]) : null;
  const at = r ? clockNear(Date.parse(r.readAt), f.tz, f.nowMs) : null;
  return {
    ...D.replied(intent, at),
    waiting: false,
    x: false,
    acts: [...f.canCall ? [dockAct("call", D.call, "phone", "c")] : [], dockAct("thread", D.answer, "chat", "a")]
  };
}
function readyDock(f) {
  const D = LEAD_DOCK_WORDS;
  const x = dockAct("not_a_fit", D.notFit, "x", "n");
  if (f.pile === "search")
    return { ...D.search, waiting: false, x: true, acts: [x, dockAct("sequence", D.itsSequence, "external")] };
  if (f.pile === "first")
    return { ...D.first, waiting: false, x: true, acts: [x, ...dockLaterOf(f), dockAct("hold", D.hold, "plus", "a")] };
  if (f.unchosen) return { ...D.choose, waiting: false, x: true, acts: [x, ...dockLaterOf(f)] };
  if (!f.target)
    return {
      ...D.noSequence,
      waiting: false,
      x: true,
      acts: [x, ...dockLaterOf(f), dockAct("new_sequence", D.newSequence, "chevron", "a")]
    };
  if (f.state === "finding")
    return { ...D.checking, waiting: true, x: true, acts: [x, dockAct("add", D.add, "plus", "a", D.checking.fact)] };
  if (f.blocked)
    return { line: D.cantJoin.line, fact: f.blocked, waiting: false, x: true, acts: [x, ...dockLaterOf(f)] };
  return {
    line: D.ready.line(f.target),
    fact: D.ready.fact,
    waiting: false,
    x: true,
    acts: [x, ...dockLaterOf(f), dockAct("add", D.add, "plus", "a")]
  };
}
export function leadSheetDockOf(f) {
  const D = LEAD_DOCK_WORDS;
  if (f.place) return placeDock(f, f.place);
  if (f.reading) return { ...D.reading, waiting: true, x: false, acts: [] };
  switch (f.state) {
    case "review":
      return {
        ...D.review,
        waiting: false,
        x: false,
        acts: [dockAct("exclude", D.exclude, "ban", "n"), dockAct("keep", D.keep, "check", "a")]
      };
    case "phone":
      return f.canCall ? {
        ...D.noEmail,
        waiting: false,
        x: true,
        // Call is C, as on Wrote back: A is Add everywhere else, and a fast pile must never dial.
        acts: [dockAct("not_a_fit", D.notFit, "x", "n"), ...dockLaterOf(f), dockAct("call", D.call, "phone", "c")]
      } : null;
    case "elsewhere":
      return { ...D.elsewhere, waiting: false, x: false, acts: [dockAct("sequence", D.openIt, "chevron", "a")] };
    case "replied":
      return repliedDock(f);
    case "sequence":
      return null;
    case "closed": {
      const fix = f.closed ? f.closed.fix : null;
      if (!f.closed || !fix) return null;
      const one = fix === "put_back" ? dockAct("put_back", D.putBack, "undo", "a") : fix === "ready" ? dockAct("ready", D.ready_, "undo", "a") : dockAct("call", D.call, "phone", "c");
      return { line: f.closed.title, fact: f.closed.line, waiting: false, x: false, acts: [one] };
    }
    default:
      return readyDock(f);
  }
}
export function leadLinePlaceOf(l, chainWaits, nowMs, tz) {
  const W = LEAD_PLACE_WORDS;
  const r = l.reply;
  const person = r && !r.undone && r.claim !== "auto_reply";
  if (person && ASKS_ANSWER.has(r.intent))
    return { word: W.replied, tone: "warn", line: clockNear(Date.parse(r.read_at), tz, nowMs) };
  if (l.held) return { word: W.held, tone: "warn", line: null };
  if ((l.drafted ?? 0) > 0) return { word: W.to_send, tone: "warn", line: null };
  const why = l.stopped_at ? "owner_stopped" : l.closed_reason === "said_no" || person && r.intent === "no" ? "said_no" : l.bounced ? "bounced" : l.booked_at ? "booked" : null;
  if (why) return { word: W.left, tone: "plain", line: sequenceLeftWords(why) };
  const next = l.next_at ? Date.parse(l.next_at) : NaN;
  if (l.sent === 0 && chainWaits && (l.added_at || Number.isFinite(next)))
    return { word: W.waiting, tone: "warn", line: null };
  if (Number.isFinite(next)) return { word: W.next, tone: "ok", line: clockNear(next, tz, nowMs) };
  if (l.sent > 0) {
    const last = l.last_sent_at ? Date.parse(l.last_sent_at) : NaN;
    return { word: W.in, tone: "ok", line: Number.isFinite(last) ? `sent ${clockNear(last, tz, nowMs)}` : null };
  }
  return null;
}
