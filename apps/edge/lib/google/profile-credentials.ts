/**
 * The Business Profile's credentials: the refresh and access tokens kept in
 * Vault, never on a row; a grant read from Google's token endpoint; and
 * `tokenFor`, the access token each call to the profile rides, refreshed
 * before it expires. The connection that first stores them is
 * profile-connection.ts.
 */
import type { Json } from "../packages/db.js";
import {
  type tokenExchangeRequest,
  tokenRefreshRequest,
  parseTokenResponse,
  type PlacesHttp,
  type TokenGrant,
} from "../packages/channels.js";
import { MIN_MS, type EdgeRefusal } from "../packages/contracts.js";
import { profileClient } from "./google-config.js";
import { http } from "./places.js";
import type { Db } from "./google-rows.js";

/** An access token is refreshed this long before it expires. */
const TOKEN_SLACK_MS = MIN_MS;

/* ---------------------------------------------------------- the profile */

interface StoredCredentials {
  refresh_token: string;
  access_token: string | null;
  /** Epoch ms. */
  expires_at: number | null;
  scope: string | null;
}

/** put_google_credentials' refusal of a compare-and-set (00363): the token stored is no longer the one named. */
const TOKEN_CHANGED = "40001";
/** PostgREST's word for a function it cannot find by the arguments named: a database before 00363 takes no third. */
const NO_SUCH_FUNCTION = "PGRST202";

/**
 * The token, kept in Vault. A connect writes it whatever is there; a refresh names the refresh token it read
 * (`ifRefreshToken`), and the write is made only while the stored token still carries it: "changed" when a reconnect
 * stored new credentials since, which then stand. A database before 00363 cannot compare, and is written as it always
 * was.
 */
async function storeCredentials(
  db: Db,
  tenantId: string,
  c: StoredCredentials,
  ifRefreshToken: string | null = null,
): Promise<"kept" | "changed"> {
  const put = (cas: boolean) =>
    db.rpc("put_google_credentials", {
      p_tenant_id: tenantId,
      p_secret: c as unknown as Json,
      ...(cas && ifRefreshToken ? { p_if_refresh_token: ifRefreshToken } : {}),
    });
  let { error } = await put(true);
  if (error?.code === NO_SUCH_FUNCTION && ifRefreshToken) ({ error } = await put(false));
  if (error?.code === TOKEN_CHANGED && ifRefreshToken) return "changed";
  if (error) throw new Error(`credentials: ${error.message}`);
  return "kept";
}

async function readCredentials(db: Db, tenantId: string): Promise<StoredCredentials | null> {
  const { data, error } = await db.rpc("get_google_credentials", { p_tenant_id: tenantId });
  if (error) throw new Error(`credentials: ${error.message}`);
  const c = data as Partial<StoredCredentials> | null;
  return c && typeof c.refresh_token === "string"
    ? {
        refresh_token: c.refresh_token,
        access_token: c.access_token ?? null,
        expires_at: typeof c.expires_at === "number" ? c.expires_at : null,
        scope: c.scope ?? null,
      }
    : null;
}

async function grantFrom(req: ReturnType<typeof tokenExchangeRequest>, net: PlacesHttp = http): Promise<TokenGrant> {
  const r = await net(req);
  let json: unknown = null;
  try {
    json = JSON.parse(r.body);
  } catch {
    /* below */
  }
  if (r.status < 200 || r.status >= 300) {
    const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    throw new Error(
      typeof o.error === "string"
        ? `${o.error}${typeof o.error_description === "string" ? `: ${o.error_description}` : ""}`
        : `Google answered ${r.status}`,
    );
  }
  return parseTokenResponse(json);
}

/** The stored access token, while it lasts. */
const liveToken = (creds: StoredCredentials | null, now: number): string | null =>
  creds?.access_token && creds.expires_at && creds.expires_at - TOKEN_SLACK_MS > now ? creds.access_token : null;

/**
 * An access token for the workspace's profile: the stored one while it
 * lasts, else a fresh one from the refresh token, kept for next time. A
 * refresh Google refused is `no_token`, with Google's words in `detail`.
 *
 * The refresh is kept only over the grant it refreshed. An owner who
 * reconnects while it is at Google stores new credentials, perhaps another
 * account's; writing the old refresh token back over them undid the
 * reconnect. Their credentials stand, and their token is the one answered.
 */
async function tokenFor(
  db: Db,
  tenantId: string,
  now = Date.now(),
  net: PlacesHttp = http,
): Promise<{ ok: true; token: string } | EdgeRefusal> {
  const client = profileClient();
  if (!client) return { ok: false, error: "no_oauth_client" };
  const creds = await readCredentials(db, tenantId);
  if (!creds) return { ok: false, error: "no_credentials" };
  const stored = liveToken(creds, now);
  if (stored) return { ok: true, token: stored };
  try {
    const grant = await grantFrom(tokenRefreshRequest(client, creds.refresh_token), net);
    const kept = await storeCredentials(
      db,
      tenantId,
      {
        refresh_token: creds.refresh_token,
        access_token: grant.access_token,
        expires_at: now + grant.expires_in * 1000,
        scope: grant.scope || creds.scope,
      },
      creds.refresh_token,
    );
    if (kept === "kept") return { ok: true, token: grant.access_token };
    const fresh = liveToken(await readCredentials(db, tenantId), now);
    return fresh
      ? { ok: true, token: fresh }
      : { ok: false, error: "no_token", detail: "the connection changed while its token was refreshed" };
  } catch (e) {
    return { ok: false, error: "no_token", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}

export { storeCredentials, readCredentials, grantFrom, tokenFor };
