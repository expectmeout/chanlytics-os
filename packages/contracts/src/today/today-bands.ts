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
import { NEED_YOU_WORDS } from "../need-you/need-you-words";
import { durationWords } from "../shared/clock";
import { capitalize, withStop } from "../shared/words";
import { runOffClause } from "../sequences/sequence-run-off";
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
 * What each dark wire does with what reaches it, two sentences a wire: "Phone line is disconnected. Calls are picked up
 * without your facts and are not recorded." The second is the standing value's clause (lines/caller-gets.ts), the same
 * one Connections, Live and Start say, and not a sentence of Today's own: this alert said "messages coming in are not
 * being answered" of a phone line whose calls the receptionist picks up. Two sentences, not a dash (Today in three
 * zones, 2 Nov 2026): the band says what is down, then what it costs.
 */
const darkWires = (down: TodayFacts["wires"]): string =>
  down
    .map((w) => `${w.label} is disconnected. ${capitalize(lineOffGets(w.kind, channelNoun(w.kind)).gets)}.`)
    .join(" ");

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
export function todayStanding(f: TodayFacts): Pick<TodayVM["standing"], "chips" | "lines" | "alert" | "paused"> {
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
  const paused = metrics.workspace.status === "paused";
  const alert = paused ? `This workspace is paused. ${PAUSED_WORDS}` : down.length ? darkWires(down) : null;
  return { chips, lines, alert, paused };
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

/**
 * What the head says on a quiet day, by the wires (as todayQueueEmpty decides an empty queue). No wire yet is a new
 * owner's first Today: nothing can come in, and the head says what changes that (the canvas of 2 Nov 2026). A wire on that
 * the receptionist answers: it is on, and when the last message came and how fast it was answered. Only wires it does not
 * answer (an email-only workspace): nothing is in the queue, and how what comes in waits, never that the receptionist is
 * on, which it is not for them.
 */
function quietHead(wires: TodayFacts["wires"], last: string): { headline: string; sub: string } {
  if (wires.length === 0)
    return { headline: "Nothing can come in yet.", sub: "Connect a line and your receptionist starts answering." };
  const on = wires.filter((w) => w.on);
  if (on.some((w) => CHANNEL_ANSWERED.has(w.kind)))
    return { headline: "Nothing needs you.", sub: ["The receptionist is on.", last].filter(Boolean).join(" ") };
  return {
    headline: "Nothing in the queue.",
    sub:
      on.length && on.every((w) => w.kind === "email")
        ? EMAIL_NOT_ANSWERED_SENTENCE
        : "No line the receptionist answers is connected.",
  };
}

/** The quiet day: prove we are listening, don't show a row of zeroes. `proof` is todayProof's sentence. */
/** The quiet day's card, less its figures, which the brief adds (today-figures.ts quietFigures). */
export function todayQuietDay(
  f: TodayFacts,
  /** When the last message came and how fast it was answered (today-figures.ts todayLastLine), or "" with none yet. */
  last: string,
): NonNullable<TodayVM["quiet"]> {
  const { wires, conversations } = f;
  return {
    ...quietHead(wires, last),
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

/**
 * What Today says besides the ladder (the phone canvas, 28 Oct 2026; on a desk too since the redesign of 1 Nov 2026): its
 * parts' names and the day's lines.
 */
export const TODAY_PHONE_WORDS = {
  /** The day's card: its name, Now or Next and Then over its two visits, and its door. */
  day: "The day",
  now: "Now",
  next: "Next",
  then: "Then",
  calendar: "Calendar",
  end: "That's everything for today.",
  /** The visits past what the day draws of the rest of it: "3 more visits on the Calendar". */
  dayMore: (n: number, one: string, many: string) => `${n} more ${n === 1 ? one : many} on the Calendar`,
  /** A run that went out today, in the day's rest: "went out at 9:00 AM", and a playbook's "ran at 9:00 AM". */
  wentOut: (clock: string, ran = false) => `${ran ? "ran" : "went out"} at ${clock}`,
  /**
   * Each of the day's four figures by its short name, for the row of numbers on a desk's head and a phone's card alike
   * (0076): the figure's own label ("answered by the receptionist") is its title, and its clause and receipt say the rest
   * when it is pressed. A word each, so a phone's row of four stays one line ("new people" broke in its 65px; the
   * phone pass, 3 Nov 2026); the figure's label, its title, still says who is new.
   */
  figure: { booked: "booked", answered: "answered", calls: "calls", new: "new" },
  /** The day's figures on a phone, with the week under them: the card's name. */
  soFar: "Today so far",
  /** The day after closing (the canvas of 2 Nov 2026): tomorrow's name, its first visit, and what already happened. */
  tomorrow: "Tomorrow",
  first: "First",
  earlier: (n: number) => `${n} earlier`,
  /** What cannot wait's one door: a line that is down is reconnected, a paused workspace is billing's. */
  alertDoor: { reconnect: "Reconnect", billing: "Open billing" },
  /** The day with no calendar linked: its line, and the one row that links one. */
  link: {
    note: "No calendar linked",
    title: "Link your calendar",
    sub: "The receptionist offers what's open, and the day fills in here",
    act: "Link it",
  },
  /**
   * An hour a cancellation freed: offered to the people who asked and never booked (decision 0082). `done` where its batch
   * waits for the owner's OK (the sequence asks first), `sent` where it went or goes on its own.
   */
  offer: {
    act: "Offer it",
    done: "Offered · in To decide",
    sent: (n: number) => `Offered to ${n} ${n === 1 ? "person" : "people"}`,
    could: (n: number) => `${n} ${n === 1 ? "person" : "people"} could take it`,
    nobody: "Nobody is waiting for a time like it",
  },
} as const;

/**
 * Why an hour was not offered, in the owner's words (decision 0082): the time's own reasons (contracts freedTimeOf, which
 * the press asks as the cancellation's arrival does) and the run's (core runPlaybook's `skipped`, `off` with its reason).
 * Null for a reason the page words itself (the preview, no step, paused, nobody).
 */
export function offerRefusedWords(why: string, detail: string | null = null): string | null {
  const clause = why === "off" && detail ? runOffClause(detail) : null;
  if (clause) return `Nothing was offered: ${clause}.`;
  if (why === "off" && detail === "freed_time_passed") return "That hour has begun: nobody can take it now.";
  if (why === "gone") return "That cancellation is no longer on the calendar.";
  if (why === "too_soon") return "It starts too soon for the notice the receptionist gives.";
  if (why === "past_window") return "It is further ahead than the receptionist books.";
  if (why === "closed" || why === "not_free" || why === "too_short") return "That time is no longer open.";
  if (why === "no_person" || why === "all_day" || why === "no_was_at" || why === "no_hours")
    return "This one can't be offered.";
  return null;
}

/** Today's head after the greeting: what leads it, said in the darker ink, and the rest of its one sentence. */
export interface TodayHeadLineVM {
  lead: string;
  rest: string | null;
}

/**
 * The head's one sentence (Today in three zones, 2 Nov 2026), on a desk and a phone alike, under the greeting the frame
 * says as the page's name: what leads, then the rest, and it follows the rows. A line that is down leads, and how many need
 * you as well. Else how many need you, the one count (need-you-groups.ts needYouCountOf: every row above To do still
 * open), then what Ask prepared and the one thing that cannot wait (`say`: need-you-words.ts needYouSay), as the rows
 * still hold them; after closing, how today went instead (`went`: todayWentLine). With nobody waiting: on a day nothing
 * came in, what is listening (`quiet`: todayQuietDay); else "Nothing needs you." and how today went after closing, or that
 * that's everyone. One sentence, said once.
 */
export function todayHeadLine(
  standing: TodayHead,
  waiting: number,
  say: string | null,
  /** A day nothing came in: its head (todayQuietDay), "Nothing needs you." and that the receptionist is on. */
  quiet: { headline: string; sub: string } | null = null,
  /** After closing, the day turned to tomorrow (the canvas of 2 Nov 2026): how today went (todayWentLine). */
  went: string | null = null,
): TodayHeadLineVM {
  if (standing.tone === "alert")
    return { lead: standing.headline, rest: waiting > 0 ? NEED_YOU_WORDS.countAsWell(waiting) : null };
  if (waiting > 0) return { lead: NEED_YOU_WORDS.count(waiting), rest: went ?? (say ? withStop(say) : null) };
  if (quiet) return { lead: quiet.headline, rest: quiet.sub || null };
  return { lead: "Nothing needs you.", rest: went ?? NEED_YOU_WORDS.end };
}

/**
 * How today went, as the head says it once the day has turned to tomorrow (the canvas of 2 Nov 2026): what was booked,
 * then how many of the customer messages the receptionist answered. "Today: 4 booked, 31 of 34 answered by the
 * receptionist." Null where neither was counted.
 */
export function todayWentLine(
  figures: ReadonlyArray<{ id: string; value: number | null; of?: number }>,
): string | null {
  const booked = figures.find((f) => f.id === "booked")?.value ?? null;
  const answered = figures.find((f) => f.id === "answered");
  const parts = [
    booked !== null ? `${booked} booked` : "",
    answered && answered.value !== null && answered.of
      ? `${answered.value} of ${answered.of} answered by the receptionist`
      : "",
  ].filter(Boolean);
  return parts.length ? `Today: ${parts.join(", ")}.` : null;
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
