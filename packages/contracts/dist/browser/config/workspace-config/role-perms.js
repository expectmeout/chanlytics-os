import { MEMBERSHIP_ROLES } from "../../shared/enums.js";
export const ROLES = MEMBERSHIP_ROLES;
export const TEAM_ROLES = ["owner", "operator", "viewer"];
export const ROLE_PERMS = {
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
    find: true
  },
  operator: {
    approve: true,
    autonomy: true,
    disconnect: false,
    billing: false,
    team: false,
    settings: false,
    export: false,
    find: false
  },
  partner: {
    approve: true,
    autonomy: true,
    disconnect: true,
    billing: false,
    team: false,
    settings: true,
    export: false,
    find: true
  },
  viewer: {
    approve: false,
    autonomy: false,
    disconnect: false,
    billing: false,
    team: false,
    settings: false,
    export: false,
    find: false
  }
};
export const ROLE_SAYS = {
  owner: {
    label: "Owner",
    one: "an Owner",
    can: "Everything, billing and the team included.",
    short: "Everything, billing and the team included"
  },
  operator: {
    label: "Operator",
    one: "an Operator",
    can: "Answers and approves conversations, tunes autonomy. No billing, team or channels.",
    short: "Answers and approves, tunes autonomy"
  },
  partner: {
    label: "Partner",
    one: "a Partner",
    can: "Sets up and runs the receptionist with you. No billing, team or customer export.",
    short: "Sets up and runs the receptionist with you"
  },
  viewer: {
    label: "Viewer",
    one: "a Viewer",
    can: "Sees everything, changes nothing.",
    short: "Sees everything, changes nothing"
  }
};
export function roleSays(role) {
  return ROLE_SAYS[role] ?? { label: role, one: role, can: "", short: "" };
}
const ROLE_TABLE_LINES = [
  { perm: null, says: "See conversations, people and reports" },
  { perm: "approve", says: "Approve and send replies" },
  { perm: "autonomy", says: "Tune autonomy" },
  { perm: "settings", says: "Business details and who gets alerts" },
  { perm: "disconnect", says: "Connect and disconnect channels" },
  { perm: "find", says: "Find leads", note: "uses the month's allowance" },
  { perm: "export", says: "Export the customer list" },
  { perm: "billing", says: "Billing" },
  { perm: "team", says: "The team and its roles" }
];
export function roleTable() {
  return ROLE_TABLE_LINES.map((line) => ({
    says: line.says,
    note: line.note ?? null,
    can: Object.fromEntries(ROLES.map((r) => [r, line.perm === null ? true : ROLE_PERMS[r][line.perm]]))
  }));
}
