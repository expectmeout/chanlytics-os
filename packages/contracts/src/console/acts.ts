/** Console: acts. */

import type { Tone } from "../shell/tone";
import { CONSOLE_PATH } from "./path";
import { csvCell } from "../imports/csv";
import { agoWords, MIN_MS } from "../shared/time";
import {
  CONSOLE_ACTS,
  STAFF_ROLE_WORDS,
  staffName,
  staffSees,
  type ConsoleAct,
  type ConsoleSight,
  type ReasonKind,
  type StaffRole,
  whyWords,
} from "./staff";
import { SLUG } from "../shared/identity";

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
export const ACT_TARGETS = [
  "workspace",
  "line",
  "job",
  "waitlist",
  "partner",
  "request",
  "platform",
  "report",
  "ask",
] as const;

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
  report: "A report",
  ask: "A setup ask",
};

/**
 * The log as a CSV file, its columns as the database keeps them: the Admin log's Download. Its cells are the product's
 * one CSV cell (imports/csv.ts), so a note typed as a formula opens as text.
 */
export function actsCsv(rows: readonly PlatformActDto[]): string {
  const head = ["at", "who", "role", "act", "workspace", "reason", "ticket", "note", "outcome", "outcome_note"];
  const lines = rows.map((row) =>
    [
      row.at,
      row.actor_email,
      row.actor_role,
      row.act,
      row.slug ?? row.tenant_id,
      row.reason_kind,
      row.ticket,
      row.note,
      row.outcome,
      row.outcome_note,
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

/** The screen an address names. Anything it cannot read is Home, so a mistyped address still opens. */
export function consoleAddressOf(pathname: string | null | undefined): ConsoleAddress {
  const parts = ((pathname ?? "").split(/[?#]/)[0] ?? "").split("/").filter(Boolean);
  const [root, screen, slug, tab] = parts;
  const home: ConsoleAddress = { screen: "home", slug: null, tab: "overview" };
  if (root !== CONSOLE_PATH.slice(1) || !screen) return home;
  if (!(CONSOLE_SCREENS as readonly string[]).includes(screen)) return home;
  const consoleScreen = screen as ConsoleScreen;
  if (consoleScreen !== "workspaces" || !slug || !SLUG.test(slug))
    return { screen: consoleScreen, slug: null, tab: "overview" };
  const item = (CONSOLE_WORKSPACE_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as ConsoleWorkspaceTab)
    : "overview";
  return { screen: consoleScreen, slug, tab: item };
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
