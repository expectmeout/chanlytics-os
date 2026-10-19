import { clockDate, clockNear } from "../../shared/clock.js";
import { REPLY_INTENT_WORDS, isReplyIntent } from "../../reach-out/reach-out-replies.js";
import { PLACE_WORDS, placeToneOf } from "../../sequences/sequence-place.js";
import { sheetSlot as slot } from "./lead-sheet.js";
export function leadSheetWordOf(p) {
  if (p.place) return { word: PLACE_WORDS[p.place.place.group], tone: placeToneOf(p.place.place.group) };
  switch (p.state) {
    case "review":
      return { word: "To review", tone: "warn" };
    case "replied":
      return { word: PLACE_WORDS.replied, tone: "warn" };
    case "elsewhere":
    case "sequence":
      return { word: PLACE_WORDS.in, tone: "ok" };
    case "closed":
      return { word: p.closed ? p.closed.title : PLACE_WORDS.left, tone: "plain" };
    case "phone":
      return { word: "Call first", tone: "warn" };
    default:
      return { word: "To decide", tone: "plain" };
  }
}
export const LEAD_DOCK_WORDS = {
  notFit: "Not a fit",
  later: "Later",
  addTo: (name) => `Add to ${name}`,
  addToOne: "Add to a sequence",
  choose: "Choose where it goes",
  checking: "Checking the mailbox\u2026",
  noEmail: { line: "No email", fact: "Phone only" },
  call: "Call",
  moveTo: (name) => `Move to ${name}`,
  inOther: (name) => ({ line: `In ${name}`, fact: "Nothing sent to them yet" }),
  writtenBy: (name) => ({ line: `Written to by ${name}`, fact: "A business gets one sequence" }),
  open: (name) => `Open ${name}`,
  putBack: "Put back",
  ready: "Move back to Ready",
  review: { line: "To review", fact: "Keep it on the search?" },
  exclude: "Leave out",
  keep: "Keep",
  waiting: (step, others) => ({
    line: `Step ${step} waits for your OK`,
    fact: others > 0 ? `With ${others} others in today's batch` : "In today's batch"
  }),
  approve: "Approve",
  toSend: (step) => ({ line: `Step ${step} is yours to send`, fact: "From your own inbox" }),
  openDraft: "Open the draft",
  sentByHand: (step, at) => ({
    line: at ? `Step ${step} sent ${at}` : `Step ${step} sent`,
    fact: "Replies aren't read here"
  }),
  theyWrote: "They wrote back\u2026",
  replied: (intent, at) => ({
    line: intent ? `Wrote back \xB7 ${intent}` : "Wrote back",
    fact: [at, "the sequence stopped"].filter(Boolean).join(" \xB7 ")
  }),
  answer: "Answer",
  /** The desk's keys under the dock: in a pile, each act's key, ⇧A the picker, J and K, Z undo. */
  keys: { notFit: "not a fit", later: "later", add: "add", choose: "choose", move: "move", undo: "undo" },
  reading: "Reading where they stand"
};
const D = LEAD_DOCK_WORDS;
const dock = (p) => ({
  line: null,
  fact: null,
  waiting: false,
  x: false,
  later: false,
  held: null,
  ...p
});
const stepNumberOf = (place) => place.place.place ?? 1;
function sentByHandAt(place, f) {
  const sent = place.sends.filter((s) => s.sent_at).at(-1);
  const at = sent && sent.sent_at ? Date.parse(sent.sent_at) : NaN;
  return Number.isFinite(at) ? clockDate(at, f.tz, f.nowMs) : null;
}
function placeDock(f, place) {
  const row = place.place;
  const step = stepNumberOf(place);
  switch (row.group) {
    case "waiting":
      return dock({ ...D.waiting(step, f.batchOthers ?? 0), acts: [slot("approve", D.approve, "check", "a")] });
    case "held":
      return row.send_id ? dock({ acts: [], held: { sendId: row.send_id, batchId: row.batch_id, hold: row.why, place: row.place } }) : null;
    case "to_send":
      return dock({ ...D.toSend(step), acts: [slot("open_draft", D.openDraft, "send", "a")] });
    case "replied": {
      const intent = row.reply && isReplyIntent(row.reply.intent) ? REPLY_INTENT_WORDS[row.reply.intent] : null;
      const at = row.at ? clockNear(Date.parse(row.at), f.tz, f.nowMs) : null;
      return dock({ ...D.replied(intent, at), acts: [slot("thread", D.answer, "chat", "a")] });
    }
    case "in":
    case "done": {
      if (place.reads_replies || !place.sends.some((s) => s.sent_at)) return null;
      return dock({
        ...D.sentByHand(step, sentByHandAt(place, f)),
        acts: [slot("they_wrote", D.theyWrote, "chat", "a")]
      });
    }
    default:
      return null;
  }
}
const deciding = (f) => ({ x: true, later: f.canLater });
function readyDock(f) {
  if (!f.pick) return dock({ ...deciding(f), acts: [slot("pick", D.addToOne, "plus", "a")] });
  if (f.state === "finding")
    return dock({
      ...deciding(f),
      waiting: true,
      acts: [slot("add", D.checking, "plus", "a", { off: D.checking, split: true })]
    });
  if (f.blocked) return dock({ ...deciding(f), line: f.blocked, acts: [slot("pick", D.choose, "plus", "a")] });
  return dock({ ...deciding(f), acts: [slot("add", D.addTo(f.pick.name), "plus", "a", { split: true })] });
}
function closedDock(f) {
  const fix = f.closed ? f.closed.fix : null;
  if (!f.closed || !fix) return null;
  const one = fix === "put_back" ? slot("put_back", D.putBack, "undo", "a") : fix === "ready" ? slot("ready", D.ready, "undo", "a") : slot("call", D.call, "phone", "c");
  return dock({ line: f.closed.title, fact: f.closed.line || null, acts: [one] });
}
function elsewhereDock(f) {
  const e = f.elsewhere;
  if (!e) return null;
  if (e.written)
    return dock({ ...D.writtenBy(e.name), acts: e.id ? [slot("sequence", D.open(e.name), "chevron", "a")] : [] });
  return dock({
    ...D.inOther(e.name),
    acts: f.pick && f.pick.id !== e.id ? [slot("move", D.moveTo(f.pick.name), "chevron", "a")] : []
  });
}
export function leadDockOf(f) {
  if (f.place) return placeDock(f, f.place) ?? elsewhereDock(f);
  if (f.reading) return dock({ line: D.reading, waiting: true, acts: [] });
  switch (f.state) {
    case "review":
      return dock({
        ...D.review,
        acts: [slot("exclude", D.exclude, "ban", "n"), slot("keep", D.keep, "check", "a")]
      });
    case "phone":
      return f.canCall ? dock({ ...deciding(f), ...D.noEmail, acts: [slot("call", D.call, "phone", "c")] }) : dock({ ...deciding(f), ...D.noEmail, acts: [] });
    case "elsewhere":
      return elsewhereDock(f);
    case "replied":
      return dock({ ...D.replied(null, null), acts: [slot("thread", D.answer, "chat", "a")] });
    case "sequence":
      return null;
    case "closed":
      return closedDock(f);
    default:
      return readyDock(f);
  }
}
