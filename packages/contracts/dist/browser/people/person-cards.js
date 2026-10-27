import { visitDay, visitLine } from "../calendar/calendar-people.js";
import { appointmentWords, isAppointmentWord } from "../journey/appointment-word.js";
import { clockDate, clockDateYear, clockDayLabel, clockTime } from "../shared/clock.js";
import { proposalLinkOf, toDealVM } from "../deals/deal-vm.js";
import { leadsRoute } from "../leads/leads.js";
import { reachOutPersonOf } from "../reach-out/reach-out-leads.js";
import { linkHost } from "../shared/link.js";
import { listRuleWhy } from "./lists/list-rules.js";
import { PEOPLE_LISTS } from "./lists/builtin-lists.js";
import {
  askedFor,
  asPersonMode,
  heldThreadOf,
  PERSON_MODE_WORDS,
  SILENT_STOP,
  snoozedAsk
} from "./person-receptionist.js";
import { ago } from "./person-row-facts.js";
import { holderOf, personStanding } from "./person-state.js";
import { bookingLinkAction, emailFactWords, repliesWords } from "./person-reach.js";
import { igClockOfRow, toPersonRowVM } from "./person-row.js";
import { visitTitleWithout } from "../calendar/visit/visit-service.js";
import { addedBy, ourWireOfThreads, proposalSending, proposalSent, replyChannelOfThreads, ts } from "./person-helpers.js";
import { PERSON_CHANNEL_WORDS, REPLY_VIA, REPLY_WIRE } from "./person-words.js";
import { replyWindow, windowClockOf } from "../config/policy.js";
import { messageAt } from "../conversations/thread-dto.js";
import { messageText, messageWords } from "../conversations/message-words.js";
import { reasonShort, reasonSummaryOf } from "../conversations/escalations.js";
import { neverConnected } from "../conversations/call-dto.js";
import { shortTime } from "../conversations/thread-clock.js";
import { writtenChannelOf } from "../conversations/thread-channel.js";
import { HOUR_MS } from "../shared/time.js";
function personRowOf(d) {
  const openEsc = d.escalations.filter((e) => e.state === "open").sort((a, b) => (ts(b.created_at) ?? 0) - (ts(a.created_at) ?? 0))[0];
  return {
    ...d.row,
    open_escalation_reason: openEsc?.reason ?? d.row.open_escalation_reason,
    open_escalation_since: openEsc?.created_at ?? d.row.open_escalation_since,
    conversation_count: d.conversations.length || d.row.conversation_count,
    // A dial that never connected is not a call; people_list agrees, and the
    // profile used to count one more than the list.
    call_count: d.calls.length ? d.calls.filter((k) => !neverConnected(k)).length : d.row.call_count,
    call_seconds: d.calls.length ? Math.round(d.calls.filter((k) => !neverConnected(k)).reduce((a, k) => a + (k.duration_ms ?? 0), 0) / 1e3) : d.row.call_seconds,
    escalation_count: d.escalations.length || d.row.escalation_count,
    visits: d.visits ?? d.row.visits ?? null
  };
}
function dealsListOf(d, tz, nowMs) {
  return (d.deals ?? []).map((x) => toDealVM(x, tz, nowMs)).filter((x) => !!x).map((x) => {
    if (!x.proposal) return x;
    const url = x.proposal.url;
    const sent = proposalSent(d.conversations, url);
    return { ...x, proposal: { ...x.proposal, sent, sending: proposalSending(d.conversations, url) } };
  });
}
function firstChannelOf(d, base) {
  const firstIsCall = d.calls.some((k) => k.started_at && ts(k.started_at) === base.firstContact.ts);
  const firstWritten = d.conversations.flatMap((c) => c.messages).filter((m) => m.type !== "call_summary").map((m) => ({ at: Date.parse(m.channel_ts ?? m.created_at), channel: m.channel })).filter((m) => Number.isFinite(m.at)).sort((a, b) => a.at - b.at)[0];
  return base.firstContact.estimate ? "imported history" : firstIsCall || !base.hasChat ? "Phone" : firstWritten ? REPLY_VIA[writtenChannelOf(firstWritten.channel)] : "WhatsApp";
}
function replyOf(d, row, base, now, nowMs) {
  const rowVia = base.replyVia ? REPLY_WIRE[base.replyVia] : null;
  const via = replyChannelOfThreads(d.conversations) ?? (base.lastChannel ? rowVia : null) ?? ourWireOfThreads(d.conversations) ?? rowVia;
  const dmClock = d.conversations.map((c) => c.last_ig_inbound_at ?? "").filter(Boolean).sort().at(-1) ?? igClockOfRow(row);
  const clocks = { whatsapp: row.latest_wa_inbound_at, instagram: dmClock };
  const exactWindow = via ? replyWindow(via, windowClockOf(via, clocks), now) : null;
  if (!via || !exactWindow) return null;
  const hoursLeft = exactWindow.closesAtIso ? Math.max(0, Math.round((new Date(exactWindow.closesAtIso).getTime() - nowMs) / HOUR_MS)) : 0;
  return { via, window: { open: exactWindow.open, hoursLeft } };
}
function proposalOf(d, current, tz) {
  const proposalUrl = proposalLinkOf(current, d.proposal_url);
  const proposal = proposalUrl ? { url: proposalUrl, host: linkHost(proposalUrl), sent: proposalSent(d.conversations, proposalUrl) } : null;
  const sentAt = proposal?.sent ? ts(proposal.sent.at) : null;
  const sentWords = proposal?.sent && sentAt !== null ? `${clockDateYear(sentAt, tz)}${proposal.sent.via ? ` \xB7 ${proposal.sent.via}` : ""}` : null;
  return { proposal, sentWords };
}
export function personCardContext(d, tz, now, viewerId, names = null) {
  const nowMs = now.getTime();
  const row = personRowOf(d);
  const base = toPersonRowVM(row, tz, now, viewerId, null, names);
  const word = isAppointmentWord(d.appointment_word) ? d.appointment_word : "appointment";
  const deals = dealsListOf(d, tz, nowMs);
  const current = deals.find((x) => x.id === base.deal?.id) ?? base.deal;
  return {
    profile: d,
    tz,
    now,
    nowMs,
    viewerId,
    names,
    row,
    base,
    stamp: (t) => ({ time: clockTime(t, tz), day: clockDayLabel(t, tz, nowMs) }),
    word,
    deals,
    current,
    firstChannel: firstChannelOf(d, base),
    reply: replyOf(d, row, base, now, nowMs),
    ...proposalOf(d, current, tz)
  };
}
export function lastExchangeOf({ profile, stamp }) {
  const latestConv = [...profile.conversations].sort(
    (a, b) => (ts(b.last_message_at) ?? 0) - (ts(a.last_message_at) ?? 0)
  )[0];
  let customer = null;
  let reply = null;
  if (latestConv) {
    for (let i = latestConv.messages.length - 1; i >= 0; i--) {
      const m = latestConv.messages[i];
      if (m.type === "call_summary") continue;
      const t = ts(messageAt(m));
      if (t === null) continue;
      if (!customer && m.direction === "inbound" && m.body)
        customer = { text: messageWords(m), at: `${stamp(t).time} ${stamp(t).day}` };
      if (!reply && m.direction === "outbound" && m.status !== "canceled" && (m.sender === "ai" || m.sender === "human")) {
        reply = {
          text: messageText(m),
          at: `${stamp(t).time} ${stamp(t).day}`,
          // A person's reply is the team's (message-author.ts): the row does not say which member sent it.
          who: m.sender === "ai" ? "Receptionist" : "Your team"
        };
      }
      if (customer && reply) break;
    }
  }
  return { customer, reply };
}
export function rightNowOf({
  profile,
  tz,
  now,
  nowMs,
  viewerId,
  names,
  row: r,
  base
}) {
  const threadTo = r.latest_conversation_id ? `inbox/th-${r.latest_conversation_id}` : null;
  const openThread = threadTo ? { label: "Open the thread", to: threadTo } : null;
  const queuedCard = () => {
    const q = ts(r.queued_reply_at);
    return {
      tone: "queued",
      title: "Reply sending",
      detail: `A reply is queued${q !== null ? `, ${ago(q, tz, nowMs)}` : ""} \u2014 it can still be stopped from the Inbox.`,
      cta: openThread
    };
  };
  if (personStanding(r, nowMs, viewerId).standing === "snoozed") {
    if (r.queued_reply_at) return queuedCard();
    const asks = snoozedAsk(r);
    const wakes = base.receptionist.wakes;
    const said = [wakes ? `Wakes ${wakes}.` : null, asks ? `${asks} \u2014 that is still waiting for you.` : null];
    return {
      tone: "snoozed",
      title: "Snoozed",
      detail: said.filter(Boolean).join(" ") || "Hidden from your queue until it wakes.",
      cta: openThread
    };
  }
  const held = holderOf(r, nowMs, viewerId);
  if (held) {
    const holder = held === "theirs" && r.latest_assignee_user_id ? names?.(r.latest_assignee_user_id) : null;
    const { tone, title, detail } = heldThreadOf(held, holder);
    return { tone, title, detail, cta: openThread };
  }
  const asked = askedFor(r);
  if (asked) {
    const since = r.open_escalation_since ? shortTime(r.open_escalation_since, tz, now) : null;
    return {
      tone: "escalated",
      title: `Escalated \xB7 ${reasonShort(asked)}`,
      // The operator's first sentence for the reason (the Inbox's own): "Paused until someone answers" was appended to
      // every reason, over a person who had asked to stop, where nothing may be answered (the 2 Oct 2026 audit).
      detail: `${since ? `Since ${since}. ` : ""}${reasonSummaryOf(asked)}`,
      cta: openThread
    };
  }
  if (r.needs_human) {
    return {
      tone: "escalated",
      title: "Waiting for a person",
      detail: "Stopped, and nobody has taken the thread yet.",
      cta: openThread
    };
  }
  if (r.queued_reply_at) return queuedCard();
  if (base.consent.state === "opted_out") {
    return { tone: "silent", title: SILENT_STOP.label, detail: SILENT_STOP.detail, cta: null };
  }
  if (["never", "ask"].includes(profile.receptionist_mode ?? "") || ["never", "ask"].includes(profile.workspace_reply_mode ?? "")) {
    const theirs = ["never", "ask"].includes(profile.receptionist_mode ?? "");
    const mode = theirs ? profile.receptionist_mode : profile.workspace_reply_mode;
    const word = PERSON_MODE_WORDS[mode === "never" ? "never" : "ask"];
    return {
      tone: "paused",
      title: `Held for you, set to ${word}`,
      detail: theirs ? `Set to ${word} for them \u2014 their messages come straight to you.` : `Set to ${word} for the workspace \u2014 every message waits for a person.`,
      cta: openThread
    };
  }
  return {
    tone: "answering",
    title: "Answering",
    detail: "New messages are answered automatically.",
    cta: base.threadId ? { label: "Open the thread", to: `inbox/${base.threadId}` } : null
  };
}
const TONE_WORD = {
  answering: "Answering",
  escalated: "Waiting",
  queued: "Queued",
  snoozed: "Snoozed",
  paused: "Held for you",
  yours: "Held for you",
  theirs: "Paused",
  silent: "Silent"
};
const receptionistMeta = (label, tone) => tone === "snoozed" ? label.replace(/^Snoozed\s*/, "") || label.toLowerCase() : label.includes(", ") ? label.slice(label.indexOf(", ") + 2) : tone === "theirs" && !label.startsWith("A teammate") ? label : label.toLowerCase();
export function personFactsOf({
  profile,
  tz,
  nowMs,
  base,
  current,
  firstChannel,
  word
}) {
  const lc = base.lastContact;
  const attempts = profile.calls.filter(neverConnected).length;
  const lastMeta = lc.who === "they" ? lc.kind === "call" ? "they phoned" : "they wrote" : lc.who === "team" ? "your team replied" : lc.who === "receptionist" ? "receptionist replied" : lc.who === "system" ? "we sent" : "";
  const facts = [
    { label: "First contact", value: base.firstContact.label, meta: firstChannel },
    { label: "Last contact", value: lc.ts !== null ? ago(lc.ts, tz, nowMs) : "\u2014", meta: lastMeta },
    {
      label: "Conversations",
      value: base.threads,
      meta: base.escalations ? `${base.escalations} needed you` : "none needed you"
    },
    {
      label: "Calls",
      value: base.calls,
      // A dial that never connected is not a call (people_list's rule), but it is in the history below: the strip said
      // "0 calls" over a "Missed call" row (the 2 Oct 2026 audit). Said as what it is.
      meta: `${base.calls ? `${Math.max(1, Math.round(base.callSeconds / 60))} min total` : "no calls"}${attempts ? `, ${attempts} didn't connect` : ""}`
    },
    // Consent is the two asks on the rail, each with how it was given. A fact, an About row and a pill said it
    // again, five times on one profile.
    {
      label: "Receptionist",
      value: TONE_WORD[base.receptionist.tone],
      meta: base.receptionist.tone === "escalated" ? "for you" : receptionistMeta(base.receptionist.label, base.receptionist.tone)
    },
    // The deal they are deciding on or took (0004): the stage word, and its line with the service and the amount.
    ...current ? [{ label: "Deal", value: current.word, meta: current.line, tone: "" }] : []
  ];
  if (profile.visits) {
    const v = profile.visits;
    facts.push({
      // In the workspace's word for an appointment, as Campaigns says it (decision 0041).
      label: appointmentWords(word).next,
      value: v.next ? visitDay(v.next.start, v.timezone, nowMs) : "\u2014",
      // The cell is narrow: the time here, then how it stands if a word has been said of it and how it was matched if that
      // was a guess (the visit line's own words, person-row.ts), the service in About.
      meta: base.nextVisitLine ? [
        base.nextVisitLine.time,
        base.nextVisitLine.state?.text,
        base.nextVisitLine.guess ? base.nextVisitLine.match : null
      ].filter(Boolean).join(" \xB7 ") : v.state === "ok" ? "none booked" : "could not be read"
    });
  }
  return facts;
}
export function aboutOf({
  profile,
  tz,
  nowMs,
  base,
  firstChannel,
  reply,
  proposal,
  word
}) {
  const about = [];
  if (base.phone) about.push({ k: "Phone", v: base.phone });
  if (base.email) about.push({ k: "Email", v: emailFactWords(base.email, base.emailSuppressed) });
  if (proposal) about.push({ k: "Proposal", v: proposal.host });
  if (base.waName) about.push({ k: "WhatsApp name", v: base.waName });
  about.push({
    k: "First contact",
    v: base.firstContact.ts !== null ? `${base.firstContact.estimate ? "Before " : ""}${clockDateYear(base.firstContact.ts, tz)} \xB7 ${firstChannel}` : "\u2014"
  });
  about.push({ k: "Channels", v: base.channels.map((c) => PERSON_CHANNEL_WORDS[c]).join(" \xB7 ") || "\u2014" });
  if (base.hasChat && reply) {
    const v = repliesWords(REPLY_VIA[reply.via], reply.window, {
      optedOut: base.stopped,
      who: base.name,
      emailStopped: base.emailSuppressed
    });
    if (v) about.push({ k: "Replies", v });
  }
  if (profile.visits) {
    const v = profile.visits;
    const nextLine = v.next ? `${visitLine(v.next, v.timezone, nowMs)} \xB7 ${visitTitleWithout(v.next.title, [base.name])}` : v.state === "ok" ? "Nothing on the calendar" : "Calendar could not be read";
    const W = appointmentWords(word);
    about.push({ k: W.next, v: nextLine, next: true });
    if (v.last)
      about.push({
        k: W.last,
        v: `${visitLine(v.last, v.timezone, nowMs)} \xB7 ${visitTitleWithout(v.last.title, [base.name])}`
      });
  }
  if (profile.added) {
    const at = ts(profile.added.at);
    about.push({
      k: "Added",
      v: `${at !== null ? clockDateYear(at, tz) : "\u2014"} \xB7 ${addedBy(profile.added).how}`
    });
  } else if (profile.lead) {
    const found = ts(profile.lead.found_at);
    about.push({
      k: "Added",
      v: `${found !== null ? clockDateYear(found, tz) : "\u2014"} \xB7 ${addedBy({ source: "lead", title: null }).how}`
    });
  }
  const reach = profile.lead?.reach_out ? reachOutPersonOf(profile.lead.reach_out, nowMs, tz).about : null;
  if (reach) about.push({ k: "Sequence", v: reach });
  return about;
}
export function sinceWords(base) {
  return base.firstContact.label === "\u2014" ? "" : base.firstContact.estimate ? `Since ${base.firstContact.label.charAt(0).toLowerCase()}${base.firstContact.label.slice(1)}` : `Since ${base.firstContact.label}`;
}
export function replyFields(reply, emailStopped, stop) {
  return {
    replyVia: REPLY_VIA[reply.via],
    replyWindow: reply.window,
    bookingLinkAction: bookingLinkAction({ via: REPLY_VIA[reply.via], window: reply.window, emailStopped }, stop)
  };
}
export function receptionistModeOf(d) {
  return {
    person: asPersonMode(d.receptionist_mode),
    workspace: d.workspace_reply_mode === "veto" ? "auto" : asPersonMode(d.workspace_reply_mode)
  };
}
export function smartListsOf(d, base) {
  return PEOPLE_LISTS.filter(
    (l) => l.onProfile !== false && (!l.needsCalendar || d.visits?.state === "ok") && l.test(base)
  ).map((l) => ({ id: l.id, label: l.label, why: listRuleWhy(l.rule, base) }));
}
export function leadOf(d, base, tz, nowMs) {
  return d.lead ? {
    id: d.lead.id,
    name: d.lead.business_name || base.name,
    found: ts(d.lead.found_at) !== null ? clockDate(ts(d.lead.found_at), tz, nowMs) : "\u2014",
    to: leadsRoute({ peek: d.lead.id })
  } : null;
}
