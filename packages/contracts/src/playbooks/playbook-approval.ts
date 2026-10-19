/**
 * The approval a run waits on: its view model, the pool it drew from and the lines that say who it reaches. Moved
 * whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { audienceTrigger } from "../broadcasts/broadcast-audience";
import type { BroadcastDto, BroadcastRecipientDto } from "../broadcasts/broadcasts";
import { BREATH_WHY } from "../broadcasts/run-words";
import { purposeOfPlaybook } from "../consent/consent";
import { consentRuleWords } from "../consent/consent-asks";
import type { ConsentChannel } from "../consent/consent-channels";
import { appointmentWords, type AppointmentWord } from "../journey/appointment-word";
import { GET_YES_ROUTE } from "../people/lists/people-route";
import { CAMPAIGNS_PAUSED_WORDS } from "../workspace/billing";
import { runApproveWords } from "../shell/campaign-rooms";
import { isReachOutRun } from "../reach-out/reach-out-rules";
import { capitalize } from "../shared/words";
import { messageAboutOfTrigger } from "./playbook-purpose";
import type { RunReach } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";
import { localDate, nextOpenMoment } from "./playbook-schedule";
import type { PlaybookDto } from "./playbooks";
import { PARAM_SOURCE_LABELS, type ParamSpec } from "../templates/templates";

/* --------------------------- a run waiting on you --------------------------- */

export interface ApprovalVM {
  /**
   * How many it reaches when approved: the people it enrolled, less those the month's allowance already holds (core
   * holds them at enrolment, skipped with `month_allowance`), who are in its held line and never in this number.
   */
  will: number;
  /**
   * Who it reaches on each channel, adding up to `will`: the run's own count with the people the month's allowance holds
   * taken off the channel each was to go by. Null for a run that kept no such count (all WhatsApp).
   */
  byChannel: Record<ConsentChannel, number> | null;
  /**
   * The rules that made its list, in words -- true of everyone on it by
   * construction (eligibleForPlaybook). What a run made before runs kept who
   * they left out can say, and all it can.
   */
  rules: string[];
  /**
   * Out of how many, and who the rest are: everyone its moment named, as the
   * run counted them when it was drawn (playbookRunReach). `held` is who waits
   * only for time -- hears from you within a week of it (a message sent or due),
   * heard from this campaign lately, past the month's allowance or the number's
   * day -- and is the bar's amber; the rest of the bar is grey: no yes, a stop,
   * no number, past the cap. Each reason is a line, the most first, and the one
   * an owner can act on carries its door. Null for a run that kept no count.
   */
  of: {
    pool: number;
    held: number;
    lines: { n: number; words: string; tone: "warn" | "plain"; door: { words: string; to: string } | null }[];
  } | null;
  /** One value per slot, as `reader` gets them. */
  values: string[];
  /** Whose message the words are: the first person on it with a name. Null for a run with nobody on it. */
  reader: string | null;
  /** The channel the reader's message goes by (their recipient row's), WhatsApp where the run kept none: which version they read. */
  readerChannel: ConsentChannel;
  /** How many a greeting by name reaches with no name on file: they get "Hi there" (resolveParams). */
  hiThere: number;
  /** The act, "Approve · 186 people"; when it goes is `goes` (approveRun sends at the next open moment). Null when approveRun would refuse it. */
  approve: string | null;
  /**
   * Why it cannot be approved, in the verb's own words (runApprovalRefusal): a playbook's run is a day's run, and approveRun
   * refuses it on a later day, and a visit's run that would go out on a later day than the one it was made for; or the
   * workspace is paused (CAMPAIGNS_PAUSED_WORDS), which approveRun refuses first.
   */
  expired: string | null;
  /** When it goes, inside a sentence ("3 people · goes the moment you approve it"). */
  goes: string;
  /**
   * The same as a line of its own, beside the Approve it speaks of (the sheet's dock, its band's note): under the run's
   * name it wrapped onto a line by itself on a phone.
   */
  goesLine: string;
  /** What skipping costs. */
  skip: string;
}

/**
 * What "of 312" counts on a playbook's card, in its moment's own words: the trigger's list, everyone in People, or the
 * day's appointments in the workspace's word.
 */
export function poolWords(trigger: string, word: AppointmentWord): string {
  const t = triggerOf(trigger);
  if (!t) return "";
  if (t.kind === "visit") {
    const W = appointmentWords(word);
    return trigger === "visit_tomorrow" ? W.withTomorrow : W.whoYesterday;
  }
  if (t.kind === "deal") return "with a proposal waiting";
  return t.list || t.kind === "saved" ? "on the list" : "in People";
}

/**
 * A run's reach, as the sheet says it: out of everyone its moment named, who
 * waits only for time (the bar's amber), and a line for each reason anyone was
 * left out, the most first. "Never said yes" carries the door to getting that
 * yes (#663): of every reason a person is left out, it is the one an owner can
 * change. Null for a run that kept no count.
 */
export function reachLines(
  reach: RunReach | null | undefined,
  p: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null,
  /** How many of the run's people the month's allowance holds (ALLOWANCE_HELD_WORDS): in the held line, out of `will`. */
  allowanceHeld = 0,
): ApprovalVM["of"] {
  if (!reach || !Number.isFinite(reach.pool)) return null;
  const t = p ? triggerOf(p.trigger) : null;
  const offers = t ? purposeOfPlaybook(t.cls) === "marketing" : true;
  const gap = p ? (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) : null;
  // A follow-up is owed once per proposal (0006): one already had is done, never waited out.
  const once = t?.kind === "deal";
  const one = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);
  const noAddress = reach.no_address ?? 0;
  const addressStopped = reach.address_stopped ?? 0;
  const noChannel = reach.no_channel ?? 0;
  const reasons: { n: number; words: string; tone: "warn" | "plain"; door: { words: string; to: string } | null }[] = [
    {
      n: reach.noYes,
      words: `never said yes to ${offers ? "offers" : "hearing from you"}`,
      tone: "plain",
      door: { words: "Get their yes", to: GET_YES_ROUTE },
    },
    // The week's breath, both sides of the run: a message from a campaign or a broadcast sent or due within a week of it.
    { n: reach.heardAny, words: `${one(reach.heardAny, "hears", "hear")} ${BREATH_WHY}`, tone: "warn", door: null },
    { n: allowanceHeld, words: ALLOWANCE_HELD_WORDS, tone: "warn", door: null },
    {
      n: reach.heardThis,
      words: once
        ? "had this proposal's follow-up already"
        : gap
          ? `heard from this campaign in the last ${gap} days`
          : "heard from this campaign lately",
      tone: once ? "plain" : "warn",
      door: null,
    },
    { n: reach.stopped, words: "asked you to stop", tone: "plain", door: null },
    {
      n: reach.noNumber,
      words: one(reach.noNumber, "has no number on file", "have no number on file"),
      tone: "plain",
      door: null,
    },
    // Where email was the only channel left, or no channel could carry the message: each is a person the run counted and
    // leaves out, so each has its line (a run counted before runs kept them has none).
    {
      n: noAddress,
      words: one(noAddress, "has no email address on file", "have no email address on file"),
      tone: "plain",
      door: null,
    },
    {
      n: addressStopped,
      words: one(
        addressStopped,
        "has an email address mail no longer goes to",
        "have an email address mail no longer goes to",
      ),
      tone: "plain",
      door: null,
    },
    {
      n: noChannel,
      words: one(
        noChannel,
        "has no channel this message can go by here",
        "have no channel this message can go by here",
      ),
      tone: "plain",
      door: null,
    },
    {
      n: reach.overCap,
      words: `${one(reach.overCap, "waits", "wait")} for the next run${p ? ` — ${p.cap_per_run} a run, the longest unheard first` : ""}`,
      tone: "plain",
      door: null,
    },
    {
      n: reach.overLimit,
      words: one(
        reach.overLimit,
        "is past what the number may start today",
        "are past what the number may start today",
      ),
      tone: "warn",
      door: null,
    },
  ];
  const lines = reasons
    .map((r, rank) => ({ ...r, rank }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n || a.rank - b.rank)
    .map(({ n, words, tone, door }) => ({ n, words: `${n} ${words}`, tone, door }));
  return {
    pool: reach.pool,
    held: reach.heardAny + (once ? 0 : reach.heardThis) + reach.overLimit + allowanceHeld,
    lines,
  };
}

/** What the held line says of the people the month's emails or texts have no room for ("2 held for this month's allowance"). */
const ALLOWANCE_HELD_WORDS = "held for this month's allowance";

/**
 * The week's breath as a rule of the run's list (toApprovalVM `rules`): nobody on it hears from a campaign or a broadcast
 * within a week of it, a message sent or due, in the words its reason line says it.
 */
const NONE_HEARS_WORDS = `none hears ${BREATH_WHY}`;

/** The reason core writes on a person it holds at enrolment for the month's allowance (HELD_REASONS keeps its words). */
const ALLOWANCE_REASON = "month_allowance";

/**
 * The people a run holds for the month's allowance, by the channel each was to go by (the recipient's own, WhatsApp where the
 * run kept none): core holds them at enrolment, so they are on the run as skipped and are never reached by approving it.
 */
function allowanceHeldOn(
  recipients: ReadonlyArray<Partial<Pick<BroadcastRecipientDto, "state" | "reason" | "channel">>>,
): Record<ConsentChannel, number> {
  const held: Record<ConsentChannel, number> = { whatsapp: 0, sms: 0, email: 0 };
  for (const r of recipients) {
    if (r.state !== "skipped" || r.reason !== ALLOWANCE_REASON) continue;
    held[channelOfRecipient(r)] += 1;
  }
  return held;
}

/** The channel a recipient's message goes by: the row's own, WhatsApp where the run kept none (a run made before channels). */
function channelOfRecipient(r: Partial<Pick<BroadcastRecipientDto, "channel">> | null): ConsentChannel {
  return r?.channel === "sms" || r?.channel === "email" ? r.channel : "whatsapp";
}

/**
 * Why a playbook's run cannot be approved on the business's `today` ("2026-09-21"), in approveRun's words, or null. A
 * playbook's run is a day's run: its people were that day's eligible and its words were written for that day
 * ("tomorrow at 2:00 PM"), so approved on a later day it is refused, and the next sweep reads the calendar again. The
 * route's rule, and Ask's run card's refusal before a card is shown: one sentence.
 */
export function runDayPassed(
  run: { playbook_id: string | null; run_for?: string | null },
  today: string,
): string | null {
  const day = dayHasPassed(run, today);
  return day ? dayGoneWords(day) : null;
}

/** The day a playbook's run was made for when it is not `today`, else null: the one reading of "its day has passed". */
function dayHasPassed(run: { playbook_id: string | null; run_for?: string | null }, today: string): string | null {
  return run.playbook_id && run.run_for && run.run_for !== today ? run.run_for : null;
}

/**
 * The sentence a run is refused in when its day is gone: the route's, Ask's run card's, and the sheet's, which says the day
 * in the business's own words (`say`) where the verb says it as the date.
 */
function dayGoneWords(runFor: string, say: (ymd: string) => string = (ymd) => ymd): string {
  return `This run was made for ${say(runFor)} and that day has passed: its people and its words were that day's. Skip it; the next run reads the calendar again.`;
}

/**
 * When an approval would send a run: the business's day now, and the day of the next open moment (nextOpenMoment),
 * "2026-09-21". `say` words a day for the person reading the refusal (the sheet's); the verb's own is the date.
 */
interface ApprovalDays {
  today: string;
  sendsOn: string;
  say?: (ymd: string) => string;
}

/**
 * The days a waiting run is judged by, in a business's zone: its day now, and the day of the next open sending moment
 * (approved after the last sending hour, a run waits for nine). The one derivation of them: the verb (core approveRun),
 * the count of what waits on you (waits.ts runWaitsOnYou), the page's clock and the hourly sweep that ends a run whose
 * day has passed all read the days here, so none of them calls a run waiting that another calls too late.
 */
export function runDaysAt(tz: string, now: Date): { today: string; sendsOn: string } {
  return { today: localDate(tz, now), sendsOn: localDate(tz, nextOpenMoment(tz, now).at) };
}

/**
 * Whether a visit's run, made for today, would go out on a later day than the one it was made for: approved after the
 * last sending hour it waits for nine the next morning, and its words (the visit's time as the calendar said it when the
 * run was made, "tomorrow at 2:00 PM") are that day's, so they would reach the customer on the morning of the visit. Any
 * other moment's words do not name a day.
 */
function visitRunTooLate(run: { run_for?: string | null; audience?: unknown }, days: ApprovalDays): boolean {
  const moment = triggerOf(audienceTrigger(run.audience) ?? "");
  return moment?.kind === "visit" && !!run.run_for && days.sendsOn > run.run_for;
}

/**
 * Why a waiting playbook's run cannot be approved now, in one sentence, or null: its day has passed (dayHasPassed), or it
 * is a visit's run that an approval now would send on a later day than the one it was made for (visitRunTooLate). THE
 * predicate for the verb (core approveRun), Ask's run card and the sheet (toApprovalVM), so the sheet never offers a button
 * the verb refuses, `playbook_id` guard and all: a run that is no playbook's has no day to pass. Nor has a reach-out's
 * run, which carries a step's id and a day and is approved on any later one (approveRun takes it to approveReachOut
 * before it asks this; decision D6): the exemption is here, so every page that asks agrees with the verb.
 */
export function runApprovalRefusal(
  run: { playbook_id: string | null; run_for?: string | null; audience?: unknown },
  days: ApprovalDays,
): string | null {
  if (isReachOutRun(run.audience)) return null;
  const day =
    dayHasPassed(run, days.today) ??
    (run.playbook_id && run.run_for && visitRunTooLate(run, days) ? run.run_for : null);
  return day ? dayGoneWords(day, days.say) : null;
}

/**
 * What a waiting run's row may offer outside its sheet (Coming up's line, a playbook's card): approve it, skip it, or
 * neither.
 *   approve  Approve, and Skip.
 *   skip     The verb would refuse an approval now, in `why`, its own sentence: its day has passed or a visit's run
 *            would go a day late (runApprovalRefusal), or the workspace is paused, which approveRun refuses first
 *            (CAMPAIGNS_PAUSED_WORDS). Skip asks nothing of the day or the pause, and is the act left.
 *   open     Decided on its sheet, never from a row: a reach-out's run (decision D6: its sheet counts and names each
 *            first cold email; Today opens it and Ask refuses both verbs), and a run no playbook the page holds answers
 *            for (its playbook was deleted: nothing here says what it sends).
 */
export type WaitingRunOffer = { kind: "approve" } | { kind: "skip"; why: string } | { kind: "open" };

/**
 * THE reading of what a waiting run's row offers (WaitingRunOffer), so no row offers an Approve the verb then refuses,
 * or a one-tap approval the product decided against. `days` are the business's day now and the day of the next open
 * sending moment, as the verb reads them; `at.paused` the workspace's pause (ChannelsReady.paused); `at.known` whether
 * its playbook is one the page holds.
 */
export function waitingRunOffer(
  run: { playbook_id: string | null; run_for?: string | null; audience?: unknown },
  days: ApprovalDays,
  at: { paused: boolean; known: boolean },
): WaitingRunOffer {
  if (isReachOutRun(run.audience) || !at.known) return { kind: "open" };
  const late = runApprovalRefusal(run, days);
  if (late) return { kind: "skip", why: late };
  return at.paused ? { kind: "skip", why: CAMPAIGNS_PAUSED_WORDS } : { kind: "approve" };
}

/**
 * A playbook's run waiting on a person, as the sheet says it: the canvas's
 * "approving from the sofa". What it reaches, by the rules that made its list;
 * the words as the first person on it reads them; and what approving does,
 * and when -- or, a day late, why it cannot be approved at all.
 */
export function toApprovalVM(
  d: {
    broadcast: Pick<BroadcastDto, "recipient_count" | "run_for" | "params" | "playbook_id"> & {
      audience?: { reach?: RunReach; trigger?: string } | null;
    };
    recipients: ReadonlyArray<
      Pick<BroadcastRecipientDto, "name" | "first_name"> &
        Partial<Pick<BroadcastRecipientDto, "state" | "reason" | "channel">>
    >;
  },
  opts: {
    /** The playbook the run is of, with what its workspace calls an appointment; null where it is gone or unread. */
    playbook:
      (Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> & { word: AppointmentWord }) | null;
    businessName: string;
    /** The business's day now, "2026-09-21". */
    today: string;
    /**
     * When an approval now would send: the clock's next open moment, whether it moved past the hours, and the business's
     * day it falls on ("2026-09-21": a visit's run made for today does not go on a later one, runApprovalRefusal).
     */
    open: { time: string; moved: boolean; on: string };
    /** A run's day in words. */
    day: (ymd: string) => string;
    /**
     * Whether the workspace is paused (contracts ChannelsReady.paused, tenants.status), where the caller holds that readiness;
     * null where it does not, and the sheet then says nothing of it (Ask's run card reads none). Approving under a pause is
     * refused (core approveRun), so the sheet says so, in the words every campaign says it (CAMPAIGNS_PAUSED_WORDS), instead
     * of offering the button.
     */
    paused: boolean | null;
  },
): ApprovalVM {
  const b = d.broadcast;
  // The month's allowance holds some at enrolment: they are in the held line, and approving reaches none of them.
  const heldOn = allowanceHeldOn(d.recipients);
  const allowanceHeld = heldOn.whatsapp + heldOn.sms + heldOn.email;
  const will = Math.max(0, b.recipient_count - allowanceHeld);
  const by = b.audience?.reach?.by_channel;
  const t = opts.playbook ? triggerOf(opts.playbook.trigger) : null;
  const rules: string[] = [];
  if (t && opts.playbook) {
    // What each person on the run was asked for, on the channel they are reached on (consent-asks.ts): an email about a
    // visit asks no yes, and an offer by email may go on a relationship on record, so it is not one sentence for all.
    rules.push(...consentRuleWords(by, purposeOfPlaybook(t.cls), messageAboutOfTrigger(opts.playbook.trigger)));
    if (t.kind === "visit") {
      const W = appointmentWords(opts.playbook.word);
      rules.push(opts.playbook.trigger === "visit_tomorrow" ? W.eachTomorrow : W.eachYesterday);
    } else if (t.kind === "deal") {
      // One follow-up per proposal, with its link (0006).
      rules.push(
        "each has a proposal waiting with nothing back, and its link",
        "none followed up on that proposal before",
        NONE_HEARS_WORDS,
      );
      if (will >= opts.playbook.cap_per_run)
        rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    } else {
      const gap = opts.playbook.trigger === "everyone_monthly" ? opts.playbook.cadence_days : opts.playbook.gap_days;
      rules.push(`none heard from this campaign in ${gap} days`, NONE_HEARS_WORDS);
      if (will >= opts.playbook.cap_per_run)
        rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    }
  }
  const named = d.recipients.find((r) => r.first_name);
  const reader = named ?? d.recipients[0] ?? null;
  const params: readonly ParamSpec[] = Array.isArray(b.params) ? b.params : [];
  const values = params.map((p) => {
    switch (p.kind) {
      case "text":
        return p.value;
      case "first_name":
        return reader?.first_name || "there";
      case "business_name":
        return opts.businessName;
      case "booking_link":
        return "your booking link";
      default:
        return `[${PARAM_SOURCE_LABELS[p.kind].toLowerCase()}]`;
    }
  });
  const greets = params.some((p) => p.kind === "first_name");
  // The verb's own rule, asked, not recomputed (runApprovalRefusal): its day has passed, or a visit's run would go out on a
  // later day than it was made for. A paused workspace is refused first, as approveRun refuses it first.
  const late = runApprovalRefusal(b, { today: opts.today, sendsOn: opts.open.on, say: opts.day });
  const refusal = opts.paused ? CAMPAIGNS_PAUSED_WORDS : late;
  const runFor = b.run_for ?? "";
  const goes = late
    ? `made for ${opts.day(runFor)}`
    : opts.paused
      ? "waits until billing resumes"
      : opts.open.moved
        ? `goes at ${opts.open.time} once you approve it`
        : "goes the moment you approve it";
  return {
    will,
    byChannel: by
      ? {
          whatsapp: Math.max(0, by.whatsapp - heldOn.whatsapp),
          sms: Math.max(0, by.sms - heldOn.sms),
          email: Math.max(0, by.email - heldOn.email),
        }
      : null,
    rules,
    of: reachLines(b.audience?.reach ?? null, opts.playbook, allowanceHeld),
    values,
    reader: reader ? reader.name : null,
    readerChannel: channelOfRecipient(reader),
    hiThere: greets ? d.recipients.filter((r) => !r.first_name).length : 0,
    // One word per act (decision 19 of the spec of 9 Oct 2026), as Today's row and the ledger say it; when it goes is said
    // once, beside it (`goes`): the button said it again ("Approve — 3 now").
    approve: refusal ? null : runApproveWords(will),
    expired: refusal,
    goes,
    goesLine: capitalize(goes),
    skip: "Skipping loses this run only — the campaign keeps running.",
  };
}
