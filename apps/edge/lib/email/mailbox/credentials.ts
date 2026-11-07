/**
 * A connected mailbox's token (decision 0056): kept in Vault (00423 put/get_mailbox_credentials), never on a row; a
 * grant read from the provider's token endpoint; and `tokenFor`, the access token each call to the mailbox rides,
 * refreshed before it expires and kept only over the grant it refreshed (a reconnect stored meanwhile stands), as
 * Business Profile's is (shared/google/credentials.ts).
 *
 * A refresh the provider refuses for good (invalid_grant: revoked, the password changed, the account suspended) is the
 * mailbox signed out: `signed_out`, and the caller sets it to reconnect and tells its owner once. A refresh that got no
 * answer is `unavailable`: the mailbox is not touched, and the next try asks again.
 */
import { getMailboxCredentials, putMailboxCredentials, type MailboxConnectionRow } from "@chanlytics/db/email";
import { type Database } from "@chanlytics/db/types";
import {
  mailboxRefreshRequest,
  parseMailboxGrant,
  type MailboxGrant,
  type MailboxRequest,
} from "@chanlytics/channels/email";
import { fetchFromProvider } from "@chanlytics/channels/shared";
import { MIN_MS, type MailboxProvider } from "@chanlytics/contracts";
import { mailboxClient } from "./config.js";
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
  const item = await fetchFromProvider(provider === "google" ? "google" : "microsoft", req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    timeoutMs: TOKEN_TIMEOUT_MS,
    tries: 1,
  });
  if (item.outcome === "ok") {
    try {
      return { ok: true, grant: parseMailboxGrant(item.json) };
    } catch (e) {
      return { ok: false, why: e instanceof Error ? e.message : String(e), answered: true };
    }
  }
  const json = (item.json ?? {}) as { error?: unknown; error_description?: unknown };
  const error = typeof json.error === "string" ? json.error : (item.error ?? `status ${item.status}`);
  return { ok: false, why: error, answered: item.status >= 400 && item.status < 500 };
}

export async function storeMailboxCredentials(
  db: Db,
  id: string,
  mailboxCredentials: StoredMailboxCredentials,
  ifRefreshToken: string | null = null,
): Promise<"kept" | "changed"> {
  const stored = await putMailboxCredentials(db, { id, secret: mailboxCredentials, ifRefreshToken });
  return stored === "stored" ? "kept" : "changed";
}

async function readMailboxCredentials(db: Db, id: string): Promise<StoredMailboxCredentials | null> {
  const mailboxCredentials = (await getMailboxCredentials(db, id)) as Partial<StoredMailboxCredentials> | null;
  return mailboxCredentials && typeof mailboxCredentials.refresh_token === "string"
    ? {
        refresh_token: mailboxCredentials.refresh_token,
        access_token: mailboxCredentials.access_token ?? null,
        expires_at: typeof mailboxCredentials.expires_at === "number" ? mailboxCredentials.expires_at : null,
        scope: mailboxCredentials.scope ?? null,
      }
    : null;
}

const liveToken = (c: StoredMailboxCredentials | null, now: number): string | null =>
  c?.access_token && c.expires_at && c.expires_at - TOKEN_SLACK_MS > now ? c.access_token : null;

type MailboxToken =
  | { ok: true; token: string }
  | { ok: false; why: "no_client" | "no_credentials" | "signed_out" | "unavailable"; detail?: string };

/** An access token for the mailbox now: the stored one while it lasts, else a fresh one from its refresh token. */
export async function getToken(
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
  const result = await grantOf(provider, mailboxRefreshRequest(provider, client, creds.refresh_token));
  if (!result.ok)
    return {
      ok: false,
      // The provider answered no for good (RFC 6749's invalid_grant): signed out. Anything else is a moment's.
      why:
        result.answered && /invalid_grant|interaction_required|consent_required/i.test(result.why)
          ? "signed_out"
          : "unavailable",
      detail: result.why.slice(0, 300),
    };
  const kept = await storeMailboxCredentials(
    db,
    row.id,
    {
      // Microsoft may hand back a new refresh token with each refresh: the newest is the one kept.
      refresh_token: result.grant.refresh_token ?? creds.refresh_token,
      access_token: result.grant.access_token,
      expires_at: now + result.grant.expires_in * 1000,
      scope: result.grant.scope || creds.scope,
    },
    creds.refresh_token,
  );
  if (kept === "kept") return { ok: true, token: result.grant.access_token };
  const fresh = liveToken(await readMailboxCredentials(db, row.id), now);
  return fresh ? { ok: true, token: fresh } : { ok: false, why: "unavailable", detail: "reconnected meanwhile" };
}
