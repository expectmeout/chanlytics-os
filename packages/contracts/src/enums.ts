/**
 * Closed sets shared with the database CHECK constraints.
 * A unit test diffs these against the migrations (Blueprint P5) — grow per slice.
 */
export const TENANT_STATUSES = ["active", "paused", "test"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "staff"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
