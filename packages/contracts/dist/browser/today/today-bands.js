import { addressOf } from "../activity/record-address.js";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox.js";
import { lineOffGets } from "../lines/caller-gets.js";
import { CHANNEL_ANSWERED, channelNoun } from "../lines/channels.js";
import { durationWords } from "../shared/clock.js";
import { runsWaitingSentence } from "../shell/campaign-rooms.js";
import { PAUSED_WORDS } from "../workspace/billing.js";
export const andList = (xs) => xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
export function secondsPhrase(s) {
  return durationWords(s);
}
const speedIn = (s, about = false) => s.held ? s.words : `in ${about ? "about " : ""}${secondsPhrase(s.seconds)}`;
export const speedClause = (s) => s === null ? "" : `typically ${speedIn(s)}`;
const darkWires = (down) => down.map((w) => `${w.label} is disconnected \u2014 ${lineOffGets(w.kind, channelNoun(w.kind)).gets}.`).join(" ");
export function todayStanding(f) {
  const { metrics, wires } = f;
  const chips = wires.map((w) => ({ text: `${w.label} ${w.on ? "connected" : "disconnected"}`, ok: w.on }));
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const up = on.length;
  const noun = wires.length === 1 ? "line" : "lines";
  const lines = {
    text: metrics.linesRead === false ? "the email line could not be counted" : wires.length ? `${up} of ${wires.length} ${noun} connected` : "no lines connected yet",
    // The same count in the sidebar's two words (the canvases' "3 lines on"), where the sentence would wrap.
    short: metrics.linesRead === false ? "lines uncounted" : wires.length ? `${up} of ${wires.length} ${noun} on` : "no lines yet",
    down: down.length > 0
  };
  const paused = metrics.workspace.status === "paused";
  const alert = paused ? `This workspace is paused. ${PAUSED_WORDS}` : down.length ? darkWires(down) : null;
  return { chips, lines, alert, paused };
}
export function todayQueueEmpty(f) {
  const { metrics, wires } = f;
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const answered = on.filter((w) => CHANNEL_ANSWERED.has(w.kind));
  if (metrics.workspace.status === "paused") {
    return {
      title: `Nothing in the queue \u2014 the workspace is paused. ${PAUSED_WORDS}`,
      sub: "nothing in the queue",
      glyph: "alert",
      tone: "warn",
      testid: "today-queue-empty-paused"
    };
  }
  if (down.length) {
    return {
      title: `Nothing in the queue. ${darkWires(down)}`,
      sub: "nothing in the queue",
      glyph: "alert",
      tone: "warn",
      testid: "today-queue-empty-down"
    };
  }
  if (wires.length === 0) {
    return {
      title: "Nothing in the queue \u2014 nothing can come in until a line is connected.",
      sub: "nothing in the queue",
      glyph: "phone",
      tone: "",
      testid: "today-queue-empty-unconnected"
    };
  }
  if (answered.length === 0) {
    return on.every((w) => w.kind === "email") ? {
      title: `Nothing in the queue. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
      sub: "nothing in the queue",
      glyph: "mail",
      tone: "",
      testid: "today-queue-empty-unanswered"
    } : {
      title: "Nothing in the queue \u2014 no line the receptionist answers is connected.",
      sub: "nothing in the queue",
      glyph: "phone",
      tone: "",
      testid: "today-queue-empty-unanswered"
    };
  }
  return {
    title: "All caught up \u2014 the receptionist is answering on its own.",
    sub: "nothing needs you",
    glyph: "check",
    tone: "ok",
    testid: "today-queue-empty-ok"
  };
}
export function todayAskFacts(f) {
  const { period, callMinutes, speed } = f;
  return [
    { label: "Messages in", value: String(period.messages_in) },
    { label: "Answered by the receptionist", value: `${period.answered_by_ai} of ${period.messages_in}` },
    speed === null ? { label: "Typical reply time", value: "\u2014", hint: "Not enough replies yet" } : { label: "Typical reply time", value: speed.held ? speed.words : secondsPhrase(speed.seconds) },
    { label: "Calls", value: period.calls ? `${period.calls}${callMinutes ? ` \xB7 ${callMinutes} min` : ""}` : "0" }
  ];
}
export function todayTrafficLine(f) {
  const { period, callMinutes, speed } = f;
  const trafficParts = [];
  if (period.messages_in > 0) {
    trafficParts.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"} in, ${period.answered_by_ai} answered by the receptionist${speed === null ? "" : `, typically ${speedIn(speed)}`}`
    );
  }
  if (period.calls) {
    trafficParts.push(
      `${period.calls} call${period.calls === 1 ? "" : "s"}${callMinutes ? `, ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}`
    );
  }
  return trafficParts.length ? `${trafficParts.join(". ")}.` : "Nothing has come in yet today.";
}
export function todayQuietDay(f, proof) {
  const { wires, conversations } = f;
  const names = andList(wires.map((w) => w.label));
  const pluralVerb = wires.length > 1 ? "are" : "is";
  const sub = wires.length === 0 ? "No line is connected yet, so nothing can come in." : `${names} ${pluralVerb} connected. ${proof}`;
  return {
    headline: "Nothing has come in yet today.",
    sub,
    proof: [
      ...wires.length === 0 ? [{ label: "Lines", value: "none connected yet" }] : [],
      ...wires.map((w) => ({
        label: w.label,
        // "on" / "off" in the owner's words, never the column's value. A
        // wire with nothing to name it by says only that: "connected · on"
        // was two words for one fact.
        value: w.where ? `${w.where} \xB7 ${w.on ? "on" : "off"}` : w.on ? "on" : "off"
      })),
      { label: "Checked", value: "just now" }
    ],
    launchpad: conversations.length ? {
      label: `Nothing waiting. ${conversations.length} earlier conversation${conversations.length === 1 ? "" : "s"} \u2192`,
      to: "conversations"
    } : null
  };
}
export function todayAlsoWaiting(w) {
  const { windows = 0, calls, searches } = w;
  return [
    windows ? windows === 1 ? "One reply window is closing." : `${windows} reply windows are closing.` : "",
    calls ? calls === 1 ? "One call is worth a listen." : `${calls} calls are worth a listen.` : "",
    searches ? searches === 1 ? "A search is waiting on your answer." : `${searches} searches are waiting on your answer.` : ""
  ].filter(Boolean);
}
export function todayHeadline(f, alert, needsRows, also) {
  const { needsYouCount, oldest } = f;
  if (alert)
    return { headline: "Check your connection before anything else.", detail: null, tone: "alert", calm: null };
  if (needsYouCount > 1) {
    return {
      headline: `${needsYouCount} conversations need you.`,
      detail: oldest ? `The oldest has been waiting since ${oldest}.` : null,
      tone: "needs",
      calm: null
    };
  }
  if (needsYouCount === 1) {
    const who = needsRows[0]?.who;
    return {
      headline: "One conversation needs you",
      detail: who && oldest ? `${who} has been waiting since ${oldest}.` : null,
      tone: "needs",
      calm: null
    };
  }
  const calm = calmOf(f, also);
  return { ...calmStanding(calm, 0), calm };
}
function calmOf({ period, speed }, also) {
  const bits = [];
  if (period.messages_in) {
    bits.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"}${period.conversations_active ? ` from ${period.conversations_active} ${period.conversations_active === 1 ? "person" : "people"}` : ""}`
    );
  }
  if (period.calls) bits.push(`${period.calls} call${period.calls === 1 ? "" : "s"}`);
  return {
    also: [...also],
    traffic: bits.length ? bits.join(" and ") : null,
    // "Handled everything" only when the receptionist did: a message you
    // answered yourself, or one nobody answered, is not the receptionist's.
    handled_all: period.unanswered_in_window === 0 && period.messages_out_you === 0,
    answered: speed !== null && period.messages_in > 0 ? `answered ${period.answered_by_ai} of the ${period.messages_in} on its own, typically ${speedIn(speed, true)}.` : null
  };
}
function calmStanding(c, runs) {
  const also = [...runs > 0 ? [runsWaitingSentence(runs)] : [], ...c.also];
  const headline = also.length ? [...also, ...c.traffic ? [`${c.traffic} today.`] : []].join(" ") : c.traffic ? c.handled_all ? `The receptionist handled everything \u2014 ${c.traffic} today. Nothing needs you.` : `${c.traffic} today. Nothing needs you right now.` : "Nothing needs you.";
  const named = !also.length && !!c.traffic && c.handled_all;
  const detail = c.answered ? `${named ? "It" : "The receptionist"} ${c.answered}` : null;
  return { headline, detail, tone: "calm" };
}
export function standingWithRuns(standing, runs) {
  return runs > 0 && standing.calm ? { ...standing, ...calmStanding(standing.calm, runs) } : standing;
}
export function todayDraftsSub(n) {
  return n ? n === 1 ? "1 draft on its way" : `${n} drafts on their way` : null;
}
export function todaySentences(f, tone, alert) {
  const { period, callMinutes } = f;
  const sentences = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (period.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      // Not "the WhatsApp receptionist": answered_by_ai is first_replies with
      // no channel predicate (00037_hygiene.sql), so an email it answered is
      // in this count. Every other sentence in this file already says just
      // "the receptionist".
      text: `The receptionist answered ${period.answered_by_ai} message${period.answered_by_ai === 1 ? "" : "s"}${period.conversations_active ? ` from ${period.conversations_active} ${period.conversations_active === 1 ? "person" : "people"}` : ""}.`,
      traffic: true
    });
  }
  if (period.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${period.calls} caller${period.calls === 1 ? "" : "s"} reached the phone line${callMinutes ? ` \u2014 ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""}.`,
      traffic: true
    });
  }
  if (period.messages_out_you) {
    sentences.push({
      text: `You sent ${period.messages_out_you} repl${period.messages_out_you === 1 ? "y" : "ies"} yourself.`
    });
  }
  const failed = todaySendFailure(f);
  if (failed) sentences.push(failed);
  return sentences;
}
export function todaySendFailure(f) {
  const { period, conversations, sinceMs } = f;
  if (!period.send_failures) return null;
  const lastFailed = conversations.flatMap(
    (c) => c.messages.filter(
      (x) => x.direction === "outbound" && x.status === "failed" && x.meta?.backfill !== true && new Date(x.created_at).getTime() >= sinceMs
    ).map((x) => ({ conv: c, at: x.created_at }))
  ).sort((a, b) => b.at.localeCompare(a.at))[0];
  return {
    text: `${period.send_failures} repl${period.send_failures === 1 ? "y" : "ies"} failed to deliver \u2014 the customer got no answer.`,
    warn: true,
    ...lastFailed ? { to: addressOf({ kind: "conversation", id: lastFailed.conv.id }) } : {}
  };
}
