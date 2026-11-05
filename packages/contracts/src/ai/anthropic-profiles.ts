/**
 * Whom a model call is for, as Anthropic is told (decision 0097; Anthropic's "User profiles" page, read 4 Nov 2026).
 *
 * A request with no profile counts as the platform's own, and one customer's flagged traffic can then restrict the whole
 * organization. So every call says whom it is for, and the answer comes from one place:
 *
 *   person     someone signed in asked for it: Ask, the drafts they press, a rehearsal's review. Their own profile.
 *   workspace  nobody signed in did: the receptionist answering a business's customer, a sweep, a job. The business's
 *              profile, never its owner's, so a stranger's words cannot pause a person who wrote none of them, nor every
 *              other workspace that person runs. A business's customer has no profile: no sign-up, nothing to erase.
 *   ours       no workspace at all: the platform's own, and the one way a request goes with no profile by decision.
 *
 * Each purpose's route says which it is (ai/models.ts `attributed`), so a purpose cannot be added without the decision.
 *
 * A profile that is anything but unrestricted pauses its subject's calls here, before they leave: a paused person or
 * workspace is never sent on with no profile, or under another's, which would hand their traffic to the whole organization.
 */
import type { AnthropicProfileKind } from "./anthropic-enforcement";
import { modelRoute, type ModelPurpose } from "./models";

/** Whom a call is for. */
export type ModelSubject =
  { kind: "person"; userId: string } | { kind: "workspace"; tenantId: string } | { kind: "ours" };

/**
 * The one decision (see above): a person's purpose with a person named is theirs, and with none, as a sweep asks one, the
 * workspace's; a workspace's purpose is the workspace's whoever pressed; no workspace and no person is ours.
 */
export function modelSubjectOf(
  purpose: ModelPurpose,
  who: { tenantId: string | null; userId?: string | null },
): ModelSubject {
  const person = who.userId ? ({ kind: "person", userId: who.userId } as const) : null;
  if (person && modelRoute(purpose).attributed === "person") return person;
  if (who.tenantId) return { kind: "workspace", tenantId: who.tenantId };
  return person ?? { kind: "ours" };
}

/** A subject Anthropic can be told of: what a profile is made for. */
export type ProfiledSubject = Exclude<ModelSubject, { kind: "ours" }>;

/** The subject's id, whichever kind it is. */
export const subjectIdOf = (s: ProfiledSubject): string => (s.kind === "person" ? s.userId : s.tenantId);

/** How a profile names its subject (reference_id): stable, ours, and what finds a create whose answer was lost. */
export const profileReferenceOf = (s: ProfiledSubject): string => `${s.kind}:${subjectIdOf(s)}`;

/**
 * What a create is told, and nothing more: no name, no address and no hash of one, no words, nothing we would have to keep
 * current. Its page says a detail sent can be replaced and never cleared, so one we don't need stays here.
 */
export function profileDetailsOf(
  kind: AnthropicProfileKind,
  claim: { referenceId: string; onboardedAt: string },
): Record<string, string> {
  return {
    reference_id: claim.referenceId,
    entity_type: kind === "person" ? "individual" : "business",
    onboarded_at: new Date(claim.onboardedAt).toISOString(),
  };
}
