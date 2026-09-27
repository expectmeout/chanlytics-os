/**
 * The approval a run waits on: its view model, the pool it drew from and the lines that say who it reaches. Moved
 * whole from playbooks.ts (Reach out Part 2.5), which re-exports it.
 */
import type { BroadcastDto, BroadcastRecipientDto } from "../broadcasts/broadcasts";
import { purposeOfPlaybook } from "../consent/consent";
import { GET_YES_ROUTE } from "../people/people";
import type { RunReach } from "./playbook-reach";
import { triggerOf } from "./playbook-triggers";
import type { PlaybookDto } from "./playbooks";
import { PARAM_SOURCE_LABELS, type ParamSpec } from "../templates/templates";

/* --------------------------- a run waiting on you --------------------------- */

export interface ApprovalVM {
  /** How many it reaches when approved: the people it enrolled. */
  will: number;
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
  /** How many a greeting by name reaches with no name on file: they get "Hi there" (resolveParams). */
  hiThere: number;
  /** The act: "Approve — 186 now", or "at 9:00" after hours (approveRun sends at the next open moment). Null when its day has passed. */
  approve: string | null;
  /** Why it cannot be approved: a playbook's run is a day's run, and approveRun refuses it on a later day. */
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
): ApprovalVM["of"] {
  if (!reach || !Number.isFinite(reach.pool)) return null;
  const t = p ? triggerOf(p.trigger) : null;
  const offers = t ? purposeOfPlaybook(t.cls) === "marketing" : true;
  const gap = p ? (p.trigger === "everyone_monthly" ? p.cadence_days : p.gap_days) : null;
  // A follow-up is owed once per proposal (0006): one already had is done, never waited out.
  const once = t?.kind === "deal";
  const one = (n: number, singular: string, plural: string) => (n === 1 ? singular : plural);
  const reasons: { n: number; words: string; tone: "warn" | "plain"; door: { words: string; to: string } | null }[] = [
    {
      n: reach.noYes,
      words: `never said yes to ${offers ? "offers" : "hearing from you"}`,
      tone: "plain",
      door: { words: "Get their yes", to: GET_YES_ROUTE },
    },
    { n: reach.heardAny, words: "heard from a playbook this week", tone: "warn", door: null },
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
  return { pool: reach.pool, held: reach.heardAny + (once ? 0 : reach.heardThis) + reach.overLimit, lines };
}

/**
 * A playbook's run waiting on a person, as the sheet says it: the canvas's
 * "approving from the sofa". What it reaches, by the rules that made its list;
 * the words as the first person on it reads them; and what approving does,
 * and when -- or, a day late, why it cannot be approved at all.
 */
export function toApprovalVM(
  d: {
    broadcast: Pick<BroadcastDto, "recipient_count" | "run_for" | "params"> & {
      audience?: { reach?: RunReach } | null;
    };
    recipients: readonly Pick<BroadcastRecipientDto, "name" | "first_name">[];
  },
  opts: {
    playbook: Pick<PlaybookDto, "trigger" | "cap_per_run" | "gap_days" | "cadence_days"> | null;
    businessName: string;
    /** The business's day now, "2026-09-21". */
    today: string;
    /** When an approval now would send: the clock's next open moment, and whether it moved past the hours. */
    open: { time: string; moved: boolean };
    /** A run's day in words. */
    day: (ymd: string) => string;
  },
): ApprovalVM {
  const b = d.broadcast;
  const will = b.recipient_count;
  const t = opts.playbook ? triggerOf(opts.playbook.trigger) : null;
  const rules: string[] = [];
  if (t && opts.playbook) {
    rules.push(
      purposeOfPlaybook(t.cls) === "marketing" ? "each said yes to offers" : "each said yes to hearing from you",
    );
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
  const late = !!b.run_for && b.run_for !== opts.today;
  return {
    will,
    rules,
    of: reachLines(b.audience?.reach ?? null, opts.playbook),
    values,
    reader: reader ? reader.name : null,
    hiThere: greets ? d.recipients.filter((r) => !r.first_name).length : 0,
    approve: late ? null : `Approve — ${will} ${opts.open.moved ? `at ${opts.open.time}` : "now"}`,
    expired: late
      ? `Made for ${opts.day(b.run_for!)}, and that day has passed — its people and its words were that day's. Skip it; the next run starts over.`
      : null,
    goes: late
      ? `made for ${opts.day(b.run_for!)}`
      : opts.open.moved
        ? `goes at ${opts.open.time} once you approve it`
        : "goes the moment you approve it",
    skip: "Skipping loses this run only — the playbook keeps running.",
  };
}
