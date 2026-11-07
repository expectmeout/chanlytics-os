/** Console: console. */

import type { Tone } from "../shell/tone";
import { DAY_MS, HOUR_MS, WEEK_MS } from "../shared/time";
import {
  PLATFORM_VERDICTS,
  platformRows,
  type PlatformRowVM,
  type PlatformTenantDto,
  type PlatformVerdict,
} from "../workspace/platform";
import { staffName } from "./staff";
import { isOneOf } from "../shared/unknown";

// ------------------------------------------------------------------------------------------- the workspaces, grouped

/** How Home and Workspaces group the verdicts: who the next move is with. */
const CONSOLE_GROUPS = {
  needs_us: ["broken", "rehearsal"],
  waiting: ["billing", "waiting_owner", "stalled"],
  look: ["quiet", "new"],
  live: ["live"],
  paused: ["paused"],
  ours: ["test"],
  previews: ["preview"],
} as const satisfies Record<string, readonly PlatformVerdict[]>;

export type ConsoleGroup = keyof typeof CONSOLE_GROUPS;

export const CONSOLE_GROUP_WORDS: Record<ConsoleGroup, string> = {
  needs_us: "Needs us",
  waiting: "Waiting on them",
  look: "Worth a look",
  live: "Live",
  paused: "Paused",
  ours: "Ours",
  previews: "Previews",
};

const GROUP_ORDER = Object.keys(CONSOLE_GROUPS) as ConsoleGroup[];

/** The group a verdict falls in. */
export function consoleGroupOf(verdict: PlatformVerdict): ConsoleGroup {
  return GROUP_ORDER.find((g) => isOneOf(CONSOLE_GROUPS[g], verdict)) ?? "look";
}

/** The rows, grouped in the order a shift works them; an empty group is left out. Each keeps platformRows' order. */
export function consoleGroups(
  rows: readonly PlatformRowVM[],
): { group: ConsoleGroup; words: string; rows: PlatformRowVM[] }[] {
  return GROUP_ORDER.map((group) => ({
    group,
    words: CONSOLE_GROUP_WORDS[group],
    rows: rows.filter((r) => consoleGroupOf(r.verdict) === group),
  })).filter((g) => g.rows.length > 0);
}

/** A verdict's pill, as the Console draws it: the back office's own words and tone. */
export function verdictPill(verdict: PlatformVerdict): { label: string; tone: Tone } {
  const v = PLATFORM_VERDICTS[verdict];
  return { label: v.label, tone: v.tone };
}

// ------------------------------------------------------------------------------------------------ who has it

/** How long a workspace stays taken, unless it is let go first. */
const CLAIM_HOURS = 4;

export const CLAIM_MS = CLAIM_HOURS * HOUR_MS;

/** Who has taken a workspace, and until when (platform_claims). */
export interface ClaimDto {
  tenant_id: string;
  user_id: string;
  email: string | null;
  until: string;
}

/** What a row says of its claim: nothing when nobody holds it, yours, or who is on it. */
export function claimWords(claim: ClaimDto | null | undefined, me: string, nowMs: number): string | null {
  if (!claim || Date.parse(claim.until) <= nowMs) return null;
  return claim.user_id === me ? "You have it" : `${staffName(claim.email)} is on it`;
}

// ------------------------------------------------------------------------------------------------- Home's numbers

/** What Home counts. Each is a fact a table already holds; a number the server could not read is null, and says so. */
export interface ConsoleNumbersDto {
  /** Customers' workspaces whose subscription is active. */
  paying: number;
  /**
   * What those on Stripe pay a month at the plan's price (the edge's, from Stripe), in its currency's cents; null when
   * the price could not be read or is not monthly, and the number is then said as workspaces alone.
   */
  paying_cents: number | null;
  currency: string | null;
  /** Workspaces on a trial, and those whose trial ends in the next seven days. */
  trials: number;
  trials_ending: number;
  /** Customers' workspaces that answer, and those a customer reached today. */
  answering: number;
  heard_today: number;
  /** What every model call cost in the last thirty days, at list price, and across how many workspaces. */
  model_usd: number | null;
  model_workspaces: number;
}

export interface ConsoleNumberVM {
  label: string;
  value: string;
  sub: string;
  tone: Tone | null;
}

const money = (cents: number, currency: string | null): string => {
  const whole = Math.round(cents / 100).toLocaleString("en-US");
  return !currency || currency === "usd" ? `$${whole}` : `${whole} ${currency.toUpperCase()}`;
};

/** Home's numbers from the workspaces' rows and the model spend, the test workspaces left out. */
export function consoleNumbersFrom(
  tenants: readonly PlatformTenantDto[],
  spend: { usd: number; workspaces: number } | null,
  price: { unit_amount: number | null; currency: string; interval: string | null } | null,
  nowMs: number,
): ConsoleNumbersDto {
  const verdictOf = new Map(platformRows(tenants, nowMs).map((r) => [r.tenantId, r.verdict]));
  // Neither a test workspace nor a lead's preview (decision 0079) is a customer.
  const customers = tenants.filter((t) => !["test", "preview"].includes(verdictOf.get(t.tenant_id) ?? ""));
  const answering = customers.filter((t) => ["live", "quiet"].includes(verdictOf.get(t.tenant_id) ?? ""));
  const trialing = customers.filter((t) => t.billing_status === "trialing");
  const endsSoon = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && at >= nowMs && at <= nowMs + WEEK_MS;
  };
  const heardToday = (iso: string | null) => {
    const at = iso ? Date.parse(iso) : NaN;
    return Number.isFinite(at) && nowMs - at <= DAY_MS;
  };
  const paying = customers.filter((t) => t.billing_status === "active");
  const monthly = price && price.interval === "month" && price.unit_amount !== null ? price.unit_amount : null;
  return {
    paying: paying.length,
    paying_cents: monthly === null ? null : paying.filter((t) => t.billing_mode !== "direct").length * monthly,
    currency: monthly === null || !price ? null : price.currency,
    trials: trialing.length,
    trials_ending: trialing.filter((t) => endsSoon(t.trial_end)).length,
    answering: answering.length,
    heard_today: answering.filter((t) => heardToday(t.last_inbound_at)).length,
    model_usd: spend ? spend.usd : null,
    model_workspaces: spend?.workspaces ?? 0,
  };
}

/** Home's four numbers, in words. */
export function consoleNumbersOf(consoleNumbers: ConsoleNumbersDto): ConsoleNumberVM[] {
  return [
    {
      label: "Paying",
      value:
        consoleNumbers.paying_cents === null
          ? String(consoleNumbers.paying)
          : money(consoleNumbers.paying_cents, consoleNumbers.currency),
      sub:
        consoleNumbers.paying_cents === null
          ? `workspace${consoleNumbers.paying === 1 ? "" : "s"} on a plan`
          : `a month · ${consoleNumbers.paying} workspace${consoleNumbers.paying === 1 ? "" : "s"}`,
      tone: null,
    },
    {
      label: "On a trial",
      value: String(consoleNumbers.trials),
      sub: consoleNumbers.trials_ending
        ? `${consoleNumbers.trials_ending} end${consoleNumbers.trials_ending === 1 ? "s" : ""} this week`
        : "none end this week",
      tone: consoleNumbers.trials_ending ? "warn" : null,
    },
    {
      label: "Heard from today",
      value: `${consoleNumbers.heard_today} of ${consoleNumbers.answering}`,
      sub: "workspaces that answer",
      tone: null,
    },
    {
      label: "Model calls, 30 days",
      value:
        consoleNumbers.model_usd === null ? "—" : `$${Math.round(consoleNumbers.model_usd).toLocaleString("en-US")}`,
      sub:
        consoleNumbers.model_usd === null
          ? "could not be read"
          : `across ${consoleNumbers.model_workspaces} workspaces`,
      tone: null,
    },
  ];
}

/** Home's line under its name: what needs us, what waits on them, what came in, and the nearest request's clock. */
export function homeSentence(input: { needsUs: number; waiting: number; cameIn: number; due: string | null }): string {
  return [
    input.needsUs === 1 ? "1 needs us" : `${input.needsUs} need us`,
    `${input.waiting} waiting on them`,
    `${input.cameIn} came in this week`,
    ...(input.due ? [input.due] : []),
  ].join(" · ");
}

// ---------------------------------------------------------------------------------------------------- its words

/** What the Console says, beyond each screen's own rows. */
export const CONSOLE_WORDS = {
  brand: "Chanlytics",
  badge: "Console",
  find: "Find",
  findPlaceholder: "A name, an email, a number or a report",
  secondFactorOn: "second factor on",
  signOut: "Sign out",
  openApp: "Open the app",
  readAgain: "Read again",
  reading: "Reading…",
  failed: "Could not be read right now.",
  failedBody: "Nothing on the platform changed; this page could not read it.",
  noSuchWorkspace: "No workspace has that address.",
  takeIt: "Take it",
  letGo: "Let go",
  open: "Open",
  inTheInbox: "In the inbox",
  every: "Every workspace",
  asksWhy: "Each asks why, then twice, and is written down against you first.",
  recorded: "Written down against you before it runs",
  notNow: "Not now",
  why: "Why",
  ticket: "The ticket",
  ticketHint: "R-1042, or the inbox's number",
  note: "A note for the log",
  noteHint: "What you checked, or what the owner said: never a customer's details",
  needTicket: "Name the ticket, or choose another reason.",
} as const;
