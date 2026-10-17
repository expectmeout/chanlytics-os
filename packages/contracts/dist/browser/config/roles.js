const ROLE_RANK = { viewer: 0, operator: 1, partner: 2, owner: 3 };
export function roleAtLeast(role, atLeast) {
  const have = Object.prototype.hasOwnProperty.call(ROLE_RANK, role) ? ROLE_RANK[role] : void 0;
  return have !== void 0 && have >= ROLE_RANK[atLeast];
}
