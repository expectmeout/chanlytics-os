/**
 * What more than one pane of Settings says or checks (moved from legacy/pages/settings.jsx, decision 0015 step 11): each
 * role's name and what it may do, and the shape an address must have before a pane sends it.
 */

/** A role's name, and what it may do in a sentence. */
interface RoleWords {
  label: string;
  can: string;
}

/** Each role's words: Profile's role row, and Team's roster, its menus and its legend. A role not listed has none. */
export const ROLE_WORDS: Partial<Record<string, RoleWords>> = {
  owner: { label: "Owner", can: "Everything — billing, team, and disconnecting channels" },
  operator: { label: "Operator", can: "Approves decisions and tunes autonomy — not billing or team" },
  partner: { label: "Partner", can: "Sets up and runs the receptionist for you — not billing or team" },
  viewer: { label: "Viewer", can: "Sees everything, changes nothing — approvals are read-only" },
};

/** A role's words, for a role the server may name: one this list does not know is said as it is stored. */
export const roleWords = (role: string): RoleWords => ROLE_WORDS[role] ?? { label: role, can: "" };

/** An address as a pane takes one: something, an @, something with a dot in it. The server's schema decides. */
export const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
