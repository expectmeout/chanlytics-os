/**
 * What Anthropic says of a profile, and what follows (decision 0097; ai/anthropic-profiles.ts decides whom a call is for). Apart
 * from that module so a page that reads a status carries no route: the model registry stays on the server.
 */

/** What a profile stands for: anthropic_profiles.kind. */
export const ANTHROPIC_PROFILE_KINDS = ["person", "workspace"] as const;
export type AnthropicProfileKind = (typeof ANTHROPIC_PROFILE_KINDS)[number];

/**
 * What Anthropic says of a profile: anthropic_profiles.enforcement_status. `pending` is in the API's reference and not on
 * the guide's page: an identity check is under review, and the restriction stands until it ends.
 */
export const ANTHROPIC_ENFORCEMENT_STATUSES = ["unrestricted", "pending", "restricted", "banned"] as const;
export type AnthropicEnforcementStatus = (typeof ANTHROPIC_ENFORCEMENT_STATUSES)[number];

/** Whether this status pauses the subject's calls. */
export const anthropicPaused = (status: AnthropicEnforcementStatus): boolean => status !== "unrestricted";

/**
 * What Anthropic's word comes to. A value we do not know reads restricted, as its page asks. No value at all is null, and
 * changes nothing: an answer that left the field out says nothing of the profile, and must not pause every customer.
 */
export function enforcementStatusOf(raw: unknown): AnthropicEnforcementStatus | null {
  if (typeof raw !== "string" || !raw) return null;
  return (ANTHROPIC_ENFORCEMENT_STATUSES as readonly string[]).includes(raw)
    ? (raw as AnthropicEnforcementStatus)
    : "restricted";
}

const ENFORCEMENT_REASONS = [
  "unsupported_region",
  "fraud_or_abuse",
  "high_harm",
  "usage_policy_violation",
  "account_compromise",
  "unspecified",
] as const;
type EnforcementReason = (typeof ENFORCEMENT_REASONS)[number];

/** One open action, as anthropic_profiles keeps it. */
export type EnforcementAction = {
  type: "restriction" | "ban";
  id: string | null;
  reason: EnforcementReason;
  /** What the person can do to clear it: `verify` is an identity check; null is nothing. */
  action: "verify" | null;
  opened_at: string | null;
  expires_at: string | null;
};

const filledOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** The open actions in the words we know: an unknown type reads restriction, a reason unspecified, a next step none. */
export function enforcementActionsOf(raw: unknown): EnforcementAction[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
    .map((a) => ({
      type: a.type === "ban" ? "ban" : "restriction",
      id: filledOrNull(a.id),
      reason: (ENFORCEMENT_REASONS as readonly unknown[]).includes(a.reason)
        ? (a.reason as EnforcementReason)
        : "unspecified",
      action: a.action === "verify" ? "verify" : null,
      opened_at: filledOrNull(a.opened_at),
      expires_at: filledOrNull(a.expires_at),
    }));
}

const REASON_WORDS: Record<EnforcementReason, string> = {
  unsupported_region: "an unsupported region",
  fraud_or_abuse: "fraud or abuse",
  high_harm: "high harm",
  usage_policy_violation: "the usage policy",
  account_compromise: "a compromised account",
  unspecified: "no reason given",
};

/** What Anthropic said of a paused profile, as the platform reads it (Health, and the page): never a customer's words. */
export function enforcementWords(status: AnthropicEnforcementStatus, actions: EnforcementAction[]): string {
  const said = status === "banned" ? "Banned" : status === "pending" ? "Identity check under review" : "Restricted";
  const why = [...new Set(actions.map((a) => REASON_WORDS[a.reason]))].join(", ") || REASON_WORDS.unspecified;
  const next = actions.some((a) => a.action === "verify") ? " They can clear it with an identity check." : "";
  return `${said}: ${why}.${next}`;
}

/** What a member reads while a profile is paused. Plain, and no reason: the reason is the platform's to say to them. */
export const MODEL_PAUSED_WORDS = {
  ask: {
    en: "Ask is paused on your account. Your pages still work. Write to support and we'll sort it out.",
    es: "Ask está en pausa en tu cuenta. Tus páginas siguen funcionando. Escribe a soporte y lo resolvemos.",
  },
  draft: (what: string) => `The ${what} waits while Ask is paused on your account.`,
  edge: "The model is paused for this account.",
  reviewReply: "The model is paused for this workspace.",
} as const;

/** A paused profile as Health shows it. */
export interface HealthPausedProfileDto {
  id: string;
  kind: AnthropicProfileKind;
  tenant_id: string | null;
  user_id: string | null;
  status: AnthropicEnforcementStatus;
  actions: EnforcementAction[];
  at: string | null;
}

/** The profiles as Health reads them: how many are kept, wait to be made, wait to be deleted, and which are paused. */
export interface HealthAnthropicProfilesDto {
  kept: number;
  waiting: number;
  leaving: number;
  paused: HealthPausedProfileDto[];
}
