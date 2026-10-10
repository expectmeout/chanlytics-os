/**
 * The roles a member may hold and what each may do (E1): the roles, the ones Team hands out, and each role's
 * permissions. The order among them (roleAtLeast) is ../roles.ts; the workspace's config is config-schema.ts.
 */
import { MEMBERSHIP_ROLES } from "../../shared/enums";

/* ---------------------------------------------------------------- E1 roles */

export const ROLES = MEMBERSHIP_ROLES;
export type Role = (typeof ROLES)[number];

/**
 * The roles Team hands out: an invite, a change of role. A partner is not one
 * of them. That role arrives with the workspace, written by the attribution
 * when the workspace is made through a partner's link (decision 0012), and
 * Team can only take it away.
 */
export const TEAM_ROLES = ["owner", "operator", "viewer"] as const satisfies readonly Role[];

/** What each role may do. Mirrors the mockup's ST_PERMS exactly — the client
 *  gate() chips read this shape; the server re-checks via requireRole. */
export const ROLE_PERMS: Record<
  Role,
  {
    approve: boolean;
    autonomy: boolean;
    disconnect: boolean;
    billing: boolean;
    team: boolean;
    settings: boolean;
    export: boolean;
    find: boolean;
  }
> = {
  // `settings` is the business details and who is alerted: PUT /settings is
  // owner-only, and the form used to open on the autonomy gate, which let an
  // operator fill it in and be refused at Save.
  // `export` is the whole customer list as a file: a member sees these
  // people a screen at a time, the owner may take them all at once.
  // `find` is the lead finder: starting a search, keeping a lead from review,
  // putting one back. Each spends the month's allowance, so it is the
  // owner's, and the partner's (PRD v3 §16.6, S9); has_permission() in 00140
  // (widened in 00201) says the same, and lead-engine.db.test.mjs holds the
  // two together.
  // `partner` (decision 0012) is the member who brought the workspace and sets
  // it up for its owner: everything setting up and running the receptionist
  // takes, and nothing that touches the money, the team, or the customer list
  // as a file. `disconnect` is the channel permission both ways: a partner
  // gets the line and connects WhatsApp, and may disconnect them again.
  owner: {
    approve: true,
    autonomy: true,
    disconnect: true,
    billing: true,
    team: true,
    settings: true,
    export: true,
    find: true,
  },
  operator: {
    approve: true,
    autonomy: true,
    disconnect: false,
    billing: false,
    team: false,
    settings: false,
    export: false,
    find: false,
  },
  partner: {
    approve: true,
    autonomy: true,
    disconnect: true,
    billing: false,
    team: false,
    settings: true,
    export: false,
    find: true,
  },
  viewer: {
    approve: false,
    autonomy: false,
    disconnect: false,
    billing: false,
    team: false,
    settings: false,
    export: false,
    find: false,
  },
};

/* ---------------------------------------------------------------- what a role is called */

/** A role in words: its name, what it may do in a sentence, and the short line a picker says under the name. */
export interface RoleSays {
  label: string;
  /** The name with its article, as a sentence takes it: "an Owner", "a Viewer". */
  one: string;
  can: string;
  short: string;
}

/**
 * Each role in the words every place that names one says: Team's roster, its pickers and its invitation, Profile's
 * role row, Ask's invitation card. Settings kept these, and Ask said an Operator "replies and handles threads; no
 * settings or team" beside Settings' "approves decisions and tunes autonomy": one role, two descriptions.
 */
export const ROLE_SAYS: Record<Role, RoleSays> = {
  owner: {
    label: "Owner",
    one: "an Owner",
    can: "Everything, billing and the team included.",
    short: "Everything, billing and the team included",
  },
  operator: {
    label: "Operator",
    one: "an Operator",
    can: "Answers and approves conversations, tunes autonomy. No billing, team or channels.",
    short: "Answers and approves, tunes autonomy",
  },
  partner: {
    label: "Partner",
    one: "a Partner",
    can: "Sets up and runs the receptionist with you. No billing, team or customer export.",
    short: "Sets up and runs the receptionist with you",
  },
  viewer: {
    label: "Viewer",
    one: "a Viewer",
    can: "Sees everything, changes nothing.",
    short: "Sees everything, changes nothing",
  },
};

/** A role's words, for a role the server may name: one this list does not know is said as it is stored. */
export function roleSays(role: string): RoleSays {
  return (ROLE_SAYS as Partial<Record<string, RoleSays>>)[role] ?? { label: role, one: role, can: "", short: "" };
}

/** A line of the roles compared: what it lets a member do, and the permission that decides it (none: every role). */
export interface RoleTableRow {
  says: string;
  /** A word after it, quieter: what doing it costs. */
  note: string | null;
  can: Record<Role, boolean>;
}

/** The permissions in the order the table says them, each in the product's words. */
const ROLE_TABLE_LINES: readonly { perm: keyof (typeof ROLE_PERMS)[Role] | null; says: string; note?: string }[] = [
  { perm: null, says: "See conversations, people and reports" },
  { perm: "approve", says: "Approve and send replies" },
  { perm: "autonomy", says: "Tune autonomy" },
  { perm: "settings", says: "Business details and who gets alerts" },
  { perm: "disconnect", says: "Connect and disconnect channels" },
  { perm: "find", says: "Find leads", note: "uses the month's allowance" },
  { perm: "export", says: "Export the customer list" },
  { perm: "billing", says: "Billing" },
  { perm: "team", says: "The team and its roles" },
];

/**
 * The roles compared, a line a permission: Team's "Compare", drawn from ROLE_PERMS itself, so the table cannot say a
 * role may do what the gates refuse it. Seeing is every role's (a viewer "sees everything").
 */
export function roleTable(): RoleTableRow[] {
  return ROLE_TABLE_LINES.map((line) => ({
    says: line.says,
    note: line.note ?? null,
    can: Object.fromEntries(ROLES.map((r) => [r, line.perm === null ? true : ROLE_PERMS[r][line.perm]])) as Record<
      Role,
      boolean
    >,
  }));
}
