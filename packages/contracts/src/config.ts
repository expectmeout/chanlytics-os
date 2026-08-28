/**
 * Control plane types (PRD E1/E3/E4) — the single source every boundary
 * imports: the Settings form, the /v1 routes, and the edge runtime all parse
 * the same schemas, so an option that exists in the UI exists in the runtime
 * by construction (anti-junk rule R1).
 */
import { z } from "zod";

/* ---------------------------------------------------------------- E1 roles */

export const ROLES = ["owner", "operator", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/** What each role may do. Mirrors the mockup's ST_PERMS exactly — the client
 *  gate() chips read this shape; the server re-checks via requireRole. */
export const ROLE_PERMS: Record<Role, { approve: boolean; autonomy: boolean; disconnect: boolean; billing: boolean; team: boolean }> = {
  owner:    { approve: true,  autonomy: true,  disconnect: true,  billing: true,  team: true },
  operator: { approve: true,  autonomy: true,  disconnect: false, billing: false, team: false },
  viewer:   { approve: false, autonomy: false, disconnect: false, billing: false, team: false },
};

/* --------------------------------------------------------------- E3 policy */

export const POLICY_CLASSES = ["reply", "booking", "faq", "reengage", "campaign", "money"] as const;
export type PolicyClass = (typeof POLICY_CLASSES)[number];

/** 'veto' exists in the enum (and the DB CHECK) but is NOT offered by any UI
 *  until the drafts/countdown engine exists — R1: no option without an
 *  enforcer. The runtime treats an unexpected mode as 'ask' (fail safe). */
export const POLICY_MODES = ["auto", "veto", "ask", "never"] as const;
export type PolicyMode = (typeof POLICY_MODES)[number];

export const PolicyLimitsSchema = z
  .object({
    max_replies_day: z.number().int().min(1).max(200).optional(),
    pause_hours: z.number().int().min(1).max(168).optional(),
  })
  .strict();
export type PolicyLimits = z.infer<typeof PolicyLimitsSchema>;

export interface PolicyRow {
  id: string;
  class: PolicyClass;
  mode: PolicyMode;
  subject_type: "segment" | "contact" | null;
  subject_id: string | null;
  limits: PolicyLimits;
  updated_at: string;
}

/* --------------------------------------------------------------- E4 config */

export const BrainConfigSchema = z
  .object({
    business_name: z.string().min(1).max(120),
    phone_display: z.string().min(3).max(40),
    booking_link: z.string().url().max(500),
    /** The complete system prompt the model receives — the "AI memory" pane's
     *  one hard promise is that what it shows is EXACTLY this, nothing more. */
    system_prompt: z.string().min(40).max(20000),
    fallbacks: z
      .object({
        /** Sent when no model key is configured. */
        greeting: z.string().min(1).max(2000),
        /** Sent when the model call failed. */
        error: z.string().min(1).max(2000),
        /** Sent for voice notes / photos before escalating. */
        non_text: z.string().min(1).max(2000),
      })
      .strict(),
  })
  .strict();
export type BrainConfig = z.infer<typeof BrainConfigSchema>;

export const NotificationsConfigSchema = z
  .object({
    escalation_emails: z.array(z.string().email()).min(1).max(10),
    from: z.string().max(200).optional(),
  })
  .strict();
export type NotificationsConfig = z.infer<typeof NotificationsConfigSchema>;

/** The whole tenant_config.config column. Sections are optional — a tenant
 *  with no brain section is a tenant whose receptionist does not speak
 *  (persist + escalate only). Safe-by-default beats a leaked persona. */
export const TenantConfigSchema = z
  .object({
    brain: BrainConfigSchema.optional(),
    notifications: NotificationsConfigSchema.optional(),
  })
  .strict();
export type TenantConfig = z.infer<typeof TenantConfigSchema>;

/** Parse unknown JSONB into TenantConfig, or null if malformed. The runtime
 *  treats a malformed config exactly like an absent one — silence over a
 *  half-applied persona. */
export function parseTenantConfig(raw: unknown): TenantConfig | null {
  const r = TenantConfigSchema.safeParse(raw ?? {});
  return r.success ? r.data : null;
}
