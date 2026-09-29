/**
 * The milestones a new workspace passes on its way to being a customer: the product's analytics (category 39,
 * "analytics events"). Each is written once per workspace, as `workspace.activated` on the ledger (packages/db
 * recordActivation), where it happens:
 *
 *   line_live          the first line that answers: a phone line provisioned and answering, or WhatsApp connected
 *                      (apps/edge/lib/lines/provision.ts, apps/edge/api/admin/whatsapp/connect.ts);
 *   first_reply        the receptionist's first answer sent to a customer (apps/edge/lib/whatsapp/persist.ts);
 *   first_lead_search  the first lead search made (apps/dashboard/app/api/v1/lead-searches/route.ts).
 *
 * A funnel reads them in this order: how many workspaces made, how many got a line, a reply, a search.
 */
export const ACTIVATION_MILESTONES = ["line_live", "first_reply", "first_lead_search"] as const;
export type ActivationMilestone = (typeof ACTIVATION_MILESTONES)[number];
