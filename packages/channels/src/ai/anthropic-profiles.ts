/**
 * Anthropic's user profiles, the wire (decision 0097; its "User profiles" page and API reference, read 4 Nov 2026): a
 * profile created, deleted and listed. Nothing here knows a person or a workspace; lib/anthropic-profiles on the edge does.
 *
 * Creating is not idempotent: every create is a new profile, even for a reference_id that has one. So it is one try, and
 * its outcome says what is known: `refused` and `retryable` mean nothing was made, and `unknown` (a timeout, a 5xx) that one
 * may have been, which the caller must never answer with another create.
 *
 * No request names a `user-profiles-` beta: those leave out the enforcement fields, and the list's filter refuses them. The
 * listing is whole and unfiltered: a filter on the statuses we know would miss one Anthropic adds, and the same pages find a
 * create whose answer was lost. A page may come back short, so only a null `next_page` ends it.
 *
 * The version is the one its pages are written against. The Messages API stays on the port's: moving it is its own change.
 */
import { enforcementActionsOf, enforcementStatusOf, type AnthropicEnforcementStatus } from "@chanlytics/contracts";
import type { EnforcementAction } from "@chanlytics/contracts";
import { answerObject, fetchFromProvider, type ProviderReply, type SendOutcome } from "../shared/provider-fetch";
import type { ModelDeps } from "./anthropic";

const USER_PROFILES_URL = "https://api.anthropic.com/v1/user_profiles";
const USER_PROFILES_VERSION = "2026-10-21";
/** The most a list's page holds: the API's own ceiling. */
const LIST_PAGE_SIZE = 100;
/** One try's bound. A create is awaited by a person or a customer's reply, so it is short; what misses it, the sweep makes. */
const PROFILE_TRY_MS = 3_000;
const LIST_TRY_MS = 8_000;

/** A profile as the platform reads one. `status` is null when the answer did not say (contracts enforcementStatusOf). */
export interface AnthropicProfile {
  id: string;
  referenceId: string | null;
  createdAt: string | null;
  status: AnthropicEnforcementStatus | null;
  actions: EnforcementAction[];
}

function profileFromAnswer(raw: unknown): AnthropicProfile | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!row || typeof row.id !== "string" || !row.id.startsWith("uprof_")) return null;
  const details = row.external_user_details as { reference_id?: unknown } | null | undefined;
  return {
    id: row.id,
    referenceId: typeof details?.reference_id === "string" ? details.reference_id : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    status: enforcementStatusOf(row.enforcement_status),
    actions: enforcementActionsOf(row.enforcement_actions),
  };
}

const profileHeaders = (key: string): Record<string, string> => ({
  "content-type": "application/json",
  "x-api-key": key,
  "anthropic-version": USER_PROFILES_VERSION,
});

const profileFailureWords = (a: ProviderReply): string => a.error ?? `status ${a.status}`;

export type ProfileCreated =
  { outcome: "ok"; profile: AnthropicProfile } | { outcome: Exclude<SendOutcome, "ok">; error: string };

/** One create, one try. An answer we cannot read is `unknown`: a profile may stand behind it. */
export async function createUserProfile(
  key: string,
  details: Record<string, string>,
  deps: ModelDeps = {},
): Promise<ProfileCreated> {
  const response = await fetchFromProvider(
    "anthropic",
    USER_PROFILES_URL,
    {
      method: "POST",
      headers: profileHeaders(key),
      body: JSON.stringify({ external_user_details: details }),
      timeoutMs: PROFILE_TRY_MS,
    },
    deps,
  );
  if (response.outcome !== "ok") return { outcome: response.outcome, error: profileFailureWords(response) };
  const profile = profileFromAnswer(response.json);
  return profile ? { outcome: "ok", profile } : { outcome: "unknown", error: "the answer named no profile" };
}

/** Whether the profile is gone: deleted now, or already (a 404). Anything else is tried again by the next sweep. */
export async function deleteUserProfile(key: string, id: string, deps: ModelDeps = {}): Promise<boolean> {
  const a = await fetchFromProvider(
    "anthropic",
    `${USER_PROFILES_URL}/${encodeURIComponent(id)}`,
    { method: "DELETE", headers: profileHeaders(key), timeoutMs: PROFILE_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  return a.outcome === "ok" || a.status === 404;
}

export type ProfilesPage =
  { ok: true; profiles: AnthropicProfile[]; next: string | null } | { ok: false; error: string };

/** One page of every profile the organization holds, newest first. */
export async function listUserProfiles(key: string, page: string | null, deps: ModelDeps = {}): Promise<ProfilesPage> {
  const query = new URLSearchParams({ limit: String(LIST_PAGE_SIZE), ...(page ? { page } : {}) });
  const response = await fetchFromProvider(
    "anthropic",
    `${USER_PROFILES_URL}?${query}`,
    { method: "GET", headers: profileHeaders(key), timeoutMs: LIST_TRY_MS, idempotent: true, tries: 2 },
    deps,
  );
  const json = response.outcome === "ok" ? answerObject(response) : null;
  if (!json || !Array.isArray(json.data)) return { ok: false, error: profileFailureWords(response) };
  return {
    ok: true,
    profiles: json.data.map(profileFromAnswer).filter((p): p is AnthropicProfile => p !== null),
    next: typeof json.next_page === "string" && json.next_page ? json.next_page : null,
  };
}
