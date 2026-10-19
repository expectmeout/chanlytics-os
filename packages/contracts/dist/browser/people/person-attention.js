import { tidyCallSummary } from "../voice/call-words.js";
import { clockTime } from "../shared/clock.js";
import { ago, theirTurnWords } from "./person-row-facts.js";
import { HELD_WORDS } from "../conversations/standing.js";
import { fmtDate } from "./person-helpers.js";
import { DAY_MS } from "../shared/time.js";
import { appointmentWords } from "../journey/appointment-word.js";
function clippedLine(text, max) {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}\u2026` : t;
}
function clock(ms, tz, nowMs) {
  const time = clockTime(ms, tz);
  return nowMs - ms < DAY_MS ? time : `${fmtDate(ms, tz, nowMs)} ${time}`;
}
export function attentionRow(p, tz, nowMs, word) {
  const lc = p.lastContact;
  const channel = lc.kind === "call" ? "Phone" : lc.kind === "message" ? "WhatsApp" : null;
  const when = lc.ts === null ? "no contact yet" : ago(lc.ts, tz, nowMs);
  let sentence;
  let quoted = false;
  if (p.quote) {
    sentence = clippedLine(p.quote, 160);
    quoted = true;
  } else if (p.callSummary) sentence = clippedLine(tidyCallSummary(p.callSummary) ?? p.callSummary, 160);
  else if (p.deal && p.deal.stage === "proposed" && p.deal.brief) sentence = p.deal.brief;
  else if (p.nextVisit) sentence = `Booked \xB7 ${p.nextVisit}`;
  else if (p.lastVisit) sentence = `${appointmentWords(word).last} \xB7 ${p.lastVisit}`;
  else if (p.calls > 0)
    sentence = p.calls === 1 ? "Phoned once; nothing in writing yet" : `Phoned ${p.calls} times; nothing in writing yet`;
  else sentence = "Nothing written yet";
  const r = p.receptionist;
  let status;
  if (p.state === "waiting_on_you") {
    const turn = theirTurnWords(p.lastContact);
    status = turn ? [HELD_WORDS.yours.pill, turn] : [HELD_WORDS.yours.pill];
  } else if (r.tone === "answering")
    status = p.hasChat ? ["Receptionist", "answering on WhatsApp"] : ["Receptionist", "takes their calls"];
  else status = r.label.split(", ");
  if (p.state === "needs_you" && p.needsYouSinceMs !== null)
    status = [...status, `since ${clock(p.needsYouSinceMs, tz, nowMs)}`];
  const cta = !p.threadId ? null : p.state === "needs_you" || p.state === "waiting_on_you" ? { label: "Open in Inbox", kind: "primary", to: `inbox/${p.threadId}` } : { label: "Open thread", kind: "ghost", to: `inbox/${p.threadId}` };
  return { channel, when, sentence, quoted, status, tone: r.tone, cta };
}
