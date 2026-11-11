/**
 * A sequence's row, in one line (decision 0126; the canvas "Sequences: lines that tell the truth", calls S1 to S9): the
 * first of these that is true. What waits on you and since when ("2 follow-ups wait for your OK · since Sun"); a twin
 * on its moment; a one-off's day; a paused one's people; what goes next and to how many ("Next tomorrow 9:00 AM · 6
 * people"); who is in it; that every lead is through; what it sent; what starts it. Never a bare zero. The list and Ask
 * read it, so Ask says what the row says.
 */
import { appointmentWords, type AppointmentWord } from "../../../journey/appointment-word";
import { clockDate, clockNear, clockNearWhen, clockTime, clockWhen, zoneDayKey } from "../../../shared/clock";
import { plural } from "../../../shared/words";
import type { SequenceDateDto, SequenceRowDto } from "../dto";
import { okSendsNothing } from "../list";
import { SEQUENCE_WORDS, sequenceStartWords, twinLineOf, type SequenceTwin } from "./flow";
import { batchWaitsUntilTonight } from "./next";

/** "since 9:05 AM" today, "since yesterday", "since Sun" within the week, else "since Oct 30". */
function sinceWords(atMs: number, tz: string, nowMs: number): string {
  return `since ${zoneDayKey(atMs, tz) === zoneDayKey(nowMs, tz) ? clockTime(atMs, tz) : clockNear(atMs, tz, nowMs)}`;
}

/** Who a waiting OK would send to: a customer's people, else a cold email's first emails, follow-ups, or both. */
function waitingWords(row: Pick<SequenceRowDto, "needs" | "first" | "starts">, people: number): string {
  if (row.starts !== "leads") return plural(people, "person waits", "people wait");
  const first = row.first?.id ?? null;
  const later = row.needs.batches.some((b) => b.step_id !== first);
  const firsts = row.needs.batches.some((b) => b.step_id === first);
  if (later && !firsts) return plural(people, "follow-up waits", "follow-ups wait");
  if (firsts && !later) return plural(people, "first email waits", "first emails wait");
  return plural(people, "email waits", "emails wait");
}

/** One kind of what needs you: in full when it is alone, short beside another; how its wait is said where it is. */
interface NeedsKind {
  full: string;
  short: string;
  ends: "since" | "tonight" | "none";
}

/** The kinds of what needs you in a sequence, in the order they are said. */
function needsKinds(row: Pick<SequenceRowDto, "needs" | "first" | "starts">): NeedsKind[] {
  const needs = row.needs;
  const kinds: NeedsKind[] = [];
  // The batch an OK goes to is the soonest: a customer's lapses tonight (the sweep skips it once its day is gone).
  const soonest = needs.batches[0];
  const okEnds = soonest && batchWaitsUntilTonight(soonest) ? "tonight" : "since";
  if (needs.waiting_people > 0)
    kinds.push({
      full: `${waitingWords(row, needs.waiting_people)} for your OK`,
      short: `${needs.waiting_people} wait for your OK`,
      ends: okEnds,
    });
  else if (needs.waiting > 0 && !okSendsNothing(needs))
    kinds.push({ full: "The next batch waits for your OK", short: "waits for your OK", ends: okEnds });
  if (needs.held > 0)
    kinds.push({
      full: `${plural(needs.held, "email", "emails")} held for your look`,
      short: `${needs.held} held`,
      ends: "since",
    });
  if (needs.to_send > 0)
    kinds.push({
      full: `${plural(needs.to_send, "email", "emails")} for you to send`,
      short: `${needs.to_send} for you to send`,
      ends: "since",
    });
  if (needs.replies > 0) {
    const sentence = `${needs.replies} wrote back · answer them`;
    kinds.push({ full: sentence, short: sentence, ends: "none" });
  }
  return kinds;
}

/**
 * What needs you in a sequence, as its row and Ask say it: one kind in full with how long it has waited ("1 email held
 * for your look · since Oct 30"; a customer's batch "until tonight", when it lapses), two or more short and dateless,
 * as they were ("14 wait for your OK · 2 held"), because the answer keeps one oldest time for them all. Empty when
 * nothing does.
 */
export function needsWords(
  row: Pick<SequenceRowDto, "needs" | "first" | "starts">,
  clock: { tz: string; nowMs: number },
): string {
  const kinds = needsKinds(row);
  const [only, ...more] = kinds;
  if (!only) return "";
  if (more.length > 0) return kinds.map((k) => k.short).join(" · ");
  if (only.ends === "tonight") return `${only.full} · ${SEQUENCE_WORDS.untilTonight}`;
  const oldest = row.needs.oldest_at;
  if (only.ends === "since" && oldest) return `${only.full} · ${sinceWords(Date.parse(oldest), clock.tz, clock.nowMs)}`;
  return only.full;
}

/**
 * What starts a sequence nobody is in yet, short enough for a phone row: the short form of the flow's own sentence
 * (next.ts momentStartsSentence), which says the same moments at length.
 */
function startsWhenWords(row: Pick<SequenceRowDto, "starts" | "first">, word: AppointmentWord): string {
  if (row.starts === "list") return `Starts when someone joins ${row.first?.list_name ?? "its list"}`;
  const words = appointmentWords(word);
  switch (row.first?.trigger) {
    case "visit_tomorrow":
      return `Sends the day before each ${words.one}`;
    case "visit_soon":
      return `Sends two hours before each ${words.one}`;
    case "visited":
      return `Sends after each ${words.one} you mark kept`;
    case "visit_missed":
      return `Sends when you mark ${words.a} missed`;
    case "asked_no_booking":
      return "Starts when someone asks and doesn’t book";
    case "quiet_30":
      return "Starts when someone goes quiet";
    case "lapsed":
      return "Starts when someone stops booking";
    case "new_week":
      return "Starts when someone first gets in touch";
    case "phoned_only":
      return "Starts when someone has only phoned";
    case "everyone_monthly":
      return "Sends once a month";
    case "proposal_waiting":
      return "Starts when a proposal waits";
    case "slot_opened":
      return "Starts when a cancellation frees a time";
    default:
      return "Starts at its moment";
  }
}

/** A draft: a one-off kept to send, else whether it can start or has emails to write, and the day it was made. */
function draftLine(row: SequenceRowDto, tz: string, nowMs: number): string {
  if (row.once) return SEQUENCE_WORDS.keptOnce;
  const made = `made ${clockDate(Date.parse(row.created_at), tz, nowMs)}`;
  const unwritten = row.unwritten ?? 0;
  return unwritten > 0 ? `${plural(unwritten, "email", "emails")} to write · ${made}` : `Ready to start · ${made}`;
}

/** A one-off's day in its own tense: didn't go, went with what it drew back, goes, or the day it went with no report. */
function oneOffLine(row: SequenceRowDto, date: SequenceDateDto, tz: string, nowMs: number): string {
  const at = Date.parse(date.at);
  const people = plural(date.people, "person", "people");
  if (date.state === "failed") return `Didn’t go · ${people} · ${clockNear(at, tz, nowMs)}`;
  if (row.last)
    return `Sent ${clockDate(Date.parse(row.last.at), tz, nowMs)} · ${plural(row.last.sent, "person", "people")} · ${row.last.replied} replied`;
  // Still to go, it says when, as its toast did ("Goes at 2:40 PM"); gone without a report yet, the day it went.
  const when = at > nowMs ? `Goes ${clockWhen(at, tz, nowMs).replace(/^today /, "at ")}` : clockDate(at, tz, nowMs);
  return `${when} · ${people}`;
}

/** When the next people are reached and how many: "Next tomorrow 9:00 AM · 6 people", or going out now once it has come. */
function nextLine(atIso: string, people: number, tz: string, nowMs: number): string {
  const at = Date.parse(atIso);
  if (at <= nowMs) return SEQUENCE_WORDS.goingOut(people);
  const when = `Next ${clockNearWhen(at, tz, nowMs)}`;
  return people > 0 ? `${when} · ${plural(people, "person", "people")}` : when;
}

/** What a sequence sent last, never a bare zero: null where it sent nothing. */
function lastLine(row: SequenceRowDto, tz: string, nowMs: number): string | null {
  if (!row.last || row.last.sent === 0) return null;
  return `${clockDate(Date.parse(row.last.at), tz, nowMs)} · ${row.last.sent} sent · ${row.last.replied} replied`;
}

/** A paused sequence: who waits for it to turn on, else what starts it and that nobody waits (its pill says Paused). */
function pausedLine(row: SequenceRowDto, word: AppointmentWord): string {
  return row.in_it > 0
    ? `${plural(row.in_it, "waits", "wait")} for it to turn on`
    : `${sequenceStartWords(row, word)} · nobody waits on it`;
}

/** A cold email nobody is in: every lead through, and whether it adds new ones by itself; else none added yet. */
function leadsIdleLine(row: SequenceRowDto): string {
  if (!row.last) return "No leads yet · add some";
  return row.first?.source_search_id ? "All leads through · waits for new ones" : "All leads through · add more";
}

/** A row's line: the first of these that is true (decision 0126). */
export function sequenceRowLine(
  row: SequenceRowDto,
  at: { tz: string; nowMs: number; word: AppointmentWord; twin: SequenceTwin | null },
): string {
  const { tz, nowMs } = at;
  if (row.state === "draft") return draftLine(row, tz, nowMs);
  const needs = needsWords(row, at);
  if (needs) return needs;
  if (at.twin) return twinLineOf(row);
  if (row.starts === "date" && row.date) return oneOffLine(row, row.date, tz, nowMs);
  if (row.state === "ended") return lastLine(row, tz, nowMs) ?? "Sent nothing";
  if (row.state === "paused") return pausedLine(row, at.word);
  if (row.next) return nextLine(row.next.at, row.next.people, tz, nowMs);
  if (row.coming && row.coming.people > 0) return nextLine(row.coming.at, row.coming.people, tz, nowMs);
  if (row.in_it > 0) return `${row.in_it} in it`;
  if (row.starts === "leads") return leadsIdleLine(row);
  return lastLine(row, tz, nowMs) ?? startsWhenWords(row, at.word);
}
