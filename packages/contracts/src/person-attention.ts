/**
 * One person as a row of the attention strip: who needs you, why, and since when. Moved whole from people.ts (Reach
 * out Part 2.5); exported from index.ts directly, since it reads people.ts's row view model.
 */
import { tidyCallSummary } from "./call-words";
import { clockTime } from "./clock";
import { ago, type PersonRowVM, type ReceptionistTone } from "./people";
import { DAY_MS, fmtDate } from "./person-helpers";

/* ------------------------- the attention strip --------------------------- */

export interface AttentionRowVM {
  /** Where they last reached us: "WhatsApp" or "Phone"; null with no contact. */
  channel: "WhatsApp" | "Phone" | null;
  /** "2h ago"; "no contact yet". */
  when: string;
  /** What the row says about them: their own words, or the best evidence. */
  sentence: string;
  /** True when `sentence` is their words, verbatim. */
  quoted: boolean;
  /** "Escalated · asked for a person · since 2:14 PM", as segments. */
  status: string[];
  tone: ReceptionistTone;
  /** The one thing this state asks of you, when it differs from opening the profile. */
  cta: { label: string; kind: "primary" | "ghost"; to: string } | null;
}

/** One line, whitespace collapsed, cut with an ellipsis past `max`. */
function oneLine(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** "2:14 PM" inside a day; "Sep 4 2:14 PM" further back — by the business's clock. */
function clock(ms: number, tz: string, nowMs: number): string {
  const time = clockTime(ms, tz);
  return nowMs - ms < DAY_MS ? time : `${fmtDate(ms, tz, nowMs)} ${time}`;
}

/**
 * One row of "where your attention matters": the mockup's grammar — a name,
 * where and when, one sentence, one state line, one button — filled only
 * with what is on record. Their words come first; then the last call's
 * summary; then the calendar; then the plain fact of a call. The button is
 * the one thing the state asks of you, and it exists only when that differs
 * from opening the profile, which the row itself does.
 */
export function attentionRow(p: PersonRowVM, tz: string, nowMs: number): AttentionRowVM {
  const lc = p.lastContact;
  const channel: AttentionRowVM["channel"] = lc.kind === "call" ? "Phone" : lc.kind === "message" ? "WhatsApp" : null;
  const when = lc.ts === null ? "no contact yet" : ago(lc.ts, tz, nowMs);
  let sentence: string;
  let quoted = false;
  if (p.quote) {
    sentence = oneLine(p.quote, 160);
    quoted = true;
  } else if (p.callSummary) sentence = oneLine(tidyCallSummary(p.callSummary) ?? p.callSummary, 160);
  // A proposal waiting says more than a visit ahead (0004): the row's brief, "Proposal out · 6 d". A client's row
  // keeps the visit, which is the next thing about them; a pass or an end says nothing here.
  else if (p.deal && p.deal.stage === "proposed" && p.deal.brief) sentence = p.deal.brief;
  else if (p.nextVisit) sentence = `Booked · ${p.nextVisit}`;
  else if (p.lastVisit) sentence = `Last visit · ${p.lastVisit}`;
  else if (p.calls > 0)
    sentence =
      p.calls === 1 ? "Phoned once; nothing in writing yet" : `Phoned ${p.calls} times; nothing in writing yet`;
  else sentence = "Nothing written yet";
  const r = p.receptionist;
  let status: string[];
  if (p.state === "waiting_on_you") status = ["You own the thread", "they wrote last"];
  else if (r.tone === "answering")
    status = p.hasChat ? ["Receptionist", "answering on WhatsApp"] : ["Receptionist", "takes their calls"];
  else status = r.label.split(", ");
  if (p.state === "needs_you" && p.needsYouSinceMs !== null)
    status = [...status, `since ${clock(p.needsYouSinceMs, tz, nowMs)}`];
  const cta: AttentionRowVM["cta"] = !p.threadId
    ? null
    : p.state === "needs_you" || p.state === "waiting_on_you"
      ? { label: "Open in Inbox", kind: "primary", to: `inbox/${p.threadId}` }
      : { label: "Open thread", kind: "ghost", to: `inbox/${p.threadId}` };
  return { channel, when, sentence, quoted, status, tone: r.tone, cta };
}
