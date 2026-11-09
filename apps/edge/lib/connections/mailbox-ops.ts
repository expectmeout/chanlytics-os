/**
 * POST /api/admin/mailboxes: the mailboxes a business connected to write its reach-outs from (decision 0056). The
 * dashboard's /api/v1/mailbox-connections verbs call it for an owner or a manager: the OAuth clients' secrets, the
 * tokens and the providers' wires live on the edge and nowhere else.
 *
 * The door is api/admin/mailboxes.ts: it reads the body once as text (the token's body hash is checked over those
 * bytes) and asks who is knocking (authorizeAdmin); everything after is here.
 *
 *   { op: "readiness" }                                     → which providers this deployment offers, and their public half
 *   { op: "connect", tenant_id, user_id, provider, code, code_verifier?, mailbox_id? }
 *                                                           → the grant exchanged and checked, the mailbox's row (a
 *                                                             Reconnect's mailbox_id: that mailbox's account or none)
 *   { op: "remove" | "pause" | "unpause" | "resume" | "check" | "test", tenant_id, mailbox_id }
 *   { op: "settings", tenant_id, mailbox_id, from_name?, signature?, signature_off?, daily_cap? }
 *   { op: "bring_in", tenant_id, address }                  → a sender the owner said is a person: their mail of the
 *                                                             mailboxes' six months and since kept in their thread
 *                                                             (imports/mail-history.ts bringInSender), how many
 *   { op: "history_stop" | "history_resume" | "history_bring", tenant_id, mailbox_id }
 *                                                           → its history stopped where it stands, started again where
 *                                                             it stopped, or (connected from now on) its six months
 *                                                             brought in (imports/history-import.ts, decision 0086)
 *   A connect's history ("six_months" | "from_now") is what its owner chose under Connect; a reconnect keeps its own.
 *
 * A row's answer is its page row (channels mailboxDtoOf, its Gmail signature said in words). A connect that did not finish answers its reason
 * (contracts MAILBOX_CONNECT_WORDS says each) beside the code a caller compares.
 */
import { json, refuse } from "../shared/http.js";
import { personFor, workspaceFor, type Admitted } from "../shared/admin-auth.js";
import { pg } from "../shared/pg.js";
import { errField, logger } from "../shared/log.js";
import { findMailboxConnection, listMailboxConnectionsOf, type MailboxConnectionRow } from "@chanlytics/db/email";
import {
  MAILBOX_PROVIDERS,
  UUID,
  normalizeEmail,
  type MailboxProvider,
  TRY_AGAIN_IN_A_MINUTE,
  isOneOf,
  isTenantId,
} from "@chanlytics/contracts";
import { mailboxDtoOf } from "@chanlytics/channels/email";
import { bringInSender } from "../imports/mail-history.js";
import { bringMailboxHistory, resumeMailboxHistory, stopMailboxHistory } from "../imports/history-import.js";
import { getToken } from "../email/mailbox/credentials.js";
import { mailboxReadiness } from "../email/mailbox/config.js";
import {
  checkMailbox,
  runMailboxConnect,
  pauseMailbox,
  removeMailbox,
  resumeMailbox,
  readMailboxSettings,
  testMailbox,
  type ConnectError,
  type MailboxPorts,
} from "./mailbox-connect.js";
import type { TenantId } from "@chanlytics/contracts";

export interface Body {
  op?: unknown;
  tenant_id?: unknown;
  user_id?: unknown;
  mailbox_id?: unknown;
  provider?: unknown;
  code?: unknown;
  /** PKCE's verifier, where the consent was asked with its challenge (Google's). */
  code_verifier?: unknown;
  from_name?: unknown;
  signature?: unknown;
  signature_off?: unknown;
  daily_cap?: unknown;
  address?: unknown;
  /** What its owner chose under Connect (0086). */
  history?: unknown;
}

const OPS = new Set([
  "connect",
  "remove",
  "pause",
  "unpause",
  "resume",
  "settings",
  "test",
  "check",
  "bring_in",
  "history_stop",
  "history_resume",
  "history_bring",
]);

/** A connect that did not finish, as the code a caller compares, with its reason beside it for the owner's words. */
function connectRefused(reason: ConnectError): Response {
  switch (reason) {
    case "not_available":
      return json(503, { ok: false, error: "no_oauth_client", reason: reason });
    case "failed":
      return json(502, { ok: false, error: "exchange_failed", reason: reason });
    case "scopes_missing":
      return json(400, { ok: false, error: "scope_missing", reason: reason });
    case "no_refresh_token":
      return json(400, { ok: false, error: "no_refresh_token", reason: reason });
    case "free_mail":
      return json(400, { ok: false, error: "free_mail", reason: reason });
    // Who the grant is would not do: the code is one, the reason says which (contracts MAILBOX_CONNECT_WORDS).
    case "no_address":
    case "unverified":
    case "not_workspace":
    case "no_mailbox":
    case "wrong_account":
      return json(400, { ok: false, error: "no_account", reason: reason });
    case "taken":
      return json(409, { ok: false, error: "mailbox_taken", reason: reason });
    case "too_many":
      return json(409, { ok: false, error: "too_many", reason: reason });
    case "too_many_on_domain":
      return json(409, { ok: false, error: "too_many_on_domain", reason: reason });
  }
}

const stringOf = (v: unknown): string => (typeof v === "string" ? v : "");

/** A connect: the provider's code exchanged and the grant checked, then the mailbox's row as its page draws it. */
async function connectOp(
  mailboxPorts: MailboxPorts,
  tenantId: TenantId,
  by: string | null,
  body: Partial<Body>,
): Promise<Response> {
  const provider = stringOf(body.provider) as MailboxProvider;
  const code = stringOf(body.code);
  if (!isOneOf(MAILBOX_PROVIDERS, provider) || !code || code.length > 4_096)
    return refuse(400, "bad_request", "provider and code are required");
  // A Reconnect names the mailbox it is for (the dashboard's signed state carried it there and back).
  const reconnecting = stringOf(body.mailbox_id);
  if (reconnecting && !UUID.test(reconnecting)) return refuse(400, "bad_request", "mailbox_id is a mailbox's id");
  const verifier = stringOf(body.code_verifier);
  if (verifier && !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    return refuse(400, "bad_request", "code_verifier is PKCE's verifier");
  const out = await runMailboxConnect(mailboxPorts, {
    tenantId,
    userId: by,
    provider,
    code,
    verifier: verifier || null,
    mailboxId: reconnecting || null,
    history: body.history === "from_now" ? "from_now" : null,
  });
  if (out.ok) {
    const row = await findMailboxConnection(mailboxPorts.db, tenantId, out.id);
    return json(200, { ok: true, made: out.made, mailbox: row ? mailboxDtoOf(row) : null });
  }
  mailboxPorts.log.warn("mailbox_connect_refused", { reason: out.why, detail: out.detail ?? null });
  return connectRefused(out.why);
}

/** What an owner's settings may change: the name it sends as, its signature (null clears it) or none, its daily cap. */
function settingsOf(body: Partial<Body>): {
  from_name?: string;
  signature?: string | null;
  signature_off?: boolean;
  daily_cap?: number;
} {
  return {
    ...(typeof body.from_name === "string" ? { from_name: body.from_name } : {}),
    ...(body.signature === null || typeof body.signature === "string" ? { signature: body.signature } : {}),
    ...(typeof body.signature_off === "boolean" ? { signature_off: body.signature_off } : {}),
    ...(body.daily_cap !== undefined ? { daily_cap: Number(body.daily_cap) } : {}),
  };
}

/** A test email from the mailbox to itself, through the same wire a reach-out's leaves by. */
async function testOp(p: MailboxPorts, row: MailboxConnectionRow): Promise<Response> {
  const out = await testMailbox(p, row, crypto.randomUUID());
  if (out.ok) return json(200, { ok: true, sent: true });
  if (out.why === "signed_out") return refuse(409, "provider_unauthorized", out.detail);
  return out.why === "refused" ? refuse(502, "provider_refused", out.detail) : refuse(503, "unavailable", out.detail);
}

/** An op on one of the workspace's mailboxes: the move, then the row as it stands after it. */
async function rowOp(
  mailboxPorts: MailboxPorts,
  tenantId: TenantId,
  by: string | null,
  op: string,
  body: Partial<Body>,
): Promise<Response> {
  const mailboxId = stringOf(body.mailbox_id);
  const row = UUID.test(mailboxId) ? await findMailboxConnection(mailboxPorts.db, tenantId, mailboxId) : null;
  if (!row || row.state === "removed") return refuse(404, "not_found", "That mailbox isn't this workspace's.");
  // The row as it stands after a move that took: its page row.
  const answer = async () => {
    const now = await findMailboxConnection(mailboxPorts.db, tenantId, row.id);
    return json(200, { ok: true, mailbox: now ? mailboxDtoOf(now) : null });
  };
  switch (op) {
    case "remove":
      await removeMailbox(mailboxPorts, row, by);
      return json(200, { ok: true, removed: true });
    case "pause":
      return (await pauseMailbox(mailboxPorts, row, by ?? "owner", true)) ? answer() : refuse(404, "not_connected");
    case "unpause":
      return (await pauseMailbox(mailboxPorts, row, by ?? "owner", false)) ? answer() : refuse(409, "not_paused");
    case "resume":
      return (await resumeMailbox(mailboxPorts, row, by ?? "owner")) ? answer() : refuse(409, "not_held");
    case "check":
      return (await checkMailbox(mailboxPorts, row)) ? answer() : refuse(503, "unavailable");
    case "history_stop":
      return (await stopMailboxHistory(mailboxPorts.db, row, Date.now()))
        ? answer()
        : refuse(409, "nothing_to_do", "Nothing is coming in from it.");
    case "history_resume":
      return (await resumeMailboxHistory(mailboxPorts.db, row))
        ? answer()
        : refuse(409, "nothing_to_do", "Nothing of it stopped.");
    case "history_bring":
      return (await bringMailboxHistory(mailboxPorts.db, row))
        ? answer()
        : refuse(409, "nothing_to_do", "Its last 6 months are already brought in.");
    case "settings": {
      const out = await readMailboxSettings(mailboxPorts, row, settingsOf(body));
      if ("error" in out) return refuse(400, "invalid", out.error);
      return json(200, { ok: true, mailbox: mailboxDtoOf(out) });
    }
    default:
      return testOp(mailboxPorts, row);
  }
}

/**
 * A sender the owner said is a person, brought in through every mailbox of the workspace that can be read now: one
 * signed out, or whose token is gone, is passed over. Answers how many emails were kept.
 */
async function bringInOp(mailboxPorts: MailboxPorts, tenantId: TenantId, body: Partial<Body>): Promise<Response> {
  const address = normalizeEmail(stringOf(body.address));
  if (!address) return refuse(400, "invalid", "An address is needed.");
  let kept = 0;
  for (const row of await listMailboxConnectionsOf(mailboxPorts.db, tenantId)) {
    if (row.state === "reconnect") continue;
    const t = await getToken(mailboxPorts.db, row, Date.now());
    if (t.ok) kept += await bringInSender({ db: mailboxPorts.db, row, token: t.token, address, log: mailboxPorts.log });
  }
  return json(200, { ok: true, kept });
}

export async function runMailboxesOp(auth: Admitted, body: Partial<Body>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const op = stringOf(body.op);
  if (op === "readiness") return json(200, { ok: true, ...mailboxReadiness() });
  if (!OPS.has(op)) return refuse(400, "unknown_op");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const tenantId = ws.tenantId ?? "";
  if (!isTenantId(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const by = personFor(auth, body.user_id);
  const log = logger({ door: "mailboxes", tenant_id: tenantId, op });
  const mailboxPorts: MailboxPorts = { db, log: log };
  try {
    if (op === "bring_in") return await bringInOp(mailboxPorts, tenantId, body);
    return op === "connect"
      ? await connectOp(mailboxPorts, tenantId, by, body)
      : await rowOp(mailboxPorts, tenantId, by, op, body);
  } catch (e) {
    log.error("mailbox_door_failed", { error: errField(e) });
    return refuse(503, "unavailable", TRY_AGAIN_IN_A_MINUTE);
  }
}
