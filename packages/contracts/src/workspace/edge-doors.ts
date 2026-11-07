/**
 * The edge's doors for a workspace's plan, its people's invitations and what the platform is told about it, as the
 * dashboard knocks on them (decision 0109).
 */
import { z } from "zod";
import { DOOR_ID, edgeDoor } from "../shared/edge/door";

/** POST /api/admin/billing: a way to pay, the portal, invoices, a plan resumed or ended (apps/edge/lib/billing/admin.ts). */
export const BILLING_DOOR = edgeDoor(
  "/api/admin/billing",
  z.object({
    op: z.string(),
    tenant_id: DOOR_ID.optional(),
    user_id: DOOR_ID.optional(),
    /** The address Checkout fills in, when the person has one. */
    email: z.string().nullable().optional(),
    /** Where Checkout sends the person back to. */
    return: z.unknown().optional(),
    embedded: z.boolean().optional(),
  }),
);

/** POST /api/admin/handover-invite: the email that hands a workspace to its owner. */
export const HANDOVER_INVITE_DOOR = edgeDoor("/api/admin/handover-invite", z.object({ tenant_id: DOOR_ID.optional() }));

/** POST /api/admin/partner-invite: the email that invites a partner. */
export const PARTNER_INVITE_DOOR = edgeDoor("/api/admin/partner-invite", z.object({ tenant_id: DOOR_ID.optional() }));

/** POST /api/admin/signup-notify: the platform is told of a new workspace. */
export const SIGNUP_NOTIFY_DOOR = edgeDoor(
  "/api/admin/signup-notify",
  z.object({ tenant_id: DOOR_ID.optional(), email: z.string().optional() }),
);

/** POST /api/admin/setup-request: the platform is asked to set something up with the workspace. */
export const SETUP_REQUEST_DOOR = edgeDoor(
  "/api/admin/setup-request",
  z.object({ tenant_id: DOOR_ID.optional(), what: z.string().optional(), by: z.string().nullable().optional() }),
);

/** POST /api/admin/you-are-live: the owner is told the receptionist answers now. */
export const YOU_ARE_LIVE_DOOR = edgeDoor("/api/admin/you-are-live", z.object({ tenant_id: DOOR_ID.optional() }));
