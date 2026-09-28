/**
 * The day's four figures (customer messages, answered by the receptionist, calls, new people), each with its
 * clause and its receipt, and the proof the lines are listening. The words they are said in live here too;
 * the list join and the seconds phrase are today-bands.ts's.
 */
import type { CallDto } from "../conversations/call-dto";
import { toCallVM } from "../conversations/call-vm";
import type { EscalationDto } from "../conversations/escalations";
import { threadChannelWords } from "../conversations/thread-channel";
import { contactName } from "../conversations/thread-contact";
import type { ConversationDto } from "../conversations/thread-dto";
import { reasonShort } from "../people/people";
import { capitalize, plural } from "../shared/words";
import { andList, secondsPhrase } from "./today-bands";
import { tzClock, tzDayAndTime } from "./today-clock";
import type { MetricsSummaryDto } from "./today-metrics";
import type { TodayFigureVM } from "./today-vm";

/** "once", "twice", "3 times". */
/** Small counts as words, so a receipt can never repeat its figure's digit: "three times", "Two are already resolved." */
const COUNT_WORDS: Record<number, string> = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
};
const countWord = (n: number): string => COUNT_WORDS[n] ?? String(n);
const timesWords = (n: number): string => (n === 1 ? "once" : n === 2 ? "twice" : `${countWord(n)} times`);

/**
 * Why the receptionist handed a thread over, as the tail of "Handed over once, ...": each reason with the word that
 * joins it. Never more than the data knows: non_text is "something it can't read", not a photo, because it may have
 * been audio, a sticker or a document. A reason with no words here falls back to People's short form.
 */
const REASON_WHY: Record<string, string> = {
  human_token: "because a customer asked for a person",
  non_text: "for something it can't read",
  refusal: "because it declined to answer",
  rate_cap: "because the reply limit was reached",
  policy_block: "because your reply setting held it",
  policy_ask: "for a booking or a question set to Ask me first",
  person_hold: "because it was held for you",
  carriers: "while waiting on carriers",
  email_review: "because they wrote by email",
  send_failed: "because a reply failed to send",
  deadman: "because no answer came in time",
  brain_error: "because it hit an error",
  manual: "because you flagged it",
  opt_out: "because they asked to stop",
  callback: "because they need a call back",
};
const reasonWhy = (r: string): string => REASON_WHY[r] ?? reasonShort(r) ?? r;

/** A wire's word inside a sentence: "by WhatsApp", "by email", "by text". */
const wireWord = (w: string): string => (w === "WhatsApp" ? w : w.toLowerCase());

/** Counts by key, most first, then by name; a count that is not a positive number is nothing. */
const counted = (o: Record<string, unknown> | null | undefined): Array<[string, number]> =>
  Object.entries(o ?? {})
    .map(([k, v]): [string, number] => [k, Math.max(0, Math.round(Number(v) || 0))])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const tally = (xs: readonly string[]): Array<[string, number]> =>
  counted(xs.reduce<Record<string, number>>((o, x) => ({ ...o, [x]: (o[x] ?? 0) + 1 }), {}));

/** A caller the voice provider could not name is counted in the clause, never named in the receipt by these words. */
const UNNAMED_CALLER = new Set(["Caller ID withheld", "Unknown caller", "Unknown"]);

/** How long after the last message the last reply went out, when it did within the hour; null otherwise. */
function replyGapSeconds(live: { last_inbound_at: string | null; last_outbound_at: string | null }): number | null {
  if (!live.last_outbound_at || !live.last_inbound_at) return null;
  const gap = Math.round((new Date(live.last_outbound_at).getTime() - new Date(live.last_inbound_at).getTime()) / 1000);
  return gap > 0 && gap < 3600 ? gap : null;
}

/**
 * The proof the lines are listening: when the last message arrived and how long the receptionist took to answer it.
 * Always said, never gated on the queue: on this workspace (no traffic, three open escalations) it was suppressed
 * exactly when an owner needed it. On a day with traffic it is the messages figure's clause; on a quiet day the
 * card's line, and the quiet card's own sentence ends with it, so the two cannot drift.
 */
export function todayProof(
  live: { last_inbound_at: string | null; last_outbound_at: string | null },
  tz: string,
  now: Date,
): string {
  const lastIn = tzDayAndTime(live.last_inbound_at, tz, now);
  if (!lastIn) return "No messages have arrived yet.";
  const gap = replyGapSeconds(live);
  return `The last message arrived ${lastIn}${gap !== null ? `, and the receptionist answered ${secondsPhrase(gap)} later` : ""}.`;
}

/**
 * The day's four figures, from the fields Today has fetched on every load and never read (period.new_contacts,
 * call_sentiments, calls_voicemail, messages_out_ai) and from the threads, calls and escalations the page holds.
 * Null on a day with nothing at all: a row of zeros is a product that died overnight, not a fact.
 *
 * A figure is the SQL's count over the whole day; the page holds the newest hundred threads and the open
 * escalations. So a receipt makes an absolute claim ("All by WhatsApp.", "both on WhatsApp") only when what the page
 * holds accounts for the figure's own total, and otherwise says what it is counting ("Of the 4 in the Inbox: ...").
 */
export function figuresOf(
  m: MetricsSummaryDto,
  conversations: ConversationDto[],
  callsInWindow: CallDto[],
  /** The escalations read as it came (state=open): not `openEsc`, which drops the ones a person has taken over. */
  escalations: ReadonlyArray<EscalationDto & { conversation_id: string }>,
  tz: string,
  now: Date,
): TodayFigureVM[] | null {
  const p = m.period;
  const live = m.now;
  if (p.messages_in + p.calls + p.new_contacts === 0) return null;
  const windowMs = new Date(m.window.since).getTime();
  const fresh = (x: { created_at: string; meta: Record<string, unknown> | null }) =>
    x.meta?.backfill !== true && new Date(x.created_at).getTime() >= windowMs;

  // Customer messages: the proof as the clause, the wires as the why. A message with no wire named is WhatsApp, which
  // is what every row was before the column said (viewmodels.ts writtenChannelOf). The receipt says nothing when the
  // read holds none of today's messages, and says what it counted when the read holds fewer than the figure.
  const gap = replyGapSeconds(live);
  const lastAt = tzClock(live.last_inbound_at, tz, now);
  const wires = tally(
    conversations.flatMap((c) =>
      c.messages
        .filter((x) => x.direction === "inbound" && x.sender === "customer" && fresh(x))
        .map((x) => threadChannelWords([x])),
    ),
  );
  const held = wires.reduce((s, [, n]) => s + n, 0);
  const split = andList(wires.map(([w, n]) => `${n} by ${wireWord(w)}`));
  const messages: TodayFigureVM = {
    id: "messages",
    label: "customer messages",
    value: p.messages_in,
    meta: lastAt ? `last at ${lastAt}${gap !== null ? `, answered in ${secondsPhrase(gap)}` : ""}` : "none yet",
    receipt: wires.length
      ? {
          // What the page holds, said once: never "Of the 4 in the Inbox: 4 by WhatsApp."
          text:
            held !== p.messages_in
              ? held === 1
                ? `The one the Inbox holds came by ${wireWord(wires[0][0])}.`
                : wires.length === 1
                  ? `The ${held} the Inbox holds ${held === 2 ? "both" : "all"} came by ${wireWord(wires[0][0])}.`
                  : `Of the ${held} in the Inbox: ${split}.`
              : wires.length === 1
                ? `All by ${wireWord(wires[0][0])}.`
                : `${split}.`,
          door: { label: "Open the Inbox", to: "inbox" },
        }
      : null,
  };

  // Answered by the receptionist: how fast and how often it stopped as the clause; why it stopped and what it sent as
  // the why. The clause is the SQL's count of handovers opened today; the reasons are today's escalations as the page
  // holds them (the open ones: the read is state=open), so a handover already resolved is counted, not named.
  // period.escalation_reasons is every OPEN escalation whatever its age (00037_hygiene.sql), so it is not read here:
  // a clause about today with a breakdown about all time contradicted itself on the first workspace that opened it.
  // The raw read, not the queue's list: a handover a teammate has taken over is still open, not resolved.
  const todays = escalations.filter((e) => e.state === "open" && new Date(e.created_at).getTime() >= windowMs);
  const reasons = tally(todays.map((e) => e.reason));
  const resolved = Math.max(0, p.escalations_new - todays.length);
  const answeredMeta =
    [
      p.median_reply_seconds_ai !== null ? `typically in ${secondsPhrase(p.median_reply_seconds_ai)}` : "",
      p.escalations_new ? `${p.escalations_new} handed over` : p.answered_by_ai ? "none handed over" : "",
    ]
      .filter(Boolean)
      .join(", ") || (p.messages_in ? "none answered yet" : "nothing to answer yet");
  // The why as a person would say it: how many times it handed over, why each time, and that the rest it answered
  // itself. It was a ledger ("Asked for a person: once; sent something the receptionist can't read: once."); the
  // canvas wrote the same facts as a sentence, and a sentence is what an owner reads. Counts are words, so the
  // receipt can never repeat the figure's digit; the handovers are the SQL's count, the reasons are today's open ones.
  const handedOver = p.escalations_new;
  let handovers = "";
  if (handedOver) {
    const lead = `Handed over ${timesWords(handedOver)}`;
    if (!reasons.length) {
      // Every one already resolved: nothing open to give a reason for.
      handovers = `${lead}, ${handedOver === 1 ? "already resolved" : handedOver === 2 ? "both already resolved" : "all already resolved"}.`;
    } else if (reasons.length === 1 && reasons[0][1] === handedOver) {
      // One reason for all of them: "once, because ...", "twice, both times because ...", "three times, each time ...".
      const [r, n] = reasons[0];
      handovers = `${lead}, ${n === 1 ? "" : n === 2 ? "both times " : "each time "}${reasonWhy(r)}.`;
    } else {
      // The breakdown, most common first; what is already resolved is not in the list, so it is said after.
      const parts = reasons.map(([r, n]) => `${timesWords(n)} ${reasonWhy(r)}`).join(", ");
      const done = resolved
        ? ` ${capitalize(countWord(resolved))} ${resolved === 1 ? "is" : "are"} already resolved.`
        : "";
      handovers = `${lead}: ${parts}.${done}`;
    }
  }
  // answered_by_ai is the asks it answered on its own, so with a handover on the day those are "the rest".
  const answeredItself = handedOver && p.answered_by_ai ? "The rest it answered itself." : "";
  // answered_by_ai counts the asks it answered and messages_out_ai the messages it sent: more is more than one thing
  // said, worth a sentence; equal is one reply each, worth saying only when there is nothing else to say; fewer means
  // one reply answered several asks, which is not worth a sentence.
  const sentMore =
    p.messages_out_ai > p.answered_by_ai ? `It sent ${plural(p.messages_out_ai, "message")} in all.` : "";
  const sentEach = p.messages_out_ai && p.messages_out_ai === p.answered_by_ai ? "One reply each." : "";
  const answeredWhy = (handedOver ? [handovers, answeredItself, sentMore] : [sentMore || sentEach]).filter(Boolean);
  const answered: TodayFigureVM = {
    id: "answered",
    label: "answered by the receptionist",
    value: p.answered_by_ai,
    meta: answeredMeta,
    receipt: answeredWhy.length
      ? { text: answeredWhy.join(" "), door: p.escalations_new ? { label: "See the handovers", to: "inbox" } : null }
      : null,
  };

  // Calls: the time and the voicemails as the clause; the moods and who reached voicemail as the why. A caller is
  // named once, by name or number; a withheld or unknown caller is in the clause's count and never in the sentence.
  const moods = counted(p.call_sentiments);
  const moodOf = ([mood, n]: [string, number]) =>
    n === p.calls
      ? p.calls === 1
        ? `it as ${mood.toLowerCase()}`
        : `all of them as ${mood.toLowerCase()}`
      : `${n} as ${mood.toLowerCase()}`;
  const moodWords = moods.length ? `The voice provider read ${andList(moods.map(moodOf))}.` : "";
  const voicemail = [
    ...new Map(
      callsInWindow
        .filter((c) => c.in_voicemail)
        .map((c) => [c.contact_id ?? c.from_e164 ?? c.id, toCallVM(c, tz, now).who]),
    ).values(),
  ].filter((who) => !UNNAMED_CALLER.has(who));
  const voicemailWords = voicemail.length
    ? `${andList(voicemail.length > 3 ? [...voicemail.slice(0, 3), `${voicemail.length - 3} more`] : voicemail)} reached voicemail.`
    : "";
  const callsMeta =
    [
      p.call_seconds > 0
        ? p.call_seconds < 60
          ? "under a minute on the phone"
          : `${Math.round(p.call_seconds / 60)} min on the phone`
        : "",
      p.calls_voicemail ? `${p.calls_voicemail} to voicemail` : "",
    ]
      .filter(Boolean)
      .join(", ") || (p.calls ? "none connected" : "none yet");
  const calls: TodayFigureVM = {
    id: "calls",
    label: "calls",
    value: p.calls,
    meta: callsMeta,
    receipt:
      moodWords || voicemailWords
        ? {
            text: [moodWords, voicemailWords].filter(Boolean).join(" "),
            door: { label: "Open the calls", to: "conversations/phone" },
          }
        : null,
  };

  // New people: the threads whose first real message is the customer's and today. The figure is the SQL's count of
  // people whose first word or call came today (00231: never one who has had neither); the threads the page holds may
  // be fewer (a name is said only for a person the figure counts) or more (someone who existed before and wrote for
  // the first time today is not new), so a wire or a name is said only when the two agree.
  const newThreads = conversations.filter((c) => {
    const first = [...c.messages]
      .filter((x) => x.meta?.backfill !== true)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    return !!first && first.sender === "customer" && fresh(first);
  });
  const agree = p.new_contacts > 0 && newThreads.length === p.new_contacts;
  const newWires = tally(newThreads.map((c) => threadChannelWords(c.messages)));
  const names = agree ? newThreads.map((c) => contactName(c)) : [];
  const said = names.slice(0, 3);
  const newPeople: TodayFigureVM = {
    id: "new",
    label: "new people",
    value: p.new_contacts,
    meta: !p.new_contacts
      ? "nobody new yet"
      : !agree
        ? "first contact today"
        : newWires.length === 1
          ? `${p.new_contacts === 1 ? "on" : p.new_contacts === 2 ? "both on" : "all on"} ${wireWord(newWires[0][0])}`
          : `on ${andList(newWires.map(([w]) => wireWord(w)))}`,
    // Named when the two counts agree. When they do not, the figure still opens: the reason they disagree IS
    // the answer to what an owner is asking -- the count is everyone whose first word or call came today, and the
    // page only holds the ones who wrote. Without this the fourth figure was the one stat on the card with nothing
    // under it, so a hover that worked three times in a row did nothing on the fourth.
    receipt: said.length
      ? {
          text: `${andList(names.length > 3 ? [...said, `${names.length - 3} more`] : said)} wrote for the first time today.`,
          door: { label: "Open People", to: "clients/seg:new_week" },
        }
      : p.new_contacts > 0
        ? {
            text: `Counted however they reached you — a message or a call${newThreads.length < p.new_contacts ? ", so not everyone here has a thread to open yet" : ""}.`,
            door: { label: "Open People", to: "clients/seg:new_week" },
          }
        : null,
  };
  return [messages, answered, calls, newPeople];
}
