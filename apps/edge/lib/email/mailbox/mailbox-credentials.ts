/**
 * A connected mailbox's token (decision 0056): kept in Vault (00421 put/get_mailbox_credentials), never on a row; a
 * grant read from the provider's token endpoint; and `tokenFor`, the access token each call to the mailbox rides,
 * refreshed before it expires and kept only over the grant it refreshed (a reconnect stored meanwhile stands), as
 * Business Profile's is (google/profile-credentials.ts).
 *
 * A refresh the provider refuses for good (invalid_grant: revoked, the password changed, the account suspended) is the
 * mailbox signed out: `signed_out`, and the caller sets it to reconnect and tells its owner once. A refresh that got no
 * answer is `unavailable`: the mailbox is not touched, and the next try asks again.
 */
import {
  getMailboxCredentials,
  putMailboxCredentials,
  type Database,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import {
  mailboxRefreshRequest,
  parseMailboxGrant,
  providerFetch,
  type MailboxGrant,
  type MailboxRequest,
} from "../../packages/channels.js";
import { MIN_MS, type MailboxProvider } from "../../packages/contracts.js";
import { mailboxClient } from "./mailbox-config.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

/** An access token is refreshed this long before it expires. */
const TOKEN_SLACK_MS = MIN_MS;
/** One token endpoint call's bound. */
const TOKEN_TIMEOUT_MS = 10_000;

// A type, not an interface: a type's known keys are JSON as Vault keeps it, which an interface's never are to tsc.
type StoredMailboxCredentials = {
  refresh_token: string;
  access_token: string | null;
  /** Epoch ms. */
  expires_at: number | null;
  scope: string | null;
};

/** A request to a provider's token endpoint, made: the grant it answered, or the provider's word for why not. */
export async function grantOf(
  provider: MailboxProvider,
  req: MailboxRequest,
): Promise<{ ok: true; grant: MailboxGrant } | { ok: false; why: string; answered: boolean }> {
  const r = await providerFetch(provider === "google" ? "google" : "microsoft", req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    timeoutMs: TOKEN_TIMEOUT_MS,
    tries: 1,
  });
  if (r.outcome === "ok") {
    try {
      return { ok: true, grant: parseMailboxGrant(r.json) };
    } catch (e) {
      return { ok: false, why: e instanceof Error ? e.message : String(e), answered: true };
    }
  }
  const o = (r.json ?? {}) as { error?: unknown; error_description?: unknown };
  const error = typeof o.error === "string" ? o.error : (r.error ?? `status ${r.status}`);
  return { ok: false, why: error, answered: r.status >= 400 && r.status < 500 };
}

export async function storeMailboxCredentials(
  db: Db,
  id: string,
  c: StoredMailboxCredentials,
  ifRefreshToken: string | null = null,
): Promise<"kept" | "changed"> {
  const stored = await putMailboxCredentials(db, { id, secret: c, ifRefreshToken });
  return stored === "stored" ? "kept" : "changed";
}

async function readMailboxCredentials(db: Db, id: string): Promise<StoredMailboxCredentials | null> {
  const c = (await getMailboxCredentials(db, id)) as Partial<StoredMailboxCredentials> | null;
  return c && typeof c.refresh_token === "string"
    ? {
        refresh_token: c.refresh_token,
        access_token: c.access_token ?? null,
        expires_at: typeof c.expires_at === "number" ? c.expires_at : null,
        scope: c.scope ?? null,
      }
    : null;
}

const liveToken = (c: StoredMailboxCredentials | null, now: number): string | null =>
  c?.access_token && c.expires_at && c.expires_at - TOKEN_SLACK_MS > now ? c.access_token : null;

type MailboxToken =
  | { ok: true; token: string }
  | { ok: false; why: "no_client" | "no_credentials" | "signed_out" | "unavailable"; detail?: string };

/** An access token for the mailbox now: the stored one while it lasts, else a fresh one from its refresh token. */
export async function tokenFor(
  db: Db,
  row: Pick<MailboxConnectionRow, "id" | "provider">,
  now = Date.now(),
): Promise<MailboxToken> {
  const provider = row.provider === "microsoft" ? "microsoft" : "google";
  const client = mailboxClient(provider);
  if (!client) return { ok: false, why: "no_client" };
  const creds = await readMailboxCredentials(db, row.id);
  if (!creds) return { ok: false, why: "no_credentials" };
  const stored = liveToken(creds, now);
  if (stored) return { ok: true, token: stored };
  const got = await grantOf(provider, mailboxRefreshRequest(provider, client, creds.refresh_token));
  if (!got.ok)
    return {
      ok: false,
      // The provider answered no for good (RFC 6749's invalid_grant): signed out. Anything else is a moment's.
      why:
        got.answered && /invalid_grant|interaction_required|consent_required/i.test(got.why)
          ? "signed_out"
          : "unavailable",
      detail: got.why.slice(0, 300),
    };
  const kept = await storeMailboxCredentials(
    db,
    row.id,
    {
      // Microsoft may hand back a new refresh token with each refresh: the newest is the one kept.
      refresh_token: got.grant.refresh_token ?? creds.refresh_token,
      access_token: got.grant.access_token,
      expires_at: now + got.grant.expires_in * 1000,
      scope: got.grant.scope || creds.scope,
    },
    creds.refresh_token,
  );
  if (kept === "kept") return { ok: true, token: got.grant.access_token };
  const fresh = liveToken(await readMailboxCredentials(db, row.id), now);
  return fresh ? { ok: true, token: fresh } : { ok: false, why: "unavailable", detail: "reconnected meanwhile" };
}
