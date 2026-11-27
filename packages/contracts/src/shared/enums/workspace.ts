/** The closed sets of a workspace's own: its status and its members' roles. Held to their columns as every set is (shared/enums.ts). */
/** `preview`: a workspace built for a lead before anyone signs up, with no member (00497, decision 0079). */
export const TENANT_STATUSES = ["active", "paused", "test", "preview"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const MEMBERSHIP_ROLES = ["owner", "operator", "partner", "viewer"] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];
