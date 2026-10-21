/**
 * The Console (decision 0066): the platform's own place, at /console. Who the staff are and what each of the three roles
 * may do, every act with the reason it asks for, the screens and their addresses, how Home groups the workspaces, who has
 * taken one, and the log of what the team did.
 *
 * Pure. The routes hand it rows and the screens draw what comes back, so what a person on the team sees can be tested,
 * and the database says the same in `platform_role()` and `platform_staff_state()` (00466).
 */
import type { Tone } from "../shell/tone";
import { CONSOLE_PATH } from "./console-path";
import { csvCell } from "../shared/csv";
import { agoWords, DAY_MS, HOUR_MS, MIN_MS, WEEK_MS } from "../shared/time";
import {
  PLATFORM_VERDICTS,
  platformRows,
  type PlatformLineAction,
  type PlatformRowVM,
  type PlatformTenantDto,
  type PlatformVerdict,
} from "../workspace/platform";

// ---------------------------------------------------------------------------------------------------- the staff

/** The three roles (Ruben, 21 Oct 2026): everything; the workspaces' work; the money. */
export const STAFF_ROLES = ["owner", "support", "billing"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_ROLE_WORDS: Record<StaffRole, string> = {
  owner: "Owner",
  support: "Support",
  billing: "Billing",
};

/**
 * What the database says of the session asking (platform_staff_state()): its role, or that it is staff and has not shown
 * its second factor this session, or that it is not staff at all. Nobody else's state can be asked.
 */
export const STAFF_STATES = [...STAFF_ROLES, "needs_second_factor", "none"] as const;
export type StaffState = (typeof STAFF_STATES)[number];

/** A person on the team as the Console names them: the address's own name, as it is written before the @. */
export function staffName(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  const word = local.split(/[._+-]/)[0] ?? "";
  return word ? word.charAt(0).toUpperCase() + word.slice(1) : "Someone";
}

// ------------------------------------------------------------------------------------------------------ the acts

/** Who may take an act: the support roles, and the money roles. The owner is in both. */
const SUPPORT_ROLES: readonly StaffRole[] = ["owner", "support"];
const MONEY_ROLES: readonly StaffRole[] = ["owner", "billing"];

interface ActRule {
  /** How the Admin log names it. */
  words: string;
  /** Who may take it; every role may read that it was taken. */
  roles: readonly StaffRole[];
}

/**
 * Every act the team takes, one key each: the log's `act` column, the route's gate, and the words the log says. A route
 * names its act; nothing passes an act it was handed.
 */
export const CONSOLE_ACTS = {
  line_retry: { words: "Retry setting up", roles: SUPPORT_ROLES },
  line_refile: { words: "Refile texting", roles: SUPPORT_ROLES },
  line_replace: { words: "File a new campaign", roles: SUPPORT_ROLES },
  line_release: { words: "Give the number back", roles: SUPPORT_ROLES },
  job_requeue: { words: "Run a failed job again", roles: SUPPORT_ROLES },
  waitlist_invited: { words: "Mark as invited", roles: SUPPORT_ROLES },
  partner_standing: { words: "Rule on a partner's workspace", roles: MONEY_ROLES },
  partner_payout: { words: "Record a payout", roles: MONEY_ROLES },
  partner_status: { words: "Pause, close or restore a partner", roles: SUPPORT_ROLES },
  partner_second_factor: { words: "Reset a partner's second factor", roles: SUPPORT_ROLES },
  request_file: { words: "File a request", roles: SUPPORT_ROLES },
  request_step: { words: "Mark a request's step", roles: SUPPORT_ROLES },
  request_close: { words: "Close a request", roles: SUPPORT_ROLES },
} as const satisfies Record<string, ActRule>;
export type ConsoleAct = keyof typeof CONSOLE_ACTS;
export const CONSOLE_ACT_KEYS = Object.keys(CONSOLE_ACTS) as ConsoleAct[];

/** The act each line action is, for the log. */
export const LINE_ACTS: Record<PlatformLineAction, ConsoleAct> = {
  retry: "line_retry",
  refile: "line_refile",
  replace: "line_replace",
  release: "line_release",
};

/** Whether a role may take an act. The route asks it before anything is written; the page asks it to draw the act. */
export function staffMay(role: StaffRole | null | undefined, act: ConsoleAct): boolean {
  return !!role && CONSOLE_ACTS[act].roles.includes(role);
}

/** What a role is told when it asks for an act it may not take. */
export function staffCannotWords(role: StaffRole, act: ConsoleAct): string {
  return `${STAFF_ROLE_WORDS[role]} cannot do that: ${CONSOLE_ACTS[act].words.toLowerCase()}.`;
}

// ------------------------------------------------------------------------------------------- what a role may read

/**
 * What only some roles may read. Every role reads the rest, as the approved matrix has it (Home, Workspaces, Support,
 * Find, a workspace, Partners, Health, the Admin log), each screen offering a role only the acts it may take. The privacy
 * requests are read by the roles that work them: who asked to be erased is no one else's. A route of the platform scope
 * names its sight as a write names its act, and the rail draws only the screens its role sees.
 */
const CONSOLE_SIGHTS = {
  requests: { words: "the privacy requests", roles: SUPPORT_ROLES },
} as const satisfies Record<string, ActRule>;
export type ConsoleSight = keyof typeof CONSOLE_SIGHTS;

/** Whether a role may read a sight. The route asks it before it reads; the page asks it to draw the screen. */
export function staffSees(role: StaffRole | null | undefined, sight: ConsoleSight): boolean {
  return !!role && CONSOLE_SIGHTS[sight].roles.includes(role);
}

/** What a role is told when it asks to read what it may not. */
export function staffCannotSeeWords(role: StaffRole, sight: ConsoleSight): string {
  return `${STAFF_ROLE_WORDS[role]} cannot see ${CONSOLE_SIGHTS[sight].words}.`;
}

// ---------------------------------------------------------------------------------------------------- the reason

/** Why an act is taken: one of four, and a ticket or a note beside it. */
export const REASON_KINDS = ["ticket", "call", "found", "cleanup"] as const;
export type ReasonKind = (typeof REASON_KINDS)[number];

export const REASON_WORDS: Record<ReasonKind, string> = {
  ticket: "Ticket",
  call: "A call",
  found: "Found it",
  cleanup: "Cleanup",
};

export const REASON_LIMITS = { ticket: 40, note: 500 } as const;

/** The reason an act carries, as every platform write takes it. */
export interface ConsoleWhy {
  kind: ReasonKind;
  /** A report's R-number or the inbox's own; asked for when the kind is a ticket. */
  ticket: string | null;
  note: string | null;
}

/** The reason in one line: the log's, and the words a partner is written to with. */
export function whyWords(why: ConsoleWhy): string {
  const head = why.ticket ? `${REASON_WORDS[why.kind]} · ${why.ticket}` : REASON_WORDS[why.kind];
  return why.note ? `${head} · ${why.note}` : head;
}

// --------------------------------------------------------------------------------------------------- what came of it

/** What came of an act: running while it runs, then one of three. */
export const ACT_OUTCOMES = ["running", "done", "refused", "failed"] as const;
export type ActOutcome = (typeof ACT_OUTCOMES)[number];

const ACT_OUTCOME_WORDS: Record<ActOutcome, { label: string; tone: Tone }> = {
  running: { label: "Running", tone: "info" },
  done: { label: "Done", tone: "ok" },
  refused: { label: "Refused", tone: "danger" },
  failed: { label: "Failed", tone: "danger" },
};

/**
 * A running act that has said nothing for this long never will: its function stopped before it could write what came of
 * it (a route is cut off well within it). The log says so rather than "Running" for ever.
 */
const ACT_GONE_QUIET_MS = 5 * MIN_MS;
const NEVER_FINISHED = { label: "Never finished", tone: "warn" } as const;
const NEVER_FINISHED_NOTE = "It started and nothing came back. Look before taking it again.";

/** How many acts a page of the Admin log holds: a page short of it is the last. */
export const ACT_LOG_PAGE = 50;

/** What an act was taken on: the log's `target_kind`. */
export const ACT_TARGETS = ["workspace", "line", "job", "waitlist", "partner", "request", "platform"] as const;
export type ActTarget = (typeof ACT_TARGETS)[number];

/** One act as the log keeps it (platform_acts). */
export interface PlatformActDto {
  id: string;
  at: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_role: StaffRole;
  act: ConsoleAct;
  tenant_id: string | null;
  slug: string | null;
  name: string | null;
  target_kind: ActTarget;
  target_id: string | null;
  reason_kind: ReasonKind;
  ticket: string | null;
  note: string | null;
  outcome: ActOutcome;
  outcome_note: string | null;
  finished_at: string | null;
}

export interface PlatformActVM {
  id: string;
  when: string;
  who: string;
  role: string;
  what: string;
  where: string;
  why: string;
  outcome: { label: string; tone: Tone };
  outcomeNote: string | null;
  slug: string | null;
}

/** An act's row in the log: who, what, where, why, then what came of it, every word from here. */
export function actRowOf(dto: PlatformActDto, nowMs: number): PlatformActVM {
  const at = Date.parse(dto.at);
  const quiet = dto.outcome === "running" && Number.isFinite(at) && nowMs - at > ACT_GONE_QUIET_MS;
  return {
    id: dto.id,
    when: Number.isFinite(at) ? agoWords(at, nowMs) : "",
    who: staffName(dto.actor_email),
    role: STAFF_ROLE_WORDS[dto.actor_role],
    what: CONSOLE_ACTS[dto.act]?.words ?? dto.act,
    where: dto.name ?? (dto.tenant_id ? "A workspace since deleted" : TARGET_WORDS[dto.target_kind]),
    why: whyWords({ kind: dto.reason_kind, ticket: dto.ticket, note: dto.note }),
    outcome: quiet ? NEVER_FINISHED : ACT_OUTCOME_WORDS[dto.outcome],
    outcomeNote: quiet ? NEVER_FINISHED_NOTE : dto.outcome_note,
    slug: dto.slug,
  };
}

/** What an act with no workspace was taken on. */
const TARGET_WORDS: Record<ActTarget, string> = {
  workspace: "A workspace",
  line: "A line",
  job: "A job",
  waitlist: "The waiting list",
  partner: "A partner",
  request: "A request",
  platform: "Every workspace",
};

/**
 * The log as a CSV file, its columns as the database keeps them: the Admin log's Download. Its cells are the product's
 * one CSV cell (shared/csv.ts), so a note typed as a formula opens as text.
 */
export function actsCsv(rows: readonly PlatformActDto[]): string {
  const head = ["at", "who", "role", "act", "workspace", "reason", "ticket", "note", "outcome", "outcome_note"];
  const lines = rows.map((r) =>
    [
      r.at,
      r.actor_email,
      r.actor_role,
      r.act,
      r.slug ?? r.tenant_id,
      r.reason_kind,
      r.ticket,
      r.note,
      r.outcome,
      r.outcome_note,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n");
}

// ---------------------------------------------------------------------------------------------- the screens

/** The Console's screens, in the rail's order. Only what is built is drawn: a later tier adds its row. */
export const CONSOLE_SCREENS = ["home", "workspaces", "support", "requests", "partners", "health", "log"] as const;
export type ConsoleScreen = (typeof CONSOLE_SCREENS)[number];

export const CONSOLE_SCREEN_WORDS: Record<
  ConsoleScreen,
  { label: string; icon: string; group: string; sight?: ConsoleSight }
> = {
  home: { label: "Home", icon: "home", group: "Work" },
  workspaces: { label: "Workspaces", icon: "monitor", group: "Work" },
  support: { label: "Support", icon: "chat", group: "Work" },
  requests: { label: "Requests", icon: "note", group: "Work", sight: "requests" },
  partners: { label: "Partners", icon: "users", group: "Business" },
  health: { label: "Health", icon: "bolt", group: "Platform" },
  log: { label: "Admin log", icon: "list", group: "Access" },
};

/** Whether a role is shown a screen: one with a sight only to the roles that see it. */
export function staffSeesScreen(role: StaffRole | null | undefined, screen: ConsoleScreen): boolean {
  const sight = CONSOLE_SCREEN_WORDS[screen].sight;
  return sight ? staffSees(role, sight) : !!role;
}

/** A workspace's tabs, in order. */
export const CONSOLE_WORKSPACE_TABS = ["overview", "lines", "activity"] as const;
export type ConsoleWorkspaceTab = (typeof CONSOLE_WORKSPACE_TABS)[number];

export const CONSOLE_WORKSPACE_TAB_WORDS: Record<ConsoleWorkspaceTab, string> = {
  overview: "Overview",
  lines: "Setup and lines",
  activity: "Activity",
};

/** What an address under /console names: a screen, and on a workspace its slug and its tab. */
export interface ConsoleAddress {
  screen: ConsoleScreen;
  slug: string | null;
  tab: ConsoleWorkspaceTab;
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The screen an address names. Anything it cannot read is Home, so a mistyped address still opens. */
export function consoleAddressOf(pathname: string | null | undefined): ConsoleAddress {
  const parts = ((pathname ?? "").split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const [root, screen, slug, tab] = parts;
  const home: ConsoleAddress = { screen: "home", slug: null, tab: "overview" };
  if (root !== CONSOLE_PATH.slice(1) || !screen) return home;
  if (!(CONSOLE_SCREENS as readonly string[]).includes(screen)) return home;
  const s = screen as ConsoleScreen;
  if (s !== "workspaces" || !slug || !SLUG.test(slug)) return { screen: s, slug: null, tab: "overview" };
  const t = (CONSOLE_WORKSPACE_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as ConsoleWorkspaceTab)
    : "overview";
  return { screen: s, slug, tab: t };
}

/** The address of a screen, or of a workspace and its tab. */
export function consolePathOf(screen: ConsoleScreen, slug?: string | null, tab?: ConsoleWorkspaceTab): string {
  if (screen === "home") return CONSOLE_PATH;
  if (screen === "workspaces" && slug) {
    return tab && tab !== "overview"
      ? `${CONSOLE_PATH}/workspaces/${slug}/${tab}`
      : `${CONSOLE_PATH}/workspaces/${slug}`;
  }
  return `${CONSOLE_PATH}/${screen}`;
}

// ------------------------------------------------------------------------------------------- the workspaces, grouped

/** How Home and Workspaces group the verdicts: who the next move is with. */
const CONSOLE_GROUPS = {
  needs_us: ["broken", "rehearsal"],
  waiting: ["billing", "waiting_owner", "stalled"],
  look: ["quiet", "new"],
  live: ["live"],
  paused: ["paused"],
  ours: ["test"],
} as const satisfies Record<string, readonly PlatformVerdict[]>;
export type ConsoleGroup = keyof typeof CONSOLE_GROUPS;

export const CONSOLE_GROUP_WORDS: Record<ConsoleGroup, string> = {
  needs_us: "Needs us",
  waiting: "Waiting on them",
  look: "Worth a look",
  live: "Live",
  paused: "Paused",
  ours: "Ours",
};

const GROUP_ORDER = Object.keys(CONSOLE_GROUPS) as ConsoleGroup[];

/** The group a verdict falls in. */
export function consoleGroupOf(verdict: PlatformVerdict): ConsoleGroup {
  return GROUP_ORDER.find((g) => (CONSOLE_GROUPS[g] as readonly PlatformVerdict[]).includes(verdict)) ?? "look";
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
  const customers = tenants.filter((t) => verdictOf.get(t.tenant_id) !== "test");
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
export function consoleNumbersOf(n: ConsoleNumbersDto): ConsoleNumberVM[] {
  return [
    {
      label: "Paying",
      value: n.paying_cents === null ? String(n.paying) : money(n.paying_cents, n.currency),
      sub:
        n.paying_cents === null
          ? `workspace${n.paying === 1 ? "" : "s"} on a plan`
          : `a month · ${n.paying} workspace${n.paying === 1 ? "" : "s"}`,
      tone: null,
    },
    {
      label: "On a trial",
      value: String(n.trials),
      sub: n.trials_ending
        ? `${n.trials_ending} end${n.trials_ending === 1 ? "s" : ""} this week`
        : "none end this week",
      tone: n.trials_ending ? "warn" : null,
    },
    {
      label: "Heard from today",
      value: `${n.heard_today} of ${n.answering}`,
      sub: "workspaces that answer",
      tone: null,
    },
    {
      label: "Model calls, 30 days",
      value: n.model_usd === null ? "—" : `$${Math.round(n.model_usd).toLocaleString("en-US")}`,
      sub: n.model_usd === null ? "could not be read" : `across ${n.model_workspaces} workspaces`,
      tone: null,
    },
  ];
}

/** Home's line under its name: what needs us, what waits on them, what came in, and the nearest request's clock. */
export function homeSentence(n: { needsUs: number; waiting: number; cameIn: number; due: string | null }): string {
  return [
    n.needsUs === 1 ? "1 needs us" : `${n.needsUs} need us`,
    `${n.waiting} waiting on them`,
    `${n.cameIn} came in this week`,
    ...(n.due ? [n.due] : []),
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
