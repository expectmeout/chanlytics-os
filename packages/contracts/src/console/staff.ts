/** Console: staff. */

import { type PlatformLineAction } from "../workspace/platform";

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
  job_requeue_kind: { words: "Run every failed job of a kind again", roles: SUPPORT_ROLES },
  job_kind_pause: { words: "Pause or resume a kind of background work", roles: SUPPORT_ROLES },
  waitlist_invited: { words: "Mark as invited", roles: SUPPORT_ROLES },
  partner_standing: { words: "Rule on a partner's workspace", roles: MONEY_ROLES },
  partner_payout: { words: "Record a payout", roles: MONEY_ROLES },
  partner_status: { words: "Pause, close or restore a partner", roles: SUPPORT_ROLES },
  partner_second_factor: { words: "Reset a partner's second factor", roles: SUPPORT_ROLES },
  request_file: { words: "File a request", roles: SUPPORT_ROLES },
  request_step: { words: "Mark a request's step", roles: SUPPORT_ROLES },
  request_close: { words: "Close a request", roles: SUPPORT_ROLES },
  report_answered: { words: "Mark a question answered", roles: SUPPORT_ROLES },
  report_reopened: { words: "Open a question again", roles: SUPPORT_ROLES },
  report_resent: { words: "Send a report to the inbox again", roles: SUPPORT_ROLES },
  report_moved: { words: "Move a report between Support and Health", roles: SUPPORT_ROLES },
  ask_answered: { words: "Mark a setup ask answered", roles: SUPPORT_ROLES },
  ask_done: { words: "Mark a setup ask done", roles: SUPPORT_ROLES },
  ask_reopened: { words: "Open a setup ask again", roles: SUPPORT_ROLES },
  delivery_redrive: { words: "Deliver a subscriber's failures again", roles: SUPPORT_ROLES },
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
export function whyWords(reason: ConsoleWhy): string {
  const head = reason.ticket ? `${REASON_WORDS[reason.kind]} · ${reason.ticket}` : REASON_WORDS[reason.kind];
  return reason.note ? `${head} · ${reason.note}` : head;
}
