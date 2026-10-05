/**
 * The approval a run waits on: its view model, the pool it drew from and the lines that say who it reaches. Moved
 * whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import { audienceTrigger } from "../broadcasts/broadcast-audience";
import type { BroadcastDto, BroadcastRecipientDto } from "../broadcasts/broadcasts";
import { purposeOfPlaybook } from "../consent/consent";
import { consentRuleWords } from "../consent/consent-asks";
import type { ConsentChannel } from "../consent/consent-channels";
import { GET_YES_ROUTE } from "../people/people-lists";
import { CAMPAIGNS_PAUSED_WORDS } from "../workspace/billing";
import { messageAboutOfTrigger } from "./playbook-purpose";
import type { RunReach } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";
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
   * only for time -- heard from a playbook lately, past the number's day -- and
   * is the bar's amber; the rest of the bar is grey: no yes, a stop, no number,
   * past the cap. Each reason is a line, the most first, and the one an owner
   * can act on carries its door. Null for a run that kept no count.
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
  /** The act: "Approve — 186 now", or "at 9:00" after hours (approveRun sends at the next open moment). Null when approveRun would refuse it. */
  approve: string | null;
  /**
   * Why it cannot be approved, in the verb's own words (runApprovalRefusal): a playbook's run is a day's run, and approveRun
   * refuses it on a later day, and a visit's run that would go out on a later day than the one it was made for; or the
   * workspace is paused (CAMPAIGNS_PAUSED_WORDS), which approveRun refuses first.
   */
  expired: string | null;
  /** When it goes, for the line under its name. */
  goes: string;
  /** What skipping costs. */
  skip: string;
}

/**
 * What "of 312" counts on a playbook's card, in its moment's own words: the
 * trigger's list, everyone in People, or the day's visits.
 */
export function poolWords(trigger: string): string {
  const t = triggerOf(trigger);
  if (!t) return "";
  if (t.kind === "visit") return trigger === "visit_tomorrow" ? "with a visit tomorrow" : "who visited yesterday";
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
    { n: reach.heardAny, words: "heard from a playbook this week", tone: "warn", door: null },
    { n: allowanceHeld, words: ALLOWANCE_HELD_WORDS, tone: "warn", door: null },
    {
      n: reach.heardThis,
      words: once
        ? "had this proposal's follow-up already"
        : gap
          ? `heard from this playbook in the last ${gap} days`
          : "heard from this playbook lately",
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
 * the verb refuses, `playbook_id` guard and all: a run that is no playbook's has no day to pass.
 */
export function runApprovalRefusal(
  run: { playbook_id: string | null; run_for?: string | null; audience?: unknown },
  days: ApprovalDays,
): string | null {
  const day =
    dayHasPassed(run, days.today) ??
    (run.playbook_id && run.run_for && visitRunTooLate(run, days) ? run.run_for : null);
  return day ? dayGoneWords(day, days.say) : null;
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
    playbook: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null;
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
      rules.push(
        opts.playbook.trigger === "visit_tomorrow"
          ? "each has a visit tomorrow on the calendar"
          : "each visited yesterday and has nothing booked next",
      );
    } else if (t.kind === "deal") {
      // One follow-up per proposal, with its link (0006).
      rules.push(
        "each has a proposal waiting with nothing back, and its link",
        "none followed up on that proposal before",
        "none heard from any playbook this week",
      );
      if (will >= opts.playbook.cap_per_run)
        rules.push(`capped at ${opts.playbook.cap_per_run} a run, the longest unheard first`);
    } else {
      const gap = opts.playbook.trigger === "everyone_monthly" ? opts.playbook.cadence_days : opts.playbook.gap_days;
      rules.push(`none heard from this playbook in ${gap} days`, "none heard from any playbook this week");
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
    approve: refusal ? null : `Approve — ${will} ${opts.open.moved ? `at ${opts.open.time}` : "now"}`,
    expired: refusal,
    goes: late
      ? `made for ${opts.day(runFor)}`
      : opts.paused
        ? "waits until billing resumes"
        : opts.open.moved
          ? `goes at ${opts.open.time} once you approve it`
          : "goes the moment you approve it",
    skip: "Skipping loses this run only — the playbook keeps running.",
  };
}
