/**
 * Whom a model call is for, answered before it leaves (decision 0097; contracts ai/anthropic-profiles.ts modelSubjectOf
 * decides, lib/ai/model.ts asks here, the port sends it).
 *
 *   ANTHROPIC_PROFILES not 'on'  no read and no create: the request goes as it always has. Merged dark.
 *   a profile, banned            held: no call. A banned subject is never sent on with no id, or under another's.
 *   a profile, anything else     its id. A restricted subject "may still be served in part", so Anthropic decides, call by
 *                                call; what it refuses fails as any refusal does, and the receptionist hands it to a person.
 *   none yet                     made now, once, inside a short bound, so a new sign-up's first words are not the
 *                                organization's. A create that fails goes unattributed and is logged, as every call went
 *                                before this: a customer's reply is not refused for a registration, and the sweep makes it.
 *   a read that failed           the last we saw, or held: "we could not check" is not "yes", and an unread status must not
 *                                strip a banned subject's id (mayUseModelFor's rule).
 *
 * The row is kept a minute per instance, as Ask's day is: a turn is several calls, and each would be a read before the model
 * was even asked. A status Anthropic changes reaches here within the sweep's half hour and that minute; in between, the API
 * refuses what it refuses, under the right id.
 */
import {
  anthropicPaused,
  MIN_MS,
  modelSubjectOf,
  profileDetailsOf,
  profileReferenceOf,
  type ModelPurpose,
  type ProfiledSubject,
} from "@chanlytics/contracts";
import { createUserProfile, type ModelAttribution, type ModelDeps } from "@chanlytics/channels";
import {
  anthropicProfileOf,
  claimAnthropicProfile,
  dropAnthropicProfile,
  keepAnthropicProfileId,
  type AnthropicProfileHeld,
  type Database,
} from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "../../shared/env.js";
import { errField, logger } from "../../shared/log.js";
import { pg } from "../../shared/pg.js";

/** What a call comes to: sent under this, or held, and why. */
type AttributionAnswer = { attribution: ModelAttribution } | { held: "paused" | "unread" };

const NO_PROFILE: AttributionAnswer = { attribution: { profileId: null } };

/** The switch: profiles are made and named on calls. Deleting one whose subject went does not wait on it. */
export const anthropicProfilesOn = (): boolean => env.ANTHROPIC_PROFILES === "on";

/**
 * One profile made, for the subject whose claim this call won; its id, or null when there is none to use.
 *
 * Nothing made (a refusal, a "not now") lets the claim go, so the next asks again. An answer that never came may have made
 * one, so the claim stays and nothing creates again: the sweep finds the profile by its reference, or lets the claim go once
 * a whole listing shows there is none. An id we could not store is used all the same, and found the same way.
 */
export async function makeAnthropicProfile(
  db: SupabaseClient<Database>,
  subject: ProfiledSubject,
  key: string,
  deps: ModelDeps,
): Promise<string | null> {
  const L = logger(subject.kind === "workspace" ? { tenant_id: subject.tenantId } : {});
  const claim = await claimAnthropicProfile(db, subject);
  if (!claim) return null;
  const made = await createUserProfile(
    key,
    profileDetailsOf(subject.kind, { referenceId: claim.referenceId, onboardedAt: claim.onboardedAt }),
    deps,
  );
  if (made.outcome === "ok") {
    await keepAnthropicProfileId(db, claim.id, made.profile.id).catch((e: unknown) =>
      L.error("anthropic_profile_write_failed", { kind: subject.kind, error: errField(e) }),
    );
    return made.profile.id;
  }
  L.error("anthropic_profile_not_made", { kind: subject.kind, outcome: made.outcome, error: made.error.slice(0, 200) });
  if (made.outcome !== "unknown") await dropAnthropicProfile(db, claim.id);
  return null;
}

const heldLately = new Map<string, { at: number; row: AnthropicProfileHeld | null }>();

/** Everything kept let go: for a test, which must not inherit the last test's profile. */
export function forgetAnthropicProfiles(): void {
  heldLately.clear();
}

/** A subject's row, kept a minute; a read that fails answers the last one, or "unread". */
async function profileHeldOf(
  db: SupabaseClient<Database>,
  subject: ProfiledSubject,
): Promise<AnthropicProfileHeld | null | "unread"> {
  const ref = profileReferenceOf(subject);
  const had = heldLately.get(ref);
  if (had && Date.now() - had.at < MIN_MS) return had.row;
  try {
    const row = await anthropicProfileOf(db, subject);
    heldLately.set(ref, { at: Date.now(), row });
    return row;
  } catch (e) {
    logger().error("anthropic_profile_unread", { kind: subject.kind, error: errField(e) });
    return had ? had.row : "unread";
  }
}

/** Whom this call goes as: the decision, the row it comes to, and a profile made if it has none. Never thrown. */
export async function attributionFor(
  purpose: ModelPurpose,
  who: { tenantId: string | null; userId?: string | null },
  key: string,
  deps: ModelDeps,
): Promise<AttributionAnswer> {
  const subject = modelSubjectOf(purpose, who);
  if (!anthropicProfilesOn()) return NO_PROFILE;
  const L = logger(who.tenantId ? { tenant_id: who.tenantId } : {});
  if (subject.kind === "ours") {
    L.error("model_call_ours", { purpose });
    return NO_PROFILE;
  }
  const db = pg();
  if (!db) return NO_PROFILE;
  const held = await profileHeldOf(db, subject);
  if (held === "unread") return { held: "unread" };
  if (held && anthropicPaused(held.enforcement_status)) {
    L.warn("model_call_paused", { purpose, kind: subject.kind });
    return { held: "paused" };
  }
  if (held?.profile_id) return { attribution: { profileId: held.profile_id } };
  const made = held ? null : await makeAnthropicProfile(db, subject, key, deps).catch(madeNothing);
  if (made) {
    heldLately.set(profileReferenceOf(subject), {
      at: Date.now(),
      row: { profile_id: made, enforcement_status: "unrestricted" },
    });
    return { attribution: { profileId: made } };
  }
  L.warn("model_call_no_profile", { purpose, kind: subject.kind });
  return NO_PROFILE;
}

function madeNothing(e: unknown): null {
  logger().error("anthropic_profile_not_made", { error: errField(e) });
  return null;
}
