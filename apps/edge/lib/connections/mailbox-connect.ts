/**
 * A mailbox connected, and what its owner does with it (decision 0056). The dashboard's callback proves its signed
 * state and hands the code here (api/admin/mailboxes.ts, op connect); the edge holds the clients' secrets and the
 * tokens, and nothing of them leaves it.
 *
 *   runMailboxConnect   the code traded for a grant; a grant without send and read access, without a lasting refresh
 *                    token, on a free mail domain (gmail.com, outlook.com: not a business writing to businesses), a
 *                    Google account that is not a verified Workspace one, an account with no mailbox behind it, or on
 *                    a Reconnect another account than the mailbox's own, is given back and refused by name; a token
 *                    Vault will not keep leaves no row saying connected; the account is named (Google's id token, Graph's /me); its row
 *                    made or found again (00423), its token stored, its domain's records read, its watch made, and the
 *                    event said. A mailbox on the domain the business's own website is on is its customer domain,
 *                    kept to 20 a day (decision 0056, 4); with no website on file, it is taken to be.
 *   removeMailbox    the grant given back where the provider has a way to, the watch ended, the token dropped, the row
 *                    removed (kept so a send and a report still name it), and the calendar read through it, where it
 *                    was the workspace's, taken away (decision 0073, R20).
 *   pauseMailbox, mailboxUnpause, resumeMailbox
 *                    its owner's; a Resume lifts a hold and starts the count again, the ramp where it was.
 *   readMailboxSettings  the name it sends as, its signature, its owner's cap.
 *   testMailbox      an email from it to itself, through its own provider: what the owner sees is what a business gets.
 *   checkMailbox     its domain's records read again.
 */
import {
  MAILBOX_DAILY_CAP_MAX,
  isFreeMail,
  parseTenantConfig,
  siteHost,
  type MailboxHistory,
  type MailboxProvider,
} from "@chanlytics/contracts";
import {
  buildEmailRequest,
  connectedIdentity,
  gmailNoMailbox,
  readGmailProfile,
  listGraphInbox,
  readGraphMe,
  graphNoMailbox,
  grantScopes,
  grantScopesMissing,
  mailboxRevokeRequest,
  mailboxSignatureOf,
  mailboxTokenRequest,
  sendFromMailbox,
} from "@chanlytics/channels/email";
import { fetchFromProvider } from "@chanlytics/channels/shared";
import { unb64url } from "@chanlytics/channels/google";
import {
  connectMailbox,
  dropMailboxCredentials,
  findMailboxConnection,
  noteCalendarGrant,
  patchMailboxConnection,
  type MailboxConnectionRow,
} from "@chanlytics/db/email";
import { emitEvent } from "@chanlytics/db/events";
import { findWorkspaceNameAndConfig } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { mailboxClient } from "../email/mailbox/config.js";
import { grantOf, storeMailboxCredentials, getToken } from "../email/mailbox/credentials.js";
import { readMailboxDns } from "../email/mailbox/dns.js";
import { endWatch, keepWatch } from "../email/mailbox/watch.js";
import { keepGmailSignature, readGmailSignatureNow } from "../email/mailbox/signature.js";
import { mendWarnings } from "../shared/alerts/notify.js";
import { startMailboxHistory } from "../imports/history-import.js";
import { errField, type Logger } from "../shared/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TenantId } from "@chanlytics/contracts";

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
  | "unverified"
  | "not_workspace"
  | "no_mailbox"
  | "wrong_account"
  | "taken"
  | "too_many"
  | "too_many_on_domain";

interface Claims {
  email: string | null;
  sub: string | null;
  name: string | null;
  /** Google Workspace's domain: absent for a consumer Google account, whatever its address. */
  hd: string | null;
  verified: boolean;
}

/** An id token's claims, read without verification: it came in the token endpoint's own answer over TLS. */
function claimsOf(idToken: string | null): Claims {
  const none: Claims = { email: null, sub: null, name: null, hd: null, verified: false };
  try {
    const payload = (idToken ?? "").split(".")[1];
    if (!payload) return none;
    const c = JSON.parse(new TextDecoder().decode(unb64url(payload))) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    // Google's samples carry email_verified as a string as often as a boolean.
    const verified = c.email_verified === true || c.email_verified === "true";
    return { email: str(c.email), sub: str(c.sub), name: str(c.name), hd: str(c.hd), verified };
  } catch {
    return none;
  }
}

/**
 * Whether the account has a mailbox to send from, asked once before it is called connected: Gmail's profile (a Google
 * account that is not a Gmail one answers failedPrecondition, which Gmail also says now and then of one that is, so it
 * is asked twice), Graph's inbox (an account with no Exchange mailbox or licence is refused it). A provider that could
 * not be asked is not taken for a no: the connect stands, and the clock reads the mailbox.
 */
async function hasMailbox(provider: MailboxProvider, token: string): Promise<boolean> {
  if (provider === "microsoft") return !graphNoMailbox(await listGraphInbox(token));
  for (let tries = 0; tries < 2; tries++) if (!gmailNoMailbox(await readGmailProfile(token))) return true;
  return false;
}

/** A grant given back is answered at once, or left to lapse with the token Vault no longer holds. */
const REVOKE_MS = 5_000;

/** The grant given back: best effort, where the provider has a way to. */
async function giveBack(provider: MailboxProvider, token: string): Promise<void> {
  const r = mailboxRevokeRequest(provider, token);
  if (!r) return;
  await fetchFromProvider("google", r.url, {
    method: r.method,
    headers: r.headers,
    body: r.body,
    timeoutMs: REVOKE_MS,
  }).catch(() => null);
}

/** Whether a host is the business's own customer domain: its website's, or taken to be when it has none on file. */
async function isCustomerDomain(db: Db, tenantId: TenantId, host: string): Promise<boolean> {
  const w = await findWorkspaceNameAndConfig(db, tenantId).catch(() => null);
  const site = siteHost(parseTenantConfig(w?.config)?.brain?.profile?.website ?? null);
  if (!site) return true;
  const a = site.toLowerCase();
  const b = host.toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Who a grant is: Google's id token (openid email profile), which must be a verified address on a Google Workspace
 * domain (a consumer Google account made with a business address has no Gmail behind it); Graph's /me.
 */
async function identityOf(
  provider: MailboxProvider,
  grant: { id_token: string | null; access_token: string },
): Promise<{ ok: true; account: string; address: string; name: string | null } | { ok: false; why: ConnectError }> {
  if (provider === "google") {
    const c = claimsOf(grant.id_token);
    if (!c.sub || !c.email) return { ok: false, why: "no_address" };
    if (!c.verified) return { ok: false, why: "unverified" };
    if (!c.hd) return { ok: false, why: isFreeMail(hostOf(c.email)) ? "free_mail" : "not_workspace" };
    return { ok: true, account: c.sub, address: c.email, name: c.name };
  }
  const me = await readGraphMe(grant.access_token);
  if (!me?.id || !me.address) return { ok: false, why: "no_address" };
  return { ok: true, account: me.id, address: me.address, name: me.name };
}

const hostOf = (address: string): string => address.slice(address.lastIndexOf("@") + 1).toLowerCase();

export async function runMailboxConnect(
  mailboxPorts: MailboxPorts,
  input: {
    tenantId: TenantId;
    userId: string | null;
    provider: MailboxProvider;
    code: string;
    /** PKCE's verifier, where the consent was asked with its challenge (Google's). */
    verifier?: string | null;
    /** The mailbox a Reconnect is for: the account that comes back must be that one. */
    mailboxId?: string | null;
    /** What its owner chose under Connect (0086): kept on a new mailbox; a reconnect keeps what it was. */
    history?: MailboxHistory | null;
  },
): Promise<
  { ok: true; id: string; made: boolean; address: string } | { ok: false; why: ConnectError; detail?: string }
> {
  const client = mailboxClient(input.provider);
  if (!client) return { ok: false, why: "not_available" };
  const result = await grantOf(input.provider, mailboxTokenRequest(input.provider, client, input.code, input.verifier));
  if (!result.ok) return { ok: false, why: "failed", detail: result.why.slice(0, 200) };
  const grant = result.grant;
  const missing = grantScopesMissing(input.provider, grant.scope);
  if (missing.length) {
    await giveBack(input.provider, grant.access_token);
    return { ok: false, why: "scopes_missing", detail: missing.join(" ") };
  }
  if (!grant.refresh_token) {
    await giveBack(input.provider, grant.access_token);
    return { ok: false, why: "no_refresh_token" };
  }
  const refused = async (reason: ConnectError) => {
    await giveBack(input.provider, grant.refresh_token ?? grant.access_token);
    return { ok: false as const, why: reason };
  };
  const identity = await identityOf(input.provider, grant);
  if (!identity.ok) return refused(identity.why);
  const { account, name } = identity;
  const address = identity.address.trim().toLowerCase();
  const host = hostOf(address);
  if (isFreeMail(host)) return refused("free_mail");
  // A Reconnect is for one mailbox: another account signed in connects nothing, and the one signed out stays to fix.
  if (input.mailboxId) {
    const was = await findMailboxConnection(mailboxPorts.db, input.tenantId, input.mailboxId);
    if (was && (was.provider !== input.provider || was.provider_account !== account)) return refused("wrong_account");
  }
  if (!(await hasMailbox(input.provider, grant.access_token))) return refused("no_mailbox");
  const created = await connectMailbox(mailboxPorts.db, {
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    account,
    address,
    fromName: name ?? address.split("@")[0] ?? address,
    scopes: grantScopes(grant.scope),
    customerDomain: await isCustomerDomain(mailboxPorts.db, input.tenantId, host),
  });
  if (!created.ok) return refused(created.refused);
  const now = (mailboxPorts.now ?? Date.now)();
  try {
    await storeMailboxCredentials(mailboxPorts.db, created.id, {
      refresh_token: grant.refresh_token,
      access_token: grant.access_token,
      expires_at: now + grant.expires_in * 1000,
      scope: grant.scope,
    });
  } catch (error) {
    // A row with no token would say connected and send nothing: a new one goes, one connected again waits to be.
    mailboxPorts.log.error("mailbox_door_failed", { mailbox: created.id, stage: "store", error: errField(error) });
    const at = new Date(now).toISOString();
    await patchMailboxConnection(mailboxPorts.db, {
      tenantId: input.tenantId,
      id: created.id,
      patch: created.made
        ? { state: "removed", removed_at: at, held_why: null, held_at: null }
        : {
            state: "reconnect",
            held_why: null,
            held_at: null,
            last_error: "Its sign-in wasn't kept: connect it again.",
            last_error_at: at,
          },
    }).catch((cleanup: unknown) =>
      mailboxPorts.log.error("mailbox_door_failed", {
        mailbox: created.id,
        stage: "store_cleanup",
        error: errField(cleanup),
      }),
    );
    return refused("failed");
  }
  // Its domain's records and its watch: neither stops a connect that stands; the clock reads both again. A new mailbox
  // keeps what its owner chose of its history.
  const dns = await readMailboxDns(host, input.provider).catch(() => null);
  const history: MailboxHistory = input.history === "from_now" ? "from_now" : "six_months";
  const row = await patchMailboxConnection(mailboxPorts.db, {
    tenantId: input.tenantId,
    id: created.id,
    patch: {
      ...(dns ? { dns, dns_checked_at: new Date(now).toISOString() } : {}),
      ...(created.made ? { history } : {}),
    },
  });
  if (row)
    await keepWatch(mailboxPorts.db, row, grant.access_token, mailboxPorts.log, now).catch((e: unknown) =>
      mailboxPorts.log.warn("mailbox_watch_failed", { mailbox: created.id, error: errField(e) }),
    );
  // The signature its owner keeps in Gmail, which every email it sends carries (00487); the sweep reads it daily.
  if (row)
    await keepGmailSignature(mailboxPorts.db, row, grant.access_token, mailboxPorts.log, now).catch((e: unknown) =>
      mailboxPorts.log.warn("mailbox_signature_unread", { mailbox: created.id, error: errField(e) }),
    );
  await emitEvent(mailboxPorts.db, input.tenantId, "mailbox_connection.connected", "mailbox_connection", created.id, {
    address,
    provider: input.provider,
    again: !created.made,
    by: input.userId,
  });
  // Connected again, its sign-out's warning is mended (contracts NOTICE_MENDS).
  if (!created.made) await mendMailbox(mailboxPorts.db, input.tenantId, created.id, "mailbox_connection.connected");
  // What it brings beside its mail (decision 0073, R19, R20): its six months unless its owner chose from now on (0086),
  // its people and its calendar, while the owner goes on; a reconnect starts again what stopped.
  await startMailboxHistory(mailboxPorts.db, {
    tenantId: input.tenantId,
    mailboxId: created.id,
    provider: input.provider,
    scopes: grantScopes(grant.scope),
    first: created.made,
    history,
    by: input.userId,
    log: mailboxPorts.log,
  });
  return { ok: true, id: created.id, made: created.made, address };
}

export async function removeMailbox(
  mailboxPorts: MailboxPorts,
  row: MailboxConnectionRow,
  by: string | null,
): Promise<void> {
  const result = await getToken(mailboxPorts.db, row).catch(() => null);
  if (result?.ok) {
    await endWatch(row, result.token);
    await giveBack(row.provider === "microsoft" ? "microsoft" : "google", result.token);
  }
  await dropMailboxCredentials(mailboxPorts.db, row.id);
  const now = new Date((mailboxPorts.now ?? Date.now)()).toISOString();
  await patchMailboxConnection(mailboxPorts.db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { state: "removed", removed_at: now, held_why: null, held_at: null, watch_id: null, sync_lease_until: null },
  });
  await emitEvent(mailboxPorts.db, row.tenant_id, "mailbox_connection.removed", "mailbox_connection", row.id, {
    address: row.address,
    by,
  });
  await mendMailbox(mailboxPorts.db, row.tenant_id, row.id, "mailbox_connection.removed");
  // Its calendar, where the workspace read it, goes with it: the link, if one is set, is read again.
  await noteCalendarGrant(mailboxPorts.db, {
    tenantId: row.tenant_id,
    mailboxId: row.id,
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    on: false,
    by,
  }).catch((e: unknown) =>
    mailboxPorts.log.error("mailbox_door_failed", { mailbox: row.id, stage: "calendar", error: errField(e) }),
  );
}

/** A mailbox's held or signed-out warning closed by the change that mends it (contracts NOTICE_MENDS). */
const mendMailbox = (db: MailboxPorts["db"], tenantId: TenantId, id: string, change: string) =>
  mendWarnings(db, { tenantId, by: { change }, subject: { type: "mailbox_connection", id }, keptId: null });

/** Its owner's pause, and its end: only from the states it can be paused or unpaused from. */
export async function pauseMailbox(mailboxPorts: MailboxPorts, row: MailboxConnectionRow, by: string, pause: boolean) {
  const moved = await patchMailboxConnection(mailboxPorts.db, {
    tenantId: row.tenant_id,
    id: row.id,
    from: [pause ? "connected" : "paused"],
    patch: { state: pause ? "paused" : "connected" },
  });
  if (moved)
    await emitEvent(
      mailboxPorts.db,
      row.tenant_id,
      pause ? "mailbox_connection.paused" : "mailbox_connection.unpaused",
      "mailbox_connection",
      row.id,
      { address: row.address, by },
    );
  return moved;
}

/** Its owner's Resume of a hold: sending again, the count started again, the ramp where it was. */
export async function resumeMailbox(mailboxPorts: MailboxPorts, row: MailboxConnectionRow, by: string) {
  const now = new Date((mailboxPorts.now ?? Date.now)()).toISOString();
  const moved = await patchMailboxConnection(mailboxPorts.db, {
    tenantId: row.tenant_id,
    id: row.id,
    from: ["held"],
    patch: { state: "connected", held_why: null, held_at: null, counted_since: now },
  });
  if (moved) {
    await emitEvent(mailboxPorts.db, row.tenant_id, "mailbox_connection.resumed", "mailbox_connection", row.id, {
      address: row.address,
      why: row.held_why,
      by,
    });
    await mendMailbox(mailboxPorts.db, row.tenant_id, row.id, "mailbox_connection.resumed");
  }
  return moved;
}

/**
 * The name it sends as, what it signs with and its owner's cap, as the owner set them; each checked. What it signs with
 * is their own words (`signature`), none (`signature_off`), or, with neither, the signature they keep in Gmail, which is
 * read again at once as they choose it (00487).
 */
export async function readMailboxSettings(
  mailboxPorts: MailboxPorts,
  row: MailboxConnectionRow,
  state: { from_name?: string; signature?: string | null; signature_off?: boolean; daily_cap?: number },
): Promise<MailboxConnectionRow | { error: "bad_name" | "bad_signature" | "bad_cap" }> {
  const patch: Record<string, unknown> = {};
  if (state.from_name !== undefined) {
    const name = state.from_name.trim();
    if (!name || name.length > 80) return { error: "bad_name" };
    patch.from_name = name;
  }
  if (state.signature !== undefined) {
    const sig = (state.signature ?? "").trim();
    if (sig.length > 1000) return { error: "bad_signature" };
    patch.signature = sig || null;
  }
  if (state.signature_off !== undefined) patch.signature_off = state.signature_off;
  if (state.daily_cap !== undefined) {
    if (!Number.isInteger(state.daily_cap) || state.daily_cap < 1 || state.daily_cap > MAILBOX_DAILY_CAP_MAX)
      return { error: "bad_cap" };
    patch.daily_cap = state.daily_cap;
  }
  const moved = (await patchMailboxConnection(mailboxPorts.db, { tenantId: row.tenant_id, id: row.id, patch })) ?? row;
  const chose = state.signature !== undefined || state.signature_off !== undefined;
  return chose && !moved.signature && !moved.signature_off
    ? readGmailSignatureNow(mailboxPorts.db, moved, mailboxPorts.log, (mailboxPorts.now ?? Date.now)())
    : moved;
}

/** An email from the mailbox to itself, through its own provider: what the owner sees is what a business gets. */
export async function testMailbox(
  mailboxPorts: MailboxPorts,
  row: MailboxConnectionRow,
  testId: string,
): Promise<{ ok: true } | { ok: false; why: "signed_out" | "unavailable" | "refused"; detail?: string }> {
  const token = await getToken(mailboxPorts.db, row, (mailboxPorts.now ?? Date.now)());
  if (!token.ok)
    return { ok: false, why: token.why === "signed_out" ? "signed_out" : "unavailable", detail: token.detail };
  const request = buildEmailRequest({
    identity: connectedIdentity(row),
    to: row.address,
    parent: null,
    subject: "A test from Chanlytics",
    body:
      `This is how an email from ${row.address} reads when Chanlytics writes it: plain words, from your own mailbox, ` +
      `with replies coming back here.\n\nNothing else was sent.`,
    // What every email it sends carries (00487): the test shows it as a business will read it.
    signature: mailboxSignatureOf(row)?.text ?? null,
    actor: "human",
    messageId: testId,
    tenantId: row.tenant_id,
    plain: true,
  });
  const sent = await sendFromMailbox({
    provider: row.provider === "microsoft" ? "microsoft" : "google",
    token: token.token,
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
export async function checkMailbox(
  mailboxPorts: MailboxPorts,
  row: MailboxConnectionRow,
): Promise<MailboxConnectionRow | null> {
  const dns = await readMailboxDns(row.host, row.provider === "microsoft" ? "microsoft" : "google");
  return patchMailboxConnection(mailboxPorts.db, {
    tenantId: row.tenant_id,
    id: row.id,
    patch: { dns, dns_checked_at: new Date((mailboxPorts.now ?? Date.now)()).toISOString() },
  });
}
