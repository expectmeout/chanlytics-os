/**
 * The role ladder, read one way (decision 0012 added the partner's rung). Beside config.ts, which names the roles and
 * what each may do per permission; this is the order of them, for a door that names the least role it takes.
 */
import type { Role } from "./config";

/**
 * The ladder a route's `role` names a rung of. A partner (decision 0012) sits
 * between operator and owner: everything setting a workspace up takes, and
 * nothing that touches its money or its team, which is what `role: "partner"`
 * on a route means (config.ts ROLE_PERMS is the same table, per permission).
 */
const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, partner: 2, owner: 3 };

/**
 * Whether a role stands on the rung named, or above it: the one reading of the ladder, for the doors (requireRole),
 * for what Ask hands a member (the act tools, which refuse a card its route would refuse), and for a page that offers
 * an act only to the role its door takes (Leads' Erase, PR 9). A role the ladder does not know stands on no rung.
 */
export function roleAtLeast(role: string, atLeast: Role): boolean {
  const have = Object.prototype.hasOwnProperty.call(ROLE_RANK, role) ? ROLE_RANK[role as Role] : undefined;
  return have !== undefined && have >= ROLE_RANK[atLeast];
}
