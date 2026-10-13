/**
 * POST /api/admin/mailboxes: the mailboxes a business connected to write its reach-outs from (decision 0056). The
 * dashboard's /api/v1/mailbox-connections verbs call it for an owner or a manager: the OAuth clients' secrets, the
 * tokens and the providers' wires live on the edge and nowhere else.
 *
 * The door is api/admin/mailboxes.ts: it reads the body once as text (the token's body hash is checked over those
 * bytes) and asks who is knocking (authorizeAdmin); everything after is here.
 *
 *   { op: "readiness" }                                     → which providers this deployment offers, and their public half
 *   { op: "connect", tenant_id, user_id, provider, code }   → the grant exchanged and checked, the mailbox's row
 *   { op: "remove" | "pause" | "unpause" | "resume" | "check" | "test", tenant_id, mailbox_id }
 *   { op: "settings", tenant_id, mailbox_id, from_name?, signature?, daily_cap? }
 *
 * A row's answer is its page row (contracts mailboxConnectionDtoOf). A connect that did not finish answers its reason
 * (contracts MAILBOX_CONNECT_WORDS says each) beside the code a caller compares.
 */
import { json, refuse } from "../../http.js";
import { personFor, workspaceFor, type Admitted } from "../../admin-auth.js";
import { pg } from "../../pg.js";
import { errField, logger } from "../../log.js";
import { mailboxConnectionOf, type MailboxConnectionRow } from "../../packages/db.js";
import { MAILBOX_PROVIDERS, UUID, mailboxConnectionDtoOf, type MailboxProvider } from "../../packages/contracts.js";
import { mailboxReadiness } from "./mailbox-config.js";
import {
  mailboxCheck,
  mailboxConnect,
  mailboxPause,
  mailboxRemove,
  mailboxResume,
  mailboxSettings,
  mailboxTest,
  type ConnectError,
  type MailboxPorts,
} from "./mailbox-connect.js";

export interface Body {
  op?: unknown;
  tenant_id?: unknown;
  user_id?: unknown;
  mailbox_id?: unknown;
  provider?: unknown;
  code?: unknown;
  from_name?: unknown;
  signature?: unknown;
  daily_cap?: unknown;
}

const OPS = new Set(["connect", "remove", "pause", "unpause", "resume", "settings", "test", "check"]);

/** A connect that did not finish, as the code a caller compares, with its reason beside it for the owner's words. */
function connectRefused(why: ConnectError): Response {
  switch (why) {
    case "not_available":
      return json(503, { ok: false, error: "no_oauth_client", reason: why });
    case "failed":
      return json(502, { ok: false, error: "exchange_failed", reason: why });
    case "scopes_missing":
      return json(400, { ok: false, error: "scope_missing", reason: why });
    case "no_refresh_token":
      return json(400, { ok: false, error: "no_refresh_token", reason: why });
    case "free_mail":
      return json(400, { ok: false, error: "free_mail", reason: why });
    case "no_address":
      return json(400, { ok: false, error: "no_account", reason: why });
    case "taken":
      return json(409, { ok: false, error: "mailbox_taken", reason: why });
    case "too_many":
      return json(409, { ok: false, error: "too_many", reason: why });
    case "too_many_on_domain":
      return json(409, { ok: false, error: "too_many_on_domain", reason: why });
  }
}

const stringOf = (v: unknown): string => (typeof v === "string" ? v : "");

/** A connect: the provider's code exchanged and the grant checked, then the mailbox's row as its page draws it. */
async function connectOp(p: MailboxPorts, tenantId: string, by: string | null, body: Partial<Body>): Promise<Response> {
  const provider = stringOf(body.provider) as MailboxProvider;
  const code = stringOf(body.code);
  if (!(MAILBOX_PROVIDERS as readonly string[]).includes(provider) || !code || code.length > 4_096)
    return refuse(400, "bad_request", "provider and code are required");
  const out = await mailboxConnect(p, { tenantId, userId: by, provider, code });
  if (out.ok) {
    const row = await mailboxConnectionOf(p.db, tenantId, out.id);
    return json(200, { ok: true, made: out.made, mailbox: row ? mailboxConnectionDtoOf(row) : null });
  }
  p.log.warn("mailbox_connect_refused", { reason: out.why, detail: out.detail ?? null });
  return connectRefused(out.why);
}

/** What an owner's settings may change: the name it sends as, its signature (null clears it), its daily cap. */
function settingsOf(body: Partial<Body>): { from_name?: string; signature?: string | null; daily_cap?: number } {
  return {
    ...(typeof body.from_name === "string" ? { from_name: body.from_name } : {}),
    ...(body.signature === null || typeof body.signature === "string" ? { signature: body.signature } : {}),
    ...(body.daily_cap !== undefined ? { daily_cap: Number(body.daily_cap) } : {}),
  };
}

/** A test email from the mailbox to itself, through the same wire a reach-out's leaves by. */
async function testOp(p: MailboxPorts, row: MailboxConnectionRow): Promise<Response> {
  const out = await mailboxTest(p, row, crypto.randomUUID());
  if (out.ok) return json(200, { ok: true, sent: true });
  if (out.why === "signed_out") return refuse(409, "provider_unauthorized", out.detail);
  return out.why === "refused" ? refuse(502, "provider_refused", out.detail) : refuse(502, "unavailable", out.detail);
}

/** An op on one of the workspace's mailboxes: the move, then the row as it stands after it. */
async function rowOp(
  p: MailboxPorts,
  tenantId: string,
  by: string | null,
  op: string,
  body: Partial<Body>,
): Promise<Response> {
  const mailboxId = stringOf(body.mailbox_id);
  const row = UUID.test(mailboxId) ? await mailboxConnectionOf(p.db, tenantId, mailboxId) : null;
  if (!row || row.state === "removed") return refuse(404, "not_found", "That mailbox isn't this workspace's.");
  // The row as it stands after a move that took: its page row.
  const answer = async () => {
    const now = await mailboxConnectionOf(p.db, tenantId, row.id);
    return json(200, { ok: true, mailbox: now ? mailboxConnectionDtoOf(now) : null });
  };
  switch (op) {
    case "remove":
      await mailboxRemove(p, row, by);
      return json(200, { ok: true, removed: true });
    case "pause":
      return (await mailboxPause(p, row, by ?? "owner", true)) ? answer() : refuse(409, "not_connected");
    case "unpause":
      return (await mailboxPause(p, row, by ?? "owner", false)) ? answer() : refuse(409, "not_paused");
    case "resume":
      return (await mailboxResume(p, row, by ?? "owner")) ? answer() : refuse(409, "not_held");
    case "check":
      return (await mailboxCheck(p, row)) ? answer() : refuse(503, "unavailable");
    case "settings": {
      const out = await mailboxSettings(p, row, settingsOf(body));
      if ("error" in out) return refuse(400, "invalid", out.error);
      return json(200, { ok: true, mailbox: mailboxConnectionDtoOf(out) });
    }
    default:
      return testOp(p, row);
  }
}

export async function mailboxesOp(auth: Admitted, body: Partial<Body>): Promise<Response> {
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const op = stringOf(body.op);
  if (op === "readiness") return json(200, { ok: true, ...mailboxReadiness() });
  if (!OPS.has(op)) return refuse(400, "unknown_op");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");
  const by = personFor(auth, body.user_id);
  const L = logger({ door: "mailboxes", tenant_id: tenantId, op });
  const p: MailboxPorts = { db, log: L };
  try {
    return op === "connect" ? await connectOp(p, tenantId, by, body) : await rowOp(p, tenantId, by, op, body);
  } catch (e) {
    L.error("mailbox_door_failed", { error: errField(e) });
    return refuse(503, "unavailable", "That didn't go through. Try again in a minute.");
  }
}
