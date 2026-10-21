import { clockDate, clockHour, clockNear, clockNearWhen, clockTime, zoneDayKey } from "../shared/clock.js";
import { capitalize, plural } from "../shared/words.js";
import { LEAD_FIT_WORDS, LEAD_STAGE_WORDS } from "../leads/lead-words.js";
import { skippedReasonWords } from "./reach-out-approval.js";
import { REPLY_INTENT_WORDS, isReplyIntent } from "./reach-out-replies.js";
import { REACH_OUT_SAID_WORDS, REACH_OUT_STOP_WORDS, REACH_OUT_UNDO_WORDS } from "./owner/lead-doors.js";
import { chainPaceOf, stepLabelOf } from "./reach-out-sheet.js";
import { localDate, localHour } from "../playbooks/playbook-schedule.js";
import { PLAYBOOK_HOURS } from "../playbooks/playbook-triggers.js";
import { leadFoundWords } from "../leads/lead-kind.js";
import { runRoute, sequenceRoute } from "../sequences/sequence-address.js";
const at = (iso) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};
const near = (iso, tz, nowMs) => {
  const t = at(iso);
  return t === null ? "" : clockNear(t, tz, nowMs);
};
const intentWords = (intent) => isReplyIntent(intent) ? REPLY_INTENT_WORDS[intent] : "wrote back";
const personAnswered = (r) => !!r && !r.undone && r.claim !== "auto_reply";
function writtenWords(l, tz, nowMs) {
  const parts = [`Written ${near(l.first_sent_at, tz, nowMs)}`];
  if (l.sent > 1) parts.push(`followed up ${near(l.last_sent_at, tz, nowMs)}`);
  if (l.held) parts.push("a follow-up waits for your OK");
  else if ((l.drafted ?? 0) > 0) parts.push("a follow-up is handed to you to send");
  else if (l.next_at) parts.push(`next ${near(l.next_at, tz, nowMs)}`);
  return parts.join(" \xB7 ");
}
export function reachOutLineOf(l, nowMs, tz) {
  const booked = at(l.booked_at);
  const won = at(l.won_at ?? null);
  if (won !== null)
    return `${booked !== null ? `Booked ${clockDate(booked, tz, nowMs)} \xB7 won` : "Won"} ${clockDate(won, tz, nowMs)}`;
  if (booked !== null) return `Booked ${clockNearWhen(booked, tz, nowMs)}`;
  const r = l.reply;
  if (personAnswered(r)) {
    if (r.intent === "no") return `Said no ${near(r.read_at, tz, nowMs)}`;
    const resume = at(l.resume_at);
    if (r.intent === "not_now" && resume !== null && resume <= nowMs)
      return `Back \xB7 asked to hear from you ${askedDayOf(resume, tz, nowMs)}`;
    if (r.intent === "not_now" && resume !== null) return `Not now \xB7 until ${clockDate(resume, tz, nowMs)}`;
    if (r.intent === "away" && resume !== null) return `Away \xB7 back ${clockDate(resume, tz, nowMs)}`;
    return `Wrote back ${near(r.read_at, tz, nowMs)} \xB7 ${intentWords(r.intent)}`;
  }
  if (l.closed_reason === "said_no") return "Said no";
  if (l.bounced)
    return `Bounced ${near(l.bounced_at, tz, nowMs)}${l.email_state === "invalid" ? " \xB7 address dropped" : ""}`;
  if (l.stopped_at) return `Stopped ${near(l.stopped_at, tz, nowMs)}`;
  const away = at(l.away_until);
  if (l.sent > 0 && away !== null && away > nowMs)
    return `Written ${near(l.first_sent_at, tz, nowMs)} \xB7 away until ${clockDate(away, tz, nowMs)}`;
  if (l.sent > 0) return writtenWords(l, tz, nowMs);
  if (l.held) return "Held for your OK";
  if ((l.drafted ?? 0) > 0) return "Drafted for you \xB7 to send from your inbox";
  const next = at(l.next_at);
  if (next !== null) return capitalize(clockNearWhen(next, tz, nowMs));
  if (l.handed) return "Handed to you";
  if (l.added_at) return `Added ${near(l.added_at, tz, nowMs)} \xB7 not written yet`;
  return null;
}
export function reachOutStripOf(s, chain, nowMs, tz) {
  const running = s.chain.state === "running";
  const share = chain ? chainPaceOf(chain).share : 0;
  const parts = [share > 0 ? `${s.today} of ${share} today` : `${s.today} today`];
  const next = s.next ? at(s.next.at) : null;
  if (!running) parts.push("nothing goes while it is paused");
  else if (s.next && next !== null) {
    const when = zoneDayKey(next, tz) === zoneDayKey(nowMs, tz) ? clockTime(next, tz) : clockNearWhen(next, tz, nowMs);
    parts.push(`next ${when}${s.next.business ? `, ${s.next.business}` : ""}`);
    if (s.next.from || s.next.host) parts.push(`from ${s.next.from ?? s.next.host}`);
  } else parts.push("nothing more planned yet");
  if (s.held > 0) parts.push(`${s.held} held for your OK`);
  if ((s.to_send ?? 0) > 0) parts.push(`${s.to_send} to send from your inbox`);
  return {
    title: running ? `Writing to ${plural(s.written_to, "business", "businesses")}` : `Paused \xB7 ${plural(s.written_to, "business", "businesses")} written to`,
    parts,
    running,
    progress: share > 0 ? Math.min(1, s.today / share) : null,
    going: { label: "How it's going", to: sequenceRoute(s.chain.root_id) },
    toggle: running ? { label: "Pause", pause: true } : { label: "Resume", pause: false },
    waiting: s.waiting_run_id ? { label: "Waits for your OK", to: runRoute(s.waiting_run_id) } : null
  };
}
function emailWords(s) {
  if (s.bounced) return "bounced";
  if (s.email_status === "delivered" || s.email_status === "read") return "delivered";
  if (s.email_status === "failed") return "not delivered";
  return "sent";
}
const skippedWords = (reason) => reason === "run_canceled" || reason === "owner_took_back" ? null : skippedReasonWords(reason ?? "");
const stepName = (n, hand) => n === null ? "A step since removed" : hand ? stepLabelOf({ n, hand: { kind: hand } }) : `Email ${n + 1}`;
function sendLine(s, tz, nowMs) {
  const name = stepName(s.n, s.hand);
  const t = at(s.sent_at) ?? at(s.send_at);
  if (t === null) return null;
  const line = (text) => ({
    id: `s-${s.id}`,
    at: t,
    when: capitalize(clockNearWhen(t, tz, nowMs)),
    text
  });
  if (s.left) {
    const from = s.from || s.host ? ` \xB7 from ${s.from ?? s.host}` : s.said ? " \xB7 from your inbox" : "";
    const angle = s.angle ? ` \xB7 angle: ${s.angle}` : "";
    return line(`${name}${from}${angle} \xB7 ${emailWords(s)}`);
  }
  if (s.state === "handed") return line(`${name} \xB7 handed to you`);
  if (s.state === "drafted") return line(`${name} \xB7 handed to you to send`);
  if (s.state === "held") return line(`${name} \xB7 waits for your OK`);
  if (s.state === "planned" || s.state === "claimed" || s.state === "queued") return line(`${name} \xB7 planned`);
  if (s.state === "failed") return line(`${name} \xB7 could not be sent`);
  const why = skippedWords(s.reason);
  return why ? line(`${name} \xB7 ${why}`) : null;
}
function readingLine(r, tz, nowMs) {
  const t = at(r.read_at);
  if (t === null) return null;
  const until = at(r.until_at);
  const undone = r.undone ? " \xB7 undone" : "";
  const text = r.claim === "auto_reply" && r.intent === "away" ? `An automatic reply \xB7 away${until !== null ? ` until ${clockDate(until, tz, nowMs)}` : ""}${undone}` : `${r.claim === "owner" ? "You said they wrote back \xB7" : "They wrote back \xB7 read as"} ${intentWords(r.intent)}${undone}`;
  return { id: `r-${r.message_id}`, at: t, when: capitalize(clockNearWhen(t, tz, nowMs)), text };
}
export function reachOutTimelineOf(t, nowMs, tz) {
  const lines = [
    ...t.sends.map((s) => sendLine(s, tz, nowMs)),
    ...t.readings.map((r) => readingLine(r, tz, nowMs))
  ].filter((x) => x !== null);
  lines.sort((a, b) => a.at - b.at);
  const undoable = t.readings.find((r) => r.can_undo && r.intent === "no" && !r.undone) ?? null;
  const stopped = at(t.stopped_at);
  const draftedRun = t.sends.find((s) => s.state === "drafted" && s.run_id)?.run_id ?? null;
  const ownerSent = t.sends.some((s) => s.left && s.said === true);
  const answered = t.readings.some((r) => !r.undone && r.claim !== "auto_reply");
  return {
    label: `Sequence \xB7 ${t.chain?.name ?? t.search?.name ?? "a sequence"}`,
    lines,
    stopped: stopped !== null ? `You stopped writing to them ${clockNear(stopped, tz, nowMs)}` : null,
    read: t.conversation_id ? { label: "Read what went out", to: `inbox/th-${t.conversation_id}` } : null,
    stop: t.can_stop && t.chain ? { label: REACH_OUT_STOP_WORDS.door } : null,
    undo: undoable ? { messageId: undoable.message_id, ...REACH_OUT_UNDO_WORDS[undoable.claim === "owner" ? "owner" : "read"] } : null,
    send: draftedRun ? { label: REACH_OUT_SAID_WORDS.sendIt, to: runRoute(draftedRun) } : null,
    said: ownerSent && !answered && !stopped && t.closed_reason !== "said_no" ? { label: REACH_OUT_SAID_WORDS.door } : null
  };
}
function readingEffect(r) {
  if (r.undone) return "undone";
  if (r.said_no) return "nothing more will be written";
  if (r.convert) return "the sequence stopped \xB7 Talking";
  if (r.stops) return "the sequence stopped";
  if (r.claim === "auto_reply" && r.intent === "away" && r.until_at) return "the sequence waits";
  return "nothing changed";
}
const stageWords = (stage) => stage in LEAD_STAGE_WORDS ? LEAD_STAGE_WORDS[stage] : stage;
export function reachOutPersonOf(t, nowMs, tz) {
  const chain = t.chain?.name ?? null;
  const emails = /* @__PURE__ */ new Map();
  for (const s of t.sends) {
    if (!s.left || !s.message_id) continue;
    const parts = [stepName(s.n, s.hand)];
    if (s.angle) parts.push(`angle: ${s.angle}`);
    if (s.from || s.host) parts.push(`from ${s.from ?? s.host}`);
    else if (s.said) parts.push("from your inbox");
    parts.push(emailWords(s));
    emails.set(s.message_id, { who: chain ? `Sequence \xB7 ${chain}` : "Your sequence", sub: parts.join(" \xB7 ") });
  }
  const readings = /* @__PURE__ */ new Map();
  for (const r of t.readings)
    readings.set(
      r.message_id,
      `${r.claim === "owner" ? "You said" : "Read as"} ${intentWords(r.intent)} \xB7 ${readingEffect(r)}`
    );
  const foundAt = at(t.found_at);
  const fit = t.search?.fit && t.search.fit in LEAD_FIT_WORDS ? LEAD_FIT_WORDS[t.search.fit] : null;
  const found = foundAt !== null ? {
    at: foundAt,
    text: [leadFoundWords(t), fit ? fit.toLowerCase() : null, t.email_state === "ok" ? "address checked" : null].filter(Boolean).join(" \xB7 ")
  } : null;
  return {
    emails,
    readings,
    found,
    about: t.chain ? `${t.chain.name} \xB7 ${stageWords(t.stage)} \xB7 ${reachOutStandingOf(t, nowMs, tz)?.words ?? "not written yet"}` : null
  };
}
const standing = (words, tone, stop) => ({
  line: capitalize(words),
  words,
  tone,
  stop
});
export function reachOutWhenOf(c, nowMs, tz) {
  if (c.waiting_run_id) return "waits for your OK";
  if (c.state !== "running") return "nothing goes while it is paused";
  const hour = c.run_hour ?? PLAYBOOK_HOURS.min;
  const now = new Date(nowMs);
  const h = localHour(tz, now);
  const say = c.fed_by === "list" ? ", after your OK" : "";
  if (c.last_run_for === localDate(tz, now) || h > PLAYBOOK_HOURS.max)
    return `goes tomorrow from ${clockHour(hour)}${say}`;
  if (h < hour) return `goes today from ${clockHour(hour)}${say}`;
  return `goes within the hour${say}`;
}
function answerStanding(r, tz, nowMs, resume) {
  if (r.said_no || r.intent === "no")
    return standing(`said no ${near(r.read_at, tz, nowMs)} \xB7 nothing more will be written`, "bad", false);
  if (r.intent === "not_now" && resume !== null && resume <= nowMs)
    return standing(`asked to hear from you ${askedDayOf(resume, tz, nowMs)} \xB7 write to them yourself`, "warn", false);
  const what = `wrote back ${near(r.read_at, tz, nowMs)} \xB7 ${intentWords(r.intent)}`;
  return standing(r.stops || r.convert ? `${what} \xB7 the sequence stopped` : what, "good", false);
}
const nextPlanned = (t) => {
  const times = t.sends.filter((s) => s.state === "planned").map((s) => at(s.send_at)).filter((x) => x !== null);
  return times.length > 0 ? Math.min(...times) : null;
};
function writtenStanding(t, tz, nowMs) {
  const left = t.sends.filter((s) => s.left && s.n !== null);
  const steps = t.chain?.steps?.filter((s) => !s.hand).length ?? 0;
  const held = t.sends.some((s) => s.state === "held");
  const drafted = t.sends.some((s) => s.state === "drafted");
  const planned = nextPlanned(t);
  if (left.length === 0) {
    if (held) return standing("email 1 waits for your OK", "warn", false);
    if (drafted) return standing("email 1 is handed to you to send", "warn", false);
    if (planned !== null) return standing(`email 1 goes ${clockNearWhen(planned, tz, nowMs)}`, "plain", false);
    return null;
  }
  const last = left.at(-1);
  const k = (last?.n ?? 0) + 1;
  const parts = [`${steps >= k ? `email ${k} of ${steps} sent` : "written"} ${near(last?.sent_at ?? null, tz, nowMs)}`];
  if (held) parts.push("the next waits for your OK");
  else if (drafted) parts.push("the next is handed to you to send");
  else if (planned !== null) parts.push(`next ${clockNearWhen(planned, tz, nowMs)}`);
  else if (steps > k) parts.push("the next if nothing comes back");
  else parts.push("the last email");
  return standing(parts.join(" \xB7 "), "plain", t.can_stop);
}
export function reachOutStandingOf(t, nowMs, tz) {
  if (!t.chain) return null;
  const booked = at(t.booked_at);
  const won = at(t.won_at ?? null);
  if (won !== null)
    return standing(
      `${booked !== null ? `booked ${clockDate(booked, tz, nowMs)} \xB7 ` : ""}won ${clockDate(won, tz, nowMs)}`,
      "good",
      false
    );
  if (booked !== null) return standing(`booked ${clockNearWhen(booked, tz, nowMs)}`, "good", false);
  const person = t.readings.find((r) => !r.undone && r.claim !== "auto_reply") ?? null;
  if (person) return answerStanding(person, tz, nowMs, at(t.resume_at));
  if (t.closed_reason === "said_no") return standing("said no \xB7 nothing more will be written", "bad", false);
  if (t.stopped_at) return standing(`you stopped writing to them ${near(t.stopped_at, tz, nowMs)}`, "plain", false);
  if (t.sends.some((s) => s.bounced)) return standing("bounced \xB7 nothing more will be written", "bad", false);
  const away = t.readings.find((r) => !r.undone && r.intent === "away" && at(r.until_at) !== null);
  const back = away ? at(away.until_at) : null;
  if (back !== null && back > nowMs)
    return standing(`away until ${clockDate(back, tz, nowMs)} \xB7 the sequence waits`, "plain", t.can_stop);
  const written = writtenStanding(t, tz, nowMs);
  if (written) return written;
  const added = t.added_at ? `added ${near(t.added_at, tz, nowMs)} \xB7 ` : "";
  const when = reachOutWhenOf(t.chain, nowMs, tz);
  return standing(`${added}not written yet \xB7 ${when}`, t.chain.waiting_run_id ? "warn" : "plain", false);
}
export const REACH_OUT_WHY_NOT = [
  "gone",
  "closed",
  "customer",
  "suppressed",
  "written",
  "shared",
  "no_email",
  "checking",
  "unconfirmed",
  "invalid",
  "unchecked",
  "already",
  "not_counted",
  "elsewhere"
];
export const REACH_OUT_WHY_NOT_WORDS = {
  gone: "no longer in your leads",
  closed: "already worked",
  customer: "already a customer",
  suppressed: "asked not to be written to",
  written: "already written to",
  shared: "sharing a number or site with another lead",
  no_email: "with no email address",
  checking: "with an address still being checked",
  unconfirmed: "with an address that can't be confirmed",
  invalid: "with an address that bounced",
  unchecked: "with an address not checked yet",
  already: "already on it",
  not_counted: "still in Needs review",
  elsewhere: "in another sequence"
};
export const REACH_OUT_ADD_WORDS = {
  listGone: "That sequence's list was removed, so nothing can be added to it.",
  fedBySearch: "That sequence writes to its search's leads as they're found, so leads aren't added to it by hand.",
  door: "Add to its sequence",
  takenBack: (n) => `Took ${plural(n, "lead", "leads")} back off the list`,
  onItsWay: "Its email is already on its way, so it stays. Stop writing to them instead.",
  sent: "Its email was already sent, so it stays. Stop writing to them instead.",
  /** The drawer's door on a lead waiting in a reach-out fed by a list (00426 reach_out_leave_out). */
  leaveOut: "Leave out",
  leftOut: (name) => `Left ${name} out. Nothing had been written to them.`,
  backOn: (name) => `${name} is back on its list.`,
  notOnIt: "That lead is no longer on its list."
};
function leftOutWords(a) {
  const named = a.leads.filter((l) => l.why === "elsewhere" && l.chain_name);
  const one = named.length === 1 ? named.at(0)?.chain_name : null;
  return Object.entries(a.left_out).filter(([, n]) => (n ?? 0) > 0).sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0) || x[0].localeCompare(y[0])).map(
    ([why, n]) => why === "elsewhere" && n === 1 && one ? `1 with \u201C${one}\u201D` : `${n} ${REACH_OUT_WHY_NOT_WORDS[why] ?? why}`
  );
}
export function reachOutAddWords(a, chainName) {
  const joined = a.dry ? a.would_add ?? 0 : a.added;
  const left = Object.values(a.left_out).reduce((n, x) => n + (x ?? 0), 0);
  const head = joined === 0 ? `None can be added to \u201C${chainName}\u201D` : `${a.dry ? "Adds" : "Added"} ${plural(joined, "lead", "leads")} to \u201C${chainName}\u201D`;
  return {
    text: left > 0 ? `${head} \xB7 ${left} left out: ${leftOutWords(a).join(", ")}` : head,
    tone: joined === 0 ? "warn" : a.dry ? "plain" : "good"
  };
}
export function askedDayOf(atMs, tz, nowMs) {
  const near2 = clockNearWhen(atMs, tz, nowMs).toLowerCase();
  return near2.startsWith("today") ? "today" : near2.startsWith("yesterday") ? "yesterday" : `on ${clockDate(atMs, tz, nowMs)}`;
}
export function reachOutCameWords(p) {
  const c = p.came;
  if (!c) return null;
  const found = `${p.counts.of} ${p.fed_by === "list" ? "on its list" : "found"}`;
  const parts = [found, `${c.written} written to`];
  if (c.wrote_back) parts.push(`${c.wrote_back} wrote back`);
  if (c.booked) parts.push(`${c.booked} booked`);
  if (c.won) parts.push(`${c.won} won`);
  return parts.join(" \xB7 ");
}
