/**
 * What Today says, band by band: the standing line (the chips, the count above the work, the alert), what an empty
 * queue means, the headline ladder, Ask's four facts, the recap's one line and its sentences, and the quiet day.
 *
 * Every builder here is pure over the facts today.ts computes once (`TodayFacts`) and returns one band of the view
 * model. The rows — Ask's needs-you rows, the closing windows, who is waiting with nothing back, the receipts, the
 * calls worth an ear and the queue — are built beside the facts in today.ts, and `toTodayVM` there composes the two.
 * This module imports nothing from today.ts but types, so the two cannot form a cycle.
 *
 * The words every band is built from live here too: the list join and the seconds phrase.
 */
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import { CHANNEL_ANSWERED } from "../lines/channels";
import type { TodayFacts, TodayFactVM, TodayNeedsRowVM, TodayQueueEmptyVM, TodaySentenceVM, TodayVM } from "./today";

/** "Email", "WhatsApp and Email", "WhatsApp, Texting and Email". (calendar.ts, config.ts and
 *  reports.ts each hold their own copy of this join; one home for it is a tidy of its own.) */
export const andList = (xs: readonly string[]): string =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** "41s" / "1m 12s". Seconds are exact here: this is a measured median. */
export function secondsPhrase(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

/**
 * The wires as the standing line draws them: a chip each, the count above the work, and the alert.
 *
 * The count lives here because the sentence has a number in it. The page
 * counted its own chips, which is why "2 of 2 lines connected" was said on a
 * workspace with three. A wire that could not be read is not a smaller
 * whole: the line says so instead of a count that is short by one.
 *
 * The alert is the one place Today raises its voice, and it SUPPRESSES every
 * reassuring line — "nothing needs you" is a lie while the number is dark.
 */
export function todayStanding(f: TodayFacts): Pick<TodayVM["standing"], "chips" | "lines" | "alert"> {
  const { metrics, wires } = f;
  const chips = wires.map((w) => ({ text: `${w.label} ${w.on ? "connected" : "disconnected"}`, ok: w.on }));
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const up = on.length;
  const lines = {
    text:
      metrics.linesRead === false
        ? "the email line could not be counted"
        : wires.length
          ? `${up} of ${wires.length} ${wires.length === 1 ? "line" : "lines"} connected`
          : "no lines connected yet",
    down: down.length > 0,
  };
  const alert =
    metrics.workspace.status === "paused"
      ? "This workspace is paused — the receptionist is not answering anything."
      : down.length
        ? `${andList(down.map((w) => w.label))} ${down.length > 1 ? "are" : "is"} disconnected — messages coming in are not being answered.`
        : null;
  return { chips, lines, alert };
}

/**
 * What an empty queue means HERE. The page chose between three of these by
 * counting chips: an email-only workspace was told nothing could come in,
 * and counting email would have told it the receptionist was answering on
 * its own, which it does not do for email. The heading's own words ride
 * with it, so the two are decided once. First match wins.
 */
export function todayQueueEmpty(f: TodayFacts): TodayQueueEmptyVM {
  const { metrics, wires } = f;
  const down = wires.filter((w) => !w.on);
  const on = wires.filter((w) => w.on);
  const answered = on.filter((w) => CHANNEL_ANSWERED.has(w.kind));
  if (metrics.workspace.status === "paused") {
    return {
      title: "Nothing in the queue — the workspace is paused, so nothing is being answered.",
      sub: "nothing in the queue",
      glyph: "alert",
      tone: "warn",
      testid: "today-queue-empty-paused",
    };
  }
  if (down.length) {
    return {
      title: "Nothing in the queue — new messages go unanswered until the line is back.",
      sub: "nothing in the queue",
      glyph: "alert",
      tone: "warn",
      testid: "today-queue-empty-down",
    };
  }
  if (wires.length === 0) {
    return {
      title: "Nothing in the queue — nothing can come in until a line is connected.",
      sub: "nothing in the queue",
      glyph: "phone",
      tone: "",
      testid: "today-queue-empty-unconnected",
    };
  }
  if (answered.length === 0) {
    return on.every((w) => w.kind === "email")
      ? {
          title: `Nothing in the queue. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
          sub: "nothing in the queue",
          glyph: "mail",
          tone: "",
          testid: "today-queue-empty-unanswered",
        }
      : {
          title: "Nothing in the queue — no line the receptionist answers is connected.",
          sub: "nothing in the queue",
          glyph: "phone",
          tone: "",
          testid: "today-queue-empty-unanswered",
        };
  }
  return {
    title: "All caught up — the receptionist is answering on its own.",
    sub: "nothing needs you",
    glyph: "check",
    tone: "ok",
    testid: "today-queue-empty-ok",
  };
}

/**
 * Ask's four facts. A zero is a real measurement, and "—" is a real "not enough data yet"; never a delta, a
 * percentage or a sparkline: a jump from 1 message to 3 is not "+200%".
 */
export function todayAskFacts(f: TodayFacts): TodayFactVM[] {
  const { period, callMinutes } = f;
  return [
    { label: "Messages in", value: String(period.messages_in) },
    { label: "Answered by the receptionist", value: `${period.answered_by_ai} of ${period.messages_in}` },
    period.median_reply_seconds_ai === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: secondsPhrase(period.median_reply_seconds_ai) },
    { label: "Calls", value: period.calls ? `${period.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
}

/** The day's traffic as one sentence, for Ask; the page draws the figures instead. */
export function todayTrafficLine(f: TodayFacts): string {
  const { period, callMinutes } = f;
  const trafficParts: string[] = [];
  if (period.messages_in > 0) {
    trafficParts.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"} in, ${period.answered_by_ai} answered by the receptionist${
        period.median_reply_seconds_ai === null ? "" : `, typically in ${secondsPhrase(period.median_reply_seconds_ai)}`
      }`,
    );
  }
  if (period.calls) {
    trafficParts.push(
      `${period.calls} call${period.calls === 1 ? "" : "s"}${callMinutes ? `, ${callMinutes} minute${callMinutes === 1 ? "" : "s"}` : ""}`,
    );
  }
  return trafficParts.length ? `${trafficParts.join(". ")}.` : "Nothing has come in yet today.";
}

/** The quiet day: prove we are listening, don't show a row of zeroes. `proof` is todayProof's sentence. */
export function todayQuietDay(f: TodayFacts, proof: string): NonNullable<TodayVM["quiet"]> {
  const { wires, conversations } = f;
  const names = andList(wires.map((w) => w.label));
  const pluralVerb = wires.length > 1 ? "are" : "is";
  // A workspace with no wire yet is a new owner's first Today — it must not
  // read " is connected." with nothing in front of it, and it must not name
  // the only two wires this sentence used to know about.
  const sub =
    wires.length === 0
      ? "No line is connected yet, so nothing can come in."
      : `${names} ${pluralVerb} connected. ${proof}`;
  return {
    headline: "Nothing has come in yet today.",
    sub,
    proof: [
      ...(wires.length === 0 ? [{ label: "Lines", value: "none connected yet" }] : []),
      ...wires.map((w) => ({
        label: w.label,
        // "on" / "off" in the owner's words, never the column's value. A
        // wire with nothing to name it by says only that: "connected · on"
        // was two words for one fact.
        value: w.where ? `${w.where} · ${w.on ? "on" : "off"}` : w.on ? "on" : "off",
      })),
      { label: "Checked", value: "just now" },
    ],
    launchpad: conversations.length
      ? {
          label: `Nothing waiting. ${conversations.length} earlier conversation${
            conversations.length === 1 ? "" : "s"
          } →`,
          to: "conversations",
        }
      : null,
  };
}

type TodayHeadline = Pick<TodayVM["standing"], "headline" | "detail" | "tone">;

/** The headline ladder: first match wins. `needsRows` are Ask's rows, oldest wait first, for the one name it says. */
export function todayHeadline(f: TodayFacts, alert: string | null, needsRows: TodayNeedsRowVM[]): TodayHeadline {
  const { needsYouCount, oldest } = f;
  if (alert) return { headline: "Check your connection before anything else.", detail: null, tone: "alert" };
  if (needsYouCount > 1) {
    return {
      headline: `${needsYouCount} conversations need you.`,
      detail: oldest ? `The oldest has been waiting since ${oldest}.` : null,
      tone: "needs",
    };
  }
  if (needsYouCount === 1) {
    const who = needsRows[0]?.who;
    return {
      headline: "One conversation needs you",
      detail: who && oldest ? `${who} has been waiting since ${oldest}.` : null,
      tone: "needs",
    };
  }
  return calmHeadline(f.period);
}

/** The last rung of the ladder: nothing needs you, so the day's traffic, and whether the receptionist handled all of it. */
function calmHeadline(period: TodayFacts["period"]): TodayHeadline {
  const bits: string[] = [];
  if (period.messages_in) {
    bits.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"}${
        period.conversations_active
          ? ` from ${period.conversations_active} ${period.conversations_active === 1 ? "person" : "people"}`
          : ""
      }`,
    );
  }
  if (period.calls) bits.push(`${period.calls} call${period.calls === 1 ? "" : "s"}`);
  // "Handled everything" only when the receptionist did: a message you
  // answered yourself, or one nobody answered, is not the receptionist's.
  const allByReceptionist = period.unanswered_in_window === 0 && period.messages_out_you === 0;
  const headline = bits.length
    ? allByReceptionist
      ? `The receptionist handled everything — ${bits.join(" and ")} today. Nothing needs you.`
      : `${bits.join(" and ")} today. Nothing needs you right now.`
    : "Nothing needs you.";
  const detail =
    period.median_reply_seconds_ai !== null && period.messages_in > 0
      ? `It answered ${period.answered_by_ai} of the ${period.messages_in} on its own, typically in about ${secondsPhrase(
          period.median_reply_seconds_ai,
        )}.`
      : null;
  return { headline, detail, tone: "calm" };
}

/**
 * Ask's recap sentences: only what the HEADLINE does not already say. When nothing needs you, the headline
 * is "The receptionist handled everything — N messages and M calls", so repeating those counts here would be the
 * brief reading its own first line back. When something DOES need you, the headline is spent on that.
 */
export function todaySentences(
  f: TodayFacts,
  tone: TodayVM["standing"]["tone"],
  alert: string | null,
): TodaySentenceVM[] {
  const { period, callMinutes, conversations, sinceMs } = f;
  const sentences: TodaySentenceVM[] = [];
  const headlineCoversTraffic = tone === "calm" && !alert;
  if (period.answered_by_ai && !headlineCoversTraffic) {
    sentences.push({
      // Not "the WhatsApp receptionist": answered_by_ai is first_replies with
      // no channel predicate (00037_hygiene.sql), so an email it answered is
      // in this count. Every other sentence in this file already says just
      // "the receptionist".
      text: `The receptionist answered ${period.answered_by_ai} message${period.answered_by_ai === 1 ? "" : "s"}${
        period.conversations_active
          ? ` from ${period.conversations_active} ${period.conversations_active === 1 ? "person" : "people"}`
          : ""
      }.`,
      traffic: true,
    });
  }
  if (period.calls && !headlineCoversTraffic) {
    sentences.push({
      text: `${period.calls} caller${period.calls === 1 ? "" : "s"} reached the phone line${
        callMinutes ? ` — ${callMinutes} minute${callMinutes === 1 ? "" : "s"} total` : ""
      }.`,
      traffic: true,
    });
  }
  if (period.messages_out_you) {
    sentences.push({
      text: `You sent ${period.messages_out_you} repl${period.messages_out_you === 1 ? "y" : "ies"} yourself.`,
    });
  }
  // A reply that never reached the customer is the one line that must never be
  // quiet — the send already escalated, but a card saying "handled everything"
  // while a message died in transit would be a lie of omission.
  if (period.send_failures) {
    // The thread of the newest reply that failed, when the conversations read holds it: "See the thread"
    // opened the Inbox list, where the owner had to go looking.
    const lastFailed = conversations
      .flatMap((c) =>
        c.messages
          .filter(
            (x) =>
              x.direction === "outbound" &&
              x.status === "failed" &&
              x.meta?.backfill !== true &&
              new Date(x.created_at).getTime() >= sinceMs,
          )
          .map((x) => ({ conv: c, at: x.created_at })),
      )
      .sort((a, b) => b.at.localeCompare(a.at))[0];
    sentences.push({
      text: `${period.send_failures} repl${period.send_failures === 1 ? "y" : "ies"} failed to deliver — the customer got no answer.`,
      warn: true,
      ...(lastFailed ? { to: `inbox/th-${lastFailed.conv.id}` } : {}),
    });
  }
  return sentences;
}
