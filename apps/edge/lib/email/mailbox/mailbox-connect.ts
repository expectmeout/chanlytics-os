/**
 * A mailbox connected, and what its owner does with it (decision 0056). The dashboard's callback proves its signed
 * state and hands the code here (api/admin/mailboxes.ts, op connect); the edge holds the clients' secrets and the
 * tokens, and nothing of them leaves it.
 *
 *   mailboxConnect   the code traded for a grant; a grant without send and read access, without a lasting refresh
 *                    token, or on a free mail domain (gmail.com, outlook.com: not a business writing to businesses)
 *                    is given back and refused by name; the account is named (Google's id token, Graph's /me); its row
 *                    made or found again (00423), its token stored, its domain's records read, its watch made, and the
 *                    event said. A mailbox on the domain the business's own website is on is its customer domain,
 *                    kept to 20 a day (decision 0056, 4); with no website on file, it is taken to be.
 *   mailboxRemove    the grant given back where the provider has a way to, the watch ended, the token dropped, the row
 *                    removed (kept so a send and a report still name it).
 *   mailboxPause, mailboxUnpause, mailboxResume
 *                    its owner's; a Resume lifts a hold and starts the count again, the ramp where it was.
 *   mailboxSettings  the name it sends as, its signature, its owner's cap.
 *   mailboxTest      an email from it to itself, through its own provider: what the owner sees is what a business gets.
 *   mailboxCheck     its domain's records read again.
 */
import {
  MAILBOX_DAILY_CAP_MAX,
  isFreeMail,
  parseTenantConfig,
  siteHost,
  type MailboxProvider,
} from "../../packages/contracts.js";
import {
  buildEmailRequest,
  connectedIdentity,
  graphMe,
  grantScopes,
  grantScopesMissing,
  mailboxRevokeRequest,
  mailboxTokenRequest,
  providerFetch,
  sendFromMailbox,
  unb64url,
} from "../../packages/channels.js";
import {
  connectMailbox,
  dropMailboxCredentials,
  emitEvent,
  patchMailboxConnection,
  workspaceNameAndConfig,
  type Database,
  type MailboxConnectionRow,
} from "../../packages/db.js";
import { mailboxClient } from "./mailbox-config.js";
import { grantOf, storeMailboxCredentials, tokenFor } from "./mailbox-credentials.js";
import { readMailboxDns } from "./mailbox-dns.js";
import { endWatch, keepWatch } from "./mailbox-watch.js";
import { mendWarnings } from "../../ops/notify.js";
import { errField, type Logger } from "../../log.js";
import type { SupabaseClient } from "@supabase/supabase-js";

type Db = SupabaseClient<Database>;

export interface MailboxPorts {
  db: Db;
  log: Logger;
  now?: () => number;
}

/** Why a connect did not finish, by its code (contracts MAILBOX_CONNECT_WORDS says each). */
export type ConnectError =
  | "not_available"
  | "failed"
  | "scopes_missing"
  | "no_refresh_token"
  | "free_mail"
  | "no_address"
  | "taken"
  | "too_many"
  | "too_many_on_domain";

/** An id token's claims, read without verification: it came in the token endpoint's own answer over TLS. */
function claimsOf(idToken: string | null): { email: string | null; sub: string | null; name: string | null } {
  try {
    const payload = (idToken ?? "").split(".")[1];
    if (!payload) return { email: null, sub: null, name: null };
    const c = JSON.parse(new TextDecoder().decode(unb64url(payload))) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    return { email: str(c.email), sub: str(c.sub), name: str(c.name) };
  } catch {
    return { email: null, sub: null, name: null };
  }
}

/** A grant given back is answered at once, or left to lapse with the token Vault no longer holds. */
const REVOKE_MS = 5_000;

/** The grant given back: best effort, where the provider has a way to. */
async function giveBack(provider: MailboxProvider, token: string): Promise<void> {
  const r = mailboxRevokeRequest(provider, token);
  if (!r) return;
  await providerFetch("google", r.url, {
    method: r.method,
    headers: r.headers,
    body: r.body,
    timeoutMs: REVOKE_MS,
  }).catch(() => null);
}

/** Whether a host is the business's own customer domain: its website's, or taken to be when it has none on file. */
async function isCustomerDomain(db: Db, tenantId: string, host: string): Promise<boolean> {
  const w = await workspaceNameAndConfig(db, tenantId).catch(() => null);
  const site = siteHost(parseTenantConfig(w?.config)?.brain?.profile?.website ?? null);
  if (!site) return true;
  const a = site.toLowerCase();
  const b = host.toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

export async function mailboxConnect(
  p: MailboxPorts,
  i: { tenantId: string; userId: string | null; provider: MailboxProvider; code: string },
): Promise<
  { ok: true; id: string; made: boolean; address: string } | { ok: false; why: ConnectError; detail?: string }
> {
  const client = mailboxClient(i.provider);
  if (!client) return { ok: false, why: "not_available" };
  const got = await grantOf(i.provider, mailboxTokenRequest(i.provider, client, i.code));
  if (!got.ok) return { ok: false, why: "failed", detail: got.why.slice(0, 200) };
  const grant = got.grant;
  const missing = grantScopesMissing(i.provider, grant.scope);
  if (missing.length) {
    await giveBack(i.provider, grant.access_token);
    return { ok: false, why: "scopes_missing", detail: missing.join(" ") };
  }
  if (!grant.refresh_token) {
    await giveBack(i.provider, grant.access_token);
    return { ok: false, why: "no_refresh_token" };
  }
  // Who the grant is: Google's id token (openid email profile), Graph's /me.
  let account: string | null;
  let address: string | null;
  let name: string | null;
  if (i.provider === "google") {
    const c = claimsOf(grant.id_token);
    [account, address, name] = [c.sub, c.email, c.name];
  } else {
    const me = await graphMe(grant.access_token);
    [account, address, name] = [me?.id ?? null, me?.address ?? null, me?.name ?? null];
  }
  if (!account || !address) {
    await giveBack(i.provider, grant.refresh_token);
    return { ok: false, why: "no_address" };
  }
  address = address.trim().toLowerCase();
  const host = address.slice(address.lastIndexOf("@") + 1);
  if (isFreeMail(host)) {
    await giveBack(i.provider, grant.refresh_token);
    return { ok: false, why: "free_mail" };
  }
  const made = await connectMailbox(p.db, {
    tenantId: i.tenantId,
    userId: i.userId,
    provider: i.provider,
    account,
    address,
    fromName: name ?? address.split("@")[0] ?? address,
    scopes: grantScopes(grant.scope),
    customerDomain: await isCustomerDomain(p.db, i.tenantId, host),
  });
  if (!made.ok) {
    await giveBack(i.provider, grant.refresh_token);
    return { ok: false, why: made.refused };
  }
  const now = (p.now ?? Date.now)();
  await storeMailboxCredentials(p.db, made.id, {
    refresh_token: grant.refresh_token,
    access_token: grant.access_token,
    expires_at: now + grant.expires_in * 1000,
    scope: grant.scope,
  });
  // Its domain's records and its watch: neither stops a connect that stands; the clock reads both again.
  const dns = await readMailboxDns(host, i.provider).catch(() => null);
  const row = await patchMailboxConnection(p.db, {
    tenantId: i.tenantId,
    id: made.id,
    patch: dns ? { dns, dns_checked_at: new Date(now).toISOString() } : {},
  });
  if (row)
    await keepWatch(p.db, row, grant.access_token, p.log, now).catch((e: unknown) =>
      p.log.warn("mailbox_watch_failed", { mailbox: made.id, error: errField(e) }),
    );
  await emitEvent(p.db, i.tenantId, "mailbox_connection.connected", "mailbox_connection", made.id, {
    address,
    provider: i.provider,
    again: !made.made,
    by: i.userId,
  });
  // Connected again, its sign-out's warning is mended (contracts NOTICE_MENDS).
  if (!made.made) await mendMailbox(p.db, i.tenantId, made.id, "mailbox_connection.connected");
  return { ok: true, id: made.id, made: made.made, address };
}

export async function mailboxRemove(p: MailboxPorts, row: MailboxConnectionRow, by: string | null): Promise<void> {
  const t = await tokenFor(p.db, row).catch(() => null);
  if (t?.ok) {
    await endWatch(row, t.token);
    await giveBack(row.provider === "microsoft" ? "microsoft" : "google", t.token);
  }
  await dropMailboxCredentials(p.db, row.id);
  const now = new Date((p.now ?? Date.now)()).toISOString();
  await patchMailboxConnection(p.db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { state: "removed", removed_at: now, held_why: null, held_at: null, watch_id: null, sync_lease_until: null },
  });
  await emitEvent(p.db, row.tenant_id, "mailbox_connection.removed", "mailbox_connection", row.id, {
    address: row.address,
    by,
  });
  await mendMailbox(p.db, row.tenant_id, row.id, "mailbox_connection.removed");
}

/** A mailbox's held or signed-out warning closed by the change that mends it (contracts NOTICE_MENDS). */
const mendMailbox = (db: MailboxPorts["db"], tenantId: string, id: string, change: string) =>
  mendWarnings(db, { tenantId, by: { change }, subject: { type: "mailbox_connection", id }, keptId: null });

/** Its owner's pause, and its end: only from the states it can be paused or unpaused from. */
export async function mailboxPause(p: MailboxPorts, row: MailboxConnectionRow, by: string, pause: boolean) {
  const moved = await patchMailboxConnection(p.db, {
    tenantId: row.tenant_id,
    id: row.id,
    from: [pause ? "connected" : "paused"],
    patch: { state: pause ? "paused" : "connected" },
  });
  if (moved)
    await emitEvent(
      p.db,
      row.tenant_id,
      pause ? "mailbox_connection.paused" : "mailbox_connection.unpaused",
      "mailbox_connection",
      row.id,
      { address: row.address, by },
    );
  return moved;
}

/** Its owner's Resume of a hold: sending again, the count started again, the ramp where it was. */
export async function mailboxResume(p: MailboxPorts, row: MailboxConnectionRow, by: string) {
  const now = new Date((p.now ?? Date.now)()).toISOString();
  const moved = await patchMailboxConnection(p.db, {
    tenantId: row.tenant_id,
    id: row.id,
    from: ["held"],
    patch: { state: "connected", held_why: null, held_at: null, counted_since: now },
  });
  if (moved) {
    await emitEvent(p.db, row.tenant_id, "mailbox_connection.resumed", "mailbox_connection", row.id, {
      address: row.address,
      why: row.held_why,
      by,
    });
    await mendMailbox(p.db, row.tenant_id, row.id, "mailbox_connection.resumed");
  }
  return moved;
}

/** The name it sends as, its signature and its owner's cap, as the owner set them; each checked. */
export async function mailboxSettings(
  p: MailboxPorts,
  row: MailboxConnectionRow,
  s: { from_name?: string; signature?: string | null; daily_cap?: number },
): Promise<MailboxConnectionRow | { error: "bad_name" | "bad_signature" | "bad_cap" }> {
  const patch: Record<string, unknown> = {};
  if (s.from_name !== undefined) {
    const name = s.from_name.trim();
    if (!name || name.length > 80) return { error: "bad_name" };
    patch.from_name = name;
  }
  if (s.signature !== undefined) {
    const sig = (s.signature ?? "").trim();
    if (sig.length > 1000) return { error: "bad_signature" };
    patch.signature = sig || null;
  }
  if (s.daily_cap !== undefined) {
    if (!Number.isInteger(s.daily_cap) || s.daily_cap < 1 || s.daily_cap > MAILBOX_DAILY_CAP_MAX)
      return { error: "bad_cap" };
    patch.daily_cap = s.daily_cap;
  }
  const moved = await patchMailboxConnection(p.db, { tenantId: row.tenant_id, id: row.id, patch });
  return moved ?? row;
}

/** An email from the mailbox to itself, through its own provider: what the owner sees is what a business gets. */
export async function mailboxTest(
  p: MailboxPorts,
  row: MailboxConnectionRow,
  testId: string,
): Promise<{ ok: true } | { ok: false; why: "signed_out" | "unavailable" | "refused"; detail?: string }> {
  const t = await tokenFor(p.db, row, (p.now ?? Date.now)());
  if (!t.ok) return { ok: false, why: t.why === "signed_out" ? "signed_out" : "unavailable", detail: t.detail };
  const request = buildEmailRequest({
    identity: connectedIdentity(row),
    to: row.address,
    parent: null,
    subject: "A test from Chanlytics",
    body:
      `This is how an email from ${row.address} reads when Chanlytics writes it: plain words, from your own mailbox, ` +
      `with replies coming back here.\n\nNothing else was sent.`,
    signature: row.signature,
    actor: "human",
    messageId: testId,
    tenantId: row.tenant_id,
    plain: true,
  });
  const sent = await sendFromMailbox({
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    token: t.token,
    mailbox: { id: row.id, host: row.host },
    request,
  });
  if (sent.ok) return { ok: true };
  return {
    ok: false,
    why: sent.cause === "signed_out" ? "signed_out" : "refused",
    detail: sent.errorBody?.slice(0, 200),
  };
}

/** Its domain's records read again, now. */
export async function mailboxCheck(p: MailboxPorts, row: MailboxConnectionRow): Promise<MailboxConnectionRow | null> {
  const dns = await readMailboxDns(row.host, row.provider === "microsoft" ? "microsoft" : "google");
  return patchMailboxConnection(p.db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { dns, dns_checked_at: new Date((p.now ?? Date.now)()).toISOString() },
  });
}
