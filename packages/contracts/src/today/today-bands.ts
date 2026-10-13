/**
 * What Today says, band by band: the standing line (the chips, the count above the work, the alert), what an empty
 * queue means, the headline ladder, Ask's four facts, the recap's one line and its sentences, and the quiet day.
 *
 * Every builder here is pure over the facts today-facts.ts computes once (`TodayFacts`) and returns one band of the
 * view model. The rows — Ask's needs-you rows, the closing windows, who is waiting with nothing back, the receipts,
 * the calls worth an ear and the queue — are built from the same facts in today-rows.ts and today-queue.ts, and
 * `toTodayVM` (today-brief.ts) composes them all. This module imports nothing from its neighbours but types, so it
 * cannot form a cycle with them.
 *
 * The words every band is built from live here too: the list join and the seconds phrase.
 */
import { addressOf } from "../activity/record-address";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import { lineOffGets } from "../lines/caller-gets";
import { CHANNEL_ANSWERED, channelNoun } from "../lines/channels";
import type { ReplySpeed } from "../reports/report-speed";
import { durationWords } from "../shared/clock";
import { runsWaitingSentence } from "../shell/campaign-rooms";
import { PAUSED_WORDS } from "../workspace/billing";
import type { TodayFacts } from "./today-facts";
import type {
  TodayCalmVM,
  TodayFactVM,
  TodayNeedsRowVM,
  TodayQueueEmptyVM,
  TodaySentenceVM,
  TodayVM,
} from "./today-vm";

/** "Email", "WhatsApp and Email", "WhatsApp, Texting and Email". (calendar.ts, config.ts and
 *  reports.ts each hold their own copy of this join; one home for it is a tidy of its own.) */
export const andList = (xs: readonly string[]): string =>
  xs.length < 3 ? xs.join(" and ") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** "41s" / "1m 12s": a measured median, said the one way a length of time is said (durationWords). */
export function secondsPhrase(s: number): string {
  return durationWords(s);
}

/**
 * How a sentence about speed finishes ("typically ..."): "in 34s", "in about 34s", or, where most replies waited the owner's hold,
 * against it ("as your 1-minute hold ended"). The one place Today's speed is said, over contracts' `replySpeedOf`.
 */
const speedIn = (s: ReplySpeed, about = false): string =>
  s.held ? s.words : `in ${about ? "about " : ""}${secondsPhrase(s.seconds)}`;

/** The clause the answered figure ends on ("typically in 34s", or against the hold); "" with no reply to speak of. */
export const speedClause = (s: ReplySpeed | null): string => (s === null ? "" : `typically ${speedIn(s)}`);

/**
 * What each dark wire does with what reaches it, one sentence a wire: "Phone line is disconnected — calls are picked up
 * without your facts and are not recorded." The clause is the standing value's (lines/caller-gets.ts), the same one
 * Connections, Live and Start say, and not a sentence of Today's own: this alert said "messages coming in are not being
 * answered" of a phone line whose calls the receptionist picks up.
 */
const darkWires = (down: TodayFacts["wires"]): string =>
  down.map((w) => `${w.label} is disconnected — ${lineOffGets(w.kind, channelNoun(w.kind)).gets}.`).join(" ");

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
  const noun = wires.length === 1 ? "line" : "lines";
  const lines = {
    text:
      metrics.linesRead === false
        ? "the email line could not be counted"
        : wires.length
          ? `${up} of ${wires.length} ${noun} connected`
          : "no lines connected yet",
    // The same count in the sidebar's two words (the canvases' "3 lines on"), where the sentence would wrap.
    short:
      metrics.linesRead === false
        ? "lines uncounted"
        : wires.length
          ? `${up} of ${wires.length} ${noun} on`
          : "no lines yet",
    down: down.length > 0,
  };
  const alert =
    metrics.workspace.status === "paused"
      ? `This workspace is paused. ${PAUSED_WORDS}`
      : down.length
        ? darkWires(down)
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
      title: `Nothing in the queue — the workspace is paused. ${PAUSED_WORDS}`,
      sub: "nothing in the queue",
      glyph: "alert",
      tone: "warn",
      testid: "today-queue-empty-paused",
    };
  }
  if (down.length) {
    return {
      title: `Nothing in the queue. ${darkWires(down)}`,
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
  const { period, callMinutes, speed } = f;
  return [
    { label: "Messages in", value: String(period.messages_in) },
    { label: "Answered by the receptionist", value: `${period.answered_by_ai} of ${period.messages_in}` },
    speed === null
      ? { label: "Typical reply time", value: "—", hint: "Not enough replies yet" }
      : { label: "Typical reply time", value: speed.held ? speed.words : secondsPhrase(speed.seconds) },
    { label: "Calls", value: period.calls ? `${period.calls}${callMinutes ? ` · ${callMinutes} min` : ""}` : "0" },
  ];
}

/** The day's traffic as one sentence, for Ask; the page draws the figures instead. */
export function todayTrafficLine(f: TodayFacts): string {
  const { period, callMinutes, speed } = f;
  const trafficParts: string[] = [];
  if (period.messages_in > 0) {
    trafficParts.push(
      `${period.messages_in} message${period.messages_in === 1 ? "" : "s"} in, ${period.answered_by_ai} answered by the receptionist${
        speed === null ? "" : `, typically ${speedIn(speed)}`
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
/** The quiet day's card, less its figures, which the brief adds (today-figures.ts quietFigures). */
export function todayQuietDay(f: TodayFacts, proof: string): Omit<NonNullable<TodayVM["quiet"]>, "figures"> {
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
type TodayHead = Pick<TodayVM["standing"], "headline" | "detail" | "tone" | "calm">;

/**
 * What the queue holds besides the people who asked for a person, as sentences: a reply window closing, a call worth a
 * listen, a search waiting on an answer. One spelling, said by the head (calmHeadline) and by the brief
 * (today-brief-words.ts); the brief names a closing window's person itself, so it passes no windows.
 */
export function todayAlsoWaiting(w: { windows?: number; calls: number; searches: number }): string[] {
  const { windows = 0, calls, searches } = w;
  return [
    windows ? (windows === 1 ? "One reply window is closing." : `${windows} reply windows are closing.`) : "",
    calls ? (calls === 1 ? "One call is worth a listen." : `${calls} calls are worth a listen.`) : "",
    searches
      ? searches === 1
        ? "A search is waiting on your answer."
        : `${searches} searches are waiting on your answer.`
      : "",
  ].filter(Boolean);
}

/**
 * The headline ladder: first match wins. `needsRows` are Ask's rows, oldest wait first, for the one name it says.
 * `also` is what the queue holds besides them (todayAlsoWaiting), for the last rung, whose words are kept (`calm`) so a
 * page that holds the runs says the head again with them (standingWithRuns).
 */
export function todayHeadline(
  f: TodayFacts,
  alert: string | null,
  needsRows: TodayNeedsRowVM[],
  also: readonly string[],
): TodayHead {
  const { needsYouCount, oldest } = f;
  if (alert)
    return { headline: "Check your connection before anything else.", detail: null, tone: "alert", calm: null };
  if (needsYouCount > 1) {
    return {
      headline: `${needsYouCount} conversations need you.`,
      detail: oldest ? `The oldest has been waiting since ${oldest}.` : null,
      tone: "needs",
      calm: null,
    };
  }
  if (needsYouCount === 1) {
    const who = needsRows[0]?.who;
    return {
      headline: "One conversation needs you",
      detail: who && oldest ? `${who} has been waiting since ${oldest}.` : null,
      tone: "needs",
      calm: null,
    };
  }
  const calm = calmOf(f, also);
  return { ...calmStanding(calm, 0), calm };
}

/** The calm rung's words before the runs are known: what else waits, the day's traffic, and how it was answered. */
function calmOf({ period, speed }: TodayFacts, also: readonly string[]): TodayCalmVM {
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
  return {
    also: [...also],
    traffic: bits.length ? bits.join(" and ") : null,
    // "Handled everything" only when the receptionist did: a message you
    // answered yourself, or one nobody answered, is not the receptionist's.
    handled_all: period.unanswered_in_window === 0 && period.messages_out_you === 0,
    answered:
      speed !== null && period.messages_in > 0
        ? `answered ${period.answered_by_ai} of the ${period.messages_in} on its own, typically ${speedIn(speed, true)}.`
        : null,
  };
}

/**
 * The last rung of the ladder: nobody asked for a person, so the day's traffic, and whether the receptionist handled all
 * of it. "Nothing needs you" is said only over a queue with nothing in it: with a search waiting on an answer the head
 * said it above a queue that said "1 Need you" (Ruben, 7 Oct 2026), and with a campaign run waiting it said it under a
 * badge that counted the run (the wiring's second audit, S7-1). What still waits is said first, the runs before the
 * queue's own sentences, then the traffic.
 */
function calmStanding(c: TodayCalmVM, runs: number): TodayHeadline {
  const also = [...(runs > 0 ? [runsWaitingSentence(runs)] : []), ...c.also];
  const headline = also.length
    ? [...also, ...(c.traffic ? [`${c.traffic} today.`] : [])].join(" ")
    : c.traffic
      ? c.handled_all
        ? `The receptionist handled everything — ${c.traffic} today. Nothing needs you.`
        : `${c.traffic} today. Nothing needs you right now.`
      : "Nothing needs you.";
  // "It" only after a headline that named the receptionist ("The receptionist handled everything"); after any other
  // (what still waits, or the traffic alone) the sentence names it itself.
  const named = !also.length && !!c.traffic && c.handled_all;
  const detail = c.answered ? `${named ? "It" : "The receptionist"} ${c.answered}` : null;
  return { headline, detail, tone: "calm" };
}

/**
 * The standing said with the campaign runs waiting for your word (waits.ts runsThatWait): on the calm rung and the quiet
 * day a run leads the head, as the badge counts it, and "Nothing needs you" is never said over it; the alert and the
 * needs rungs stand as they are. Asked again with the same runs it answers the same, so a brief composed with its runs
 * (the server's) may be handed in again by a page that holds them.
 */
export function standingWithRuns<S extends TodayHead>(standing: S, runs: number): S {
  return runs > 0 && standing.calm ? { ...standing, ...calmStanding(standing.calm, runs) } : standing;
}

/** "1 draft on its way" beside the queue's parts: the replies counting down to send, which have no row; null for none. */
export function todayDraftsSub(n: number): string | null {
  return n ? (n === 1 ? "1 draft on its way" : `${n} drafts on their way`) : null;
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
  const { period, callMinutes } = f;
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
  const failed = todaySendFailure(f);
  if (failed) sentences.push(failed);
  return sentences;
}

/**
 * A reply that never reached the customer: the one line that must never be quiet. The send already escalated, but a
 * card saying "handled everything" while a message died in transit would be a lie of omission; so it is said on a
 * quiet day too (todayVM's quiet branch), where it was dropped with the day's other sentences (6 Oct 2026).
 */
export function todaySendFailure(f: TodayFacts): TodaySentenceVM | null {
  const { period, conversations, sinceMs } = f;
  if (!period.send_failures) return null;
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
  return {
    text: `${period.send_failures} repl${period.send_failures === 1 ? "y" : "ies"} failed to deliver — the customer got no answer.`,
    warn: true,
    ...(lastFailed ? { to: addressOf({ kind: "conversation", id: lastFailed.conv.id }) } : {}),
  };
}
