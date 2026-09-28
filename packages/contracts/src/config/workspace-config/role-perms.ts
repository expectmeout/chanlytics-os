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
