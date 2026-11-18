/**
 * A footage account's token (the footage sources plan): kept in Vault (00641 source_credentials_put/get/drop), never
 * on a row; and `getSourceToken`, the hour's access token each call to the provider rides, refreshed before it expires
 * and kept only over the grant it refreshed (a reconnect stored meanwhile stands), as a mailbox's is.
 *
 * A refresh Google refuses for good (invalid_grant: revoked, the password changed, the account suspended) is the
 * account signed out: `signed_out`, and the caller sets it to reconnect. A refresh that got no answer is
 * `unavailable`: nothing is touched, and the next try asks again.
 */
import { parseTokenResponse, tokenRefreshRequest } from "@chanlytics/channels/google";
import { fetchFromProvider } from "@chanlytics/channels/shared";
import { MIN_MS, SECOND_MS, recordOrEmpty } from "@chanlytics/contracts";
import { getSourceCredentials, putSourceCredentials } from "@chanlytics/db/files";
import type { Database } from "@chanlytics/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { driveClient } from "./config.js";

type Db = SupabaseClient<Database>;

/** An access token is refreshed this long before it expires. */
const SOURCE_TOKEN_SLACK_MS = MIN_MS;
/** One token endpoint call's bound. */
const TOKEN_CALL_MS = 10 * SECOND_MS;

// A type, not an interface: a type's known keys are JSON as Vault keeps it, which an interface's never are to tsc.
type StoredSourceCredentials = {
  refresh_token: string;
  access_token: string | null;
  /** Epoch ms. */
  expires_at: number | null;
  scope: string | null;
};

/** The account's token as Vault holds it, or null when it holds none that can be refreshed. */
export async function readSourceCredentials(db: Db, connectionId: string): Promise<StoredSourceCredentials | null> {
  const kept = recordOrEmpty(await getSourceCredentials(db, connectionId));
  if (typeof kept.refresh_token !== "string" || kept.refresh_token === "") return null;
  return {
    refresh_token: kept.refresh_token,
    access_token: typeof kept.access_token === "string" ? kept.access_token : null,
    expires_at: typeof kept.expires_at === "number" ? kept.expires_at : null,
    scope: typeof kept.scope === "string" ? kept.scope : null,
  };
}

const liveSourceToken = (kept: StoredSourceCredentials | null, now: number): string | null =>
  kept?.access_token && kept.expires_at && kept.expires_at - SOURCE_TOKEN_SLACK_MS > now ? kept.access_token : null;

type SourceToken =
  | { ok: true; token: string }
  | { ok: false; reason: "no_client" | "no_credentials" | "signed_out" | "unavailable"; detail: string | null };

/**
 * An access token for the account now: the stored one while it lasts, else a fresh one from its refresh token.
 * `anew` asks for a fresh one whatever is stored: how a key its provider refused is told from a grant that is dead.
 */
export async function getSourceToken(
  db: Db,
  connectionId: string,
  now = Date.now(),
  anew = false,
): Promise<SourceToken> {
  const client = driveClient();
  if (!client) return { ok: false, reason: "no_client", detail: null };
  const kept = await readSourceCredentials(db, connectionId);
  if (!kept) return { ok: false, reason: "no_credentials", detail: null };
  const stored = anew ? null : liveSourceToken(kept, now);
  if (stored) return { ok: true, token: stored };
  const request = tokenRefreshRequest(client, kept.refresh_token);
  const reply = await fetchFromProvider("google", request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    timeoutMs: TOKEN_CALL_MS,
    tries: 1,
  });
  if (reply.outcome !== "ok") {
    const answer = recordOrEmpty(reply.json);
    const refusal = typeof answer.error === "string" ? answer.error : (reply.error ?? `status ${reply.status}`);
    // Google answered no for good (RFC 6749's invalid_grant): signed out. Anything else is a moment's.
    const forGood = reply.status >= 400 && reply.status < 500 && /invalid_grant|admin_policy_enforced/i.test(refusal);
    return { ok: false, reason: forGood ? "signed_out" : "unavailable", detail: refusal.slice(0, 300) };
  }
  let grant: ReturnType<typeof parseTokenResponse>;
  try {
    grant = parseTokenResponse(reply.json);
  } catch (error) {
    return { ok: false, reason: "unavailable", detail: error instanceof Error ? error.message.slice(0, 300) : null };
  }
  const stand = await putSourceCredentials(db, {
    id: connectionId,
    secret: {
      refresh_token: grant.refresh_token ?? kept.refresh_token,
      access_token: grant.access_token,
      expires_at: now + grant.expires_in * SECOND_MS,
      scope: grant.scope || kept.scope,
    },
    ifRefreshToken: kept.refresh_token,
  });
  if (stand === "stored") return { ok: true, token: grant.access_token };
  const fresh = liveSourceToken(await readSourceCredentials(db, connectionId), now);
  return fresh ? { ok: true, token: fresh } : { ok: false, reason: "unavailable", detail: "reconnected meanwhile" };
}
