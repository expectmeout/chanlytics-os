/** Words: next. */

import { appointmentWords, type AppointmentWord } from "../../../journey/appointment-word";
import { occasionWords } from "../../playbooks/triggers/occasions";
import { campaignRunsOn, nextRunOf } from "../../playbooks/schedule";
import { triggerOf } from "../../playbooks/triggers/notices";
import { clockAhead, clockDate, clockTime, clockWhen, wallClockAt, zoneDayKey } from "../../../shared/clock";
import { DAY_MS } from "../../../shared/time";
import { plural } from "../../../shared/words";
import { runApproveWords } from "../../../shell/campaign-rooms";
import type { SequenceNeedsDto, SequencePeopleGroup, SequenceRowDto, SequenceStepDto } from "../dto";
import { heldByCheckWords, okSendsNothing } from "../list";
import { sequenceRunOff, type RunOffReason } from "../run-off";
import { SEQUENCE_STATE_WORDS, SEQUENCE_WORDS, sequenceApprovalWords, twinLineOf, type SequenceTwin } from "./flow";
import { oneOffPeople } from "../one-off";

/** When a sequence's next batch goes, and to how many where it is counted; `soon` when its hour has come and it is due. */
export interface SequenceNext {
  at: number;
  people: number | null;
  soon: boolean;
  /**
   * For a sequence an occasion starts (decision 0119): how many people wait for their own time, of whom `at` is the
   * first's. Absent for a batch, which goes to its people together.
   */
  waiting?: number;
}

/**
 * What goes next, for the line at the top of a record's Steps (the phone review: a reminder's record never said it): the
 * batch already made (waiting, scheduled or going), else, for a sequence on a moment or a list that runs today, its
 * first step's next run by its hour (contracts nextRunOf, the one rule every page asks), which a day's run makes at that
 * hour: today's while it has not run, tomorrow's once it has. `lastRunFor` is the day its first step last ran
 * (`sequence_steps.last_run_for`, the record's read); undefined where the read is from a server before it, which says
 * nothing it cannot know. Null for one paused, ended, a draft, or a one-off (its Starts line says its day).
 */
export function sequenceNextOf(
  row: SequenceRowDto,
  lastRunFor: string | null | undefined,
  tz: string,
  nowMs: number,
): SequenceNext | null {
  if (row.state !== "on" || row.starts === "date") return null;
  if (row.next)
    return { at: Date.parse(row.next.at), people: row.next.people > 0 ? row.next.people : null, soon: false };
  // An occasion's sequence makes no batch ahead: the first person waiting is its next, each at a time of their own.
  if (row.coming && row.coming.people > 0)
    return { at: Date.parse(row.coming.at), people: null, soon: false, waiting: row.coming.people };
  return row.starts === "moment" || row.starts === "list" ? firstRunNext(row, lastRunFor, tz, nowMs) : null;
}

/**
 * Its first step's next run by its hour (00462 sequence_steps_due); null where it cannot know, for a freed time's (0082),
 * and for one an occasion starts (0119): neither runs by the hour.
 */
function firstRunNext(
  row: SequenceRowDto,
  lastRunFor: string | null | undefined,
  tz: string,
  nowMs: number,
): SequenceNext | null {
  const first = row.first;
  const kind = first ? triggerOf(first.trigger)?.kind : null;
  if (lastRunFor === undefined || !first || kind === "freed" || kind === "occasion") return null;
  const now = new Date(nowMs);
  if (!campaignRunsOn(first, { tz, now })) return null;
  const run = nextRunOf({ run_hour: first.run_hour, last_run_for: lastRunFor }, tz, now);
  const today = zoneDayKey(nowMs, tz);
  const day = run.day === "today" ? today : zoneDayKey(wallClockAt(tz, today, 12, 0) + DAY_MS, tz);
  return { at: wallClockAt(tz, day, run.hour, 0), people: null, soon: run.soon };
}

/**
 * When a sequence to leads that is on plans the leads added to it, Added until its first step runs at its hour (00459):
 * "tomorrow 9:00 AM", "within the hour". Null for any other, or where the read does not say the day it last ran.
 */
export function leadsPlannedWords(
  row: SequenceRowDto,
  lastRunFor: string | null | undefined,
  tz: string,
  nowMs: number,
): string | null {
  if (row.starts !== "leads" || row.state !== "on") return null;
  const next = firstRunNext(row, lastRunFor, tz, nowMs);
  return next ? sequenceNextWords(next, tz, nowMs) : null;
}

/**
 * The next batch in words, after "Next": "tomorrow 10:00 AM · 3 people", "within the hour", "now". For a sequence an
 * occasion starts, the first person's time and how many wait behind it: "today 2:00 PM · first of 5 people".
 */
export function sequenceNextWords(next: SequenceNext, tz: string, nowMs: number): string {
  const when = next.soon ? "within the hour" : clockAhead(next.at, tz, nowMs);
  if (next.waiting) return next.waiting === 1 ? `${when} · 1 person` : `${when} · first of ${next.waiting} people`;
  return next.people ? `${when} · ${plural(next.people, "person", "people")}` : when;
}

/**
 * A paused sequence's dock on a phone (the canvas's Paused board): it says so, and how many wait for it where any do. Its
 * act is Turn on, asked first. Null for any other, and for a one-off, whose state is its batch's.
 */
export function sequencePausedDock(row: SequenceRowDto): { line: string; fact: string | null } | null {
  if (row.state !== "paused" || row.starts === "date") return null;
  return {
    line: SEQUENCE_STATE_WORDS.paused,
    fact: row.in_it > 0 ? `${plural(row.in_it, "person waits", "people wait")} for it` : null,
  };
}

/** Who approves a sequence's batches, under that item of its More, which opens How it runs: "Holds each batch for you to stop". */
export function sequenceWhoApprovesHint(mode: string | null, trigger: string | null | undefined): string {
  const how = sequenceApprovalWords(mode, trigger);
  return how.charAt(0).toUpperCase() + how.slice(1);
}

/**
 * The one notice a sequence shows (D8): the most pressing thing that needs you, with its act. Null when nothing does.
 * `words` is the whole sentence (a desk's notice, Ask); `line` and `fact` are a phone's dock, its line and the one fact
 * under it, so the dock says each once and stays one capsule high.
 */
export interface SequenceNotice {
  kind: "waiting" | "off" | "twin" | "held" | "to_send" | "replies" | "words";
  words: string;
  line: string;
  fact: string | null;
  act: string | null;
  /** The batch it is about, when it is one. */
  batchId: string | null;
  /** The step it is about, when it is one (new words turned down): its id and place. */
  stepId: string | null;
  /** A run that did nothing (`off`): why, and the door that mends it where it is one (sequences/run-off.ts). */
  off?: { reason: RunOffReason; mends: "door" | "end" | null; to: string | null };
}

const noticeOf = (n: Omit<SequenceNotice, "batchId" | "stepId"> & Partial<SequenceNotice>): SequenceNotice => ({
  batchId: null,
  stepId: null,
  ...n,
});

/**
 * Whether a batch waiting for an OK can wait only until its day is gone: a customer's (a moment's, a list's or a step
 * after the first: its audience a playbook's), which the sweep skips once an OK could no longer send it on its day
 * (contracts runApprovalRefusal). A sequence to leads' batch and a one-off wait until they are answered. Its `at` is
 * when it was made, never when it goes: an OK sends it at once.
 */
export const batchWaitsUntilTonight = (batch: Pick<SequenceNeedsDto["batches"][number], "audience">): boolean =>
  batch.audience?.kind === "playbook";

/** A batch waiting for an OK, as the notice says it: its people and how long it waits, the step where there are several. */
function waitingNotice(steps: readonly SequenceStepDto[], batch: SequenceNeedsDto["batches"][number]): SequenceNotice {
  const people = batch.people;
  const place = steps.length > 1 ? steps.find((s) => s.id === batch.step_id)?.place : undefined;
  const until = batchWaitsUntilTonight(batch) ? ` · ${SEQUENCE_WORDS.untilTonight}` : "";
  const fact = [place ? `Step ${place}` : null, until ? SEQUENCE_WORDS.untilTonight : null].filter(Boolean).join(" · ");
  // A batch that names nobody yet (its people are counted as it is planned) is said as the batch, never as "0 people".
  return noticeOf({
    kind: "waiting",
    words:
      people > 0
        ? `${plural(people, "person waits", "people wait")} for your OK${until}`
        : `The next batch waits for your OK${until}`,
    // The dock's line beside its Approve, which says how many: "Waits for your OK" over "Approve all 6", where it said
    // the count twice, "6 wait for your OK" beside it (the run review's item 12).
    line: people > 0 ? SEQUENCE_WORDS.waitsForOk : "The next batch waits for your OK",
    fact: fact || null,
    // One word per act, as the run's own sheet and Today's row say it (decision 19 of the spec of 9 Oct 2026).
    act: people > 0 ? runApproveWords(people) : SEQUENCE_WORDS.approve,
    batchId: batch.id,
  });
}

/**
 * The notice: a batch waiting for an OK first, then a twin on its moment (each person gets the same message twice), the
 * emails the check held, those for you to send, the replies to answer, and new words WhatsApp turned down. `twin` is the
 * list's to say (sequenceTwinOf): a reader with one row alone passes none.
 */
export function sequenceNotice(
  row: SequenceRowDto,
  steps: readonly SequenceStepDto[],
  twin: SequenceTwin | null = null,
  lastRun: { off: string | null | undefined; for: string | null | undefined; tz: string; nowMs: number } | null = null,
): SequenceNotice | null {
  const needs = row.needs;
  // The batch an OK goes to: the soonest of those an OK can still send (sequenceWaitsNow). One that would send nothing,
  // its emails all held, is said below as what is held.
  const batch = needs.waiting > 0 && !okSendsNothing(needs) ? (needs.batches[0] ?? null) : null;
  if (batch) return waitingNotice(steps, batch);
  // On, and its last run did nothing: said with the door that mends it, until a run goes again (sequences/run-off.ts).
  const off = lastRun ? sequenceRunOff(row, lastRun, { tz: lastRun.tz, nowMs: lastRun.nowMs }) : null;
  if (off)
    return noticeOf({
      kind: "off",
      words: off.words,
      line: off.line,
      fact: off.fact,
      act: off.act,
      off: { reason: off.reason, mends: off.mends, to: off.to },
    });
  if (twin)
    return noticeOf({
      kind: "twin",
      words: `${twinLineOf(row)}: “${twin.name}” sends one too`,
      line: twinLineOf(row),
      fact: `“${twin.name}” sends one too`,
      act: SEQUENCE_WORDS.turnOff,
    });
  if (needs.held > 0)
    return noticeOf({
      kind: "held",
      words: heldByCheckWords(needs.held),
      line: `${needs.held} held by the check`,
      fact: null,
      act: SEQUENCE_WORDS.review,
    });
  if (needs.to_send > 0)
    return noticeOf({
      kind: "to_send",
      words: `${plural(needs.to_send, "email waits", "emails wait")} for you to send`,
      line: `${needs.to_send} for you to send`,
      fact: "From your own inbox",
      act: SEQUENCE_WORDS.review,
    });
  if (needs.replies > 0)
    return noticeOf({
      kind: "replies",
      words: `${plural(needs.replies, "lead wrote back", "leads wrote back")} · answer them`,
      line: `${needs.replies} wrote back`,
      fact: "Answer them in the Inbox",
      act: SEQUENCE_WORDS.answer,
    });
  const refused = steps.find((s) => s.next_words?.status === "rejected");
  if (refused)
    return noticeOf({
      kind: "words",
      words: `WhatsApp did not approve step ${refused.place}'s new words${refused.next_words?.rejected_reason ? `: ${refused.next_words.rejected_reason}` : ""}`,
      line: `Step ${refused.place}’s new words turned down`,
      fact: refused.next_words?.rejected_reason ? `WhatsApp: ${refused.next_words.rejected_reason}` : null,
      act: `${SEQUENCE_WORDS.edit} step ${refused.place}`,
      stepId: refused.id,
    });
  return null;
}

/**
 * A one-off's day, in its own tense (the phone review: one that went said "Oct 13 · 8:21 AM, for 3 people" as if to
 * come): to come, "tomorrow 10:00 AM, to 186 people"; gone, "Went Oct 13 · 8:21 AM, to 3 people"; let go of, "Canceled ·
 * it was for Oct 13 · 8:21 AM"; failed, "Didn't go · Oct 13 · 8:21 AM".
 */
function dateSentence(
  row: SequenceRowDto,
  date: NonNullable<SequenceRowDto["date"]>,
  tz: string,
  nowMs: number,
): string {
  const at = Date.parse(date.at);
  const phrase = plural(oneOffPeople(row), "person", "people");
  if (date.state === "sent") return `Went ${clockDate(at, tz, nowMs)} · ${clockTime(at, tz)}, to ${phrase}`;
  if (date.state === "canceled") return `Canceled · it was for ${clockWhen(at, tz, nowMs)}`;
  if (date.state === "failed") return `Didn’t go · ${clockWhen(at, tz, nowMs)}`;
  return `${clockWhen(at, tz, nowMs)}, to ${phrase}`;
}

/** What starts a sequence, in a sentence the flow opens with: "The day before each visit, at 9:00 AM". */
export function sequenceStartsSentence(row: SequenceRowDto, word: AppointmentWord, tz: string, nowMs: number): string {
  const f = row.first;
  if (row.starts === "date" && row.date) return dateSentence(row, row.date, tz, nowMs);
  if (row.starts === "leads") return f?.search_name ? `A lead joins ${f.search_name}` : "A lead joins the list";
  if (row.starts === "list") return listStartsSentence(f?.list_name ?? null, f?.run_hour ?? null);
  return momentStartsSentence(f?.trigger ?? null, f?.run_hour ?? null, word);
}

/** ", at 9:00 AM": the hour a sequence's runs go, as the flow says it after its moment. */
const atHour = (hour: number): string => `, at ${clockTime(Date.UTC(2026, 0, 1, hour), "UTC")}`;

/**
 * A list's sentence, at its hour: what the flow of a sequence on a list opens with, and what a new one's draft on a list
 * says before it is made (New).
 */
export function listStartsSentence(list: string | null, hour: number | null): string {
  return `Someone joins ${list ?? "the list"}${hour === null ? "" : atHour(hour)}`;
}

/**
 * A moment's sentence, at its hour: what the flow of a sequence on it opens with, and what a new one's draft says before
 * it is made (sequences/draft.ts).
 */
export function momentStartsSentence(trigger: string | null, hour: number | null, word: AppointmentWord): string {
  const words = appointmentWords(word);
  const at = hour === null ? "" : atHour(hour);
  switch (trigger) {
    case "visit_tomorrow":
      return `The day before each ${words.one}${at}`;
    case "visited":
      return `The day after each ${words.one} you mark kept${at}`;
    case "quiet_30":
      return `When someone has gone quiet for 30 days${at}`;
    case "lapsed":
      return `When someone has had no ${words.one} in 45 days, and nothing booked${at}`;
    case "new_week":
      return `When someone first gets in touch this week${at}`;
    case "phoned_only":
      return `When someone has only ever phoned${at}`;
    case "everyone_monthly":
      return `Once a month, to everyone who said yes${at}`;
    case "proposal_waiting":
      return `When a proposal waits with nothing back${at}`;
    case "slot_opened":
      return "When a cancellation frees a time"; // never by the hour (decision 0082)
    case "visit_soon":
    case "visit_missed":
    case "asked_no_booking":
      return occasionWords(trigger, word).sentence(at); // each person's own time (decision 0119)
    default:
      return `At its moment${at}`;
  }
}

/** A step's wait, on the line before it: "3 days later, if they haven't booked". */
export function sequenceWaitWords(step: Pick<SequenceStepDto, "after_days" | "only_if" | "kind">): string {
  const days = step.after_days ?? 0;
  const lead = step.kind === "reach_out";
  const when = `${plural(days, "day", "days")} later`;
  const noBooking = step.only_if.includes("no_booking");
  const noReply = step.only_if.includes("no_reply") || lead;
  const unless =
    noBooking && noReply
      ? ", if they haven’t booked or written back"
      : noBooking
        ? ", if they haven’t booked"
        : noReply
          ? ", if they haven’t written back"
          : "";
  return `${when}${unless}`;
}

/** The channels a step goes by, in words: "WhatsApp or email, one each". */
export function sequenceChannelsWords(channels: readonly string[]): string {
  const WORD: Record<string, string> = { whatsapp: "WhatsApp", sms: "text", email: "email" };
  const named = channels.map((c) => WORD[c] ?? c);
  // None said is none known (a one-off's channels are its sends'): nothing guessed, where "WhatsApp" was said of any.
  if (named.length <= 1) return named[0] ?? "";
  return `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}, one each`;
}

/** What stops a sequence, the line its flow ends with. */
export function sequenceStopsSentence(row: SequenceRowDto, steps: readonly SequenceStepDto[]): string {
  if (row.starts === "leads") return "A reply, a booking, a no, a bounce or a stop";
  return stepsStopSentence(steps);
}

/** What stops a customer's steps, said of them alone: what a sequence's flow ends with, and a new one's draft. */
export function stepsStopSentence(steps: readonly { only_if: readonly string[] }[]): string {
  const asks = new Set(steps.flatMap((s) => s.only_if));
  if (steps.length <= 1) return "After this one message";
  if (asks.has("no_booking") && asks.has("no_reply")) return "When they book or write back, or after the last step";
  if (asks.has("no_booking")) return "When they book, or after the last step";
  if (asks.has("no_reply")) return "When they write back, or after the last step";
  return `After step ${steps.length}`;
}

/** What a people group is called on the People tab. */
export const PEOPLE_GROUP_WORDS: Record<SequencePeopleGroup, string> = {
  waiting: "Waits for your OK",
  held: "Held by the check",
  to_send: "For you to send",
  replied: "Wrote back",
  next: "Up next",
  /** Leads added that nothing has been planned for yet (00459): every lead of a draft. */
  queued: "Added",
  in: "In it",
  done: "Done",
  left: "Left",
};

/** Why someone left, in a few words: a send's reason or a door's word. */
export function sequenceLeftWords(reason: string | null): string {
  const WHY: Record<string, string> = {
    booked: "booked",
    replied: "wrote back",
    removed: "taken out",
    started_again: "started again",
    gone: "no longer in People",
    no_yes: "never said yes",
    no_number: "no number",
    stopped: "asked to stop",
    unsubscribed: "unsubscribed",
    no_address: "no address",
    address_stopped: "address stopped",
    no_channel: "no way to reach them",
    outreach_wrote_back: "wrote back",
    outreach_stopped: "you stopped writing",
    outreach_lead_closed: "no longer a lead to write to",
    outreach_suppressed: "unsubscribed",
    outreach_bounced: "bounced",
    outreach_not_a_lead: "no longer in Leads",
    said_no: "said no",
    owner_stopped: "you stopped writing",
    owner_skipped: "you skipped it",
    run_canceled: "its day was canceled",
    owner_took_back: "taken back",
    step_removed: "the step was removed",
    kept_waiting: "kept waiting too long",
    stale: "kept waiting too long",
    bounced: "bounced",
  };
  return reason ? (WHY[reason] ?? reason.replace(/_/g, " ")) : "";
}

/** The People tab's own name: Leads for a sequence to leads, People for any other. */
export const peopleTabWord = (row: Pick<SequenceRowDto, "starts">): string =>
  row.starts === "leads" ? SEQUENCE_WORDS.tabs.leads : SEQUENCE_WORDS.tabs.people;
