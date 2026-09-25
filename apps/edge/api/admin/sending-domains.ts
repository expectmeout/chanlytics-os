/**
 * POST /api/admin/sending-domains — a workspace's own domains for cold email (Reach out, Part 2). The dashboard's
 * /api/v1/sending-domains verbs call it for an owner; the cold mail account's key lives here and nowhere else.
 *
 *   { op: "status" }                                        → may this deployment add domains at all
 *   { op: "add", tenant_id, host, from_local, from_name }   → held for the workspace, created at the provider
 *   { op: "check", tenant_id, domain_id }                   → the provider asked to look again, and read now
 *   { op: "remove", tenant_id, domain_id }                  → gone at the provider, then the row
 *   { op: "resume", tenant_id, domain_id }                  → a reputation hold lifted by the owner, 30 a day again
 *
 * What each answer means is lib/email/sending-domains.ts's; this file is the door: who may knock, which workspace,
 * and what the body names.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { logger } from "../../lib/log.js";
import { env } from "../../lib/env.js";
import { sendingDomainOf } from "../../lib/packages/db.js";
import { dkimPublished, readDmarc } from "../../lib/email/dmarc.js";
import { pageOperator } from "../../lib/ops/page-operator.js";
import {
  addSendingDomain,
  checkSendingDomain,
  domainDto,
  removeSendingDomain,
  resumeSendingDomain,
  type DomainPorts,
} from "../../lib/email/sending-domains.js";

interface Body {
  op?: unknown;
  tenant_id?: unknown;
  user_id?: unknown;
  domain_id?: unknown;
  host?: unknown;
  from_local?: unknown;
  from_name?: unknown;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/sending-domains");
  if (!auth.ok) return auth.response;
  let body: Body = {};
  try {
    body = JSON.parse(await request.text()) as Body;
  } catch {
    /* validated below */
  }
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const op = str(body.op);
  const coldKey = env.RESEND_COLD_API_KEY;

  if (op === "status") return json(200, { ok: true, ready: !!coldKey });
  if (op !== "add" && op !== "check" && op !== "remove" && op !== "resume")
    return json(400, { ok: false, error: "unknown_op" });
  if (!coldKey)
    return json(503, {
      ok: false,
      error: "no_cold_key",
      message: "Sending from your own domain isn't switched on here yet.",
    });
  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return json(400, { ok: false, error: "tenant_id (a workspace id) is required" });

  const L = logger({ door: "sending-domains", tenant: tenantId, op });
  const ports: DomainPorts = {
    db,
    cfg: { apiKey: coldKey },
    dmarc: (h) => readDmarc(h),
    dkim: (h, records) => dkimPublished(h, records),
    now: Date.now,
    log: L,
    page: (key, subject, body) => pageOperator({ db }, key, subject, body),
  };
  try {
    if (op === "add") {
      const out = await addSendingDomain(ports, {
        tenantId,
        host: str(body.host),
        fromLocal: str(body.from_local),
        fromName: str(body.from_name),
        by: UUID.test(str(body.user_id)) ? str(body.user_id) : (auth.user ?? null),
      });
      return out.ok ? json(200, out) : json(out.status, out);
    }
    const domainId = str(body.domain_id);
    const row = UUID.test(domainId) ? await sendingDomainOf(db, tenantId, domainId) : null;
    if (!row) return json(404, { ok: false, error: "not_found", message: "That domain isn't this workspace's." });
    if (op === "check") {
      const out = await checkSendingDomain(ports, row, { verify: true });
      if (out.unreadable)
        return json(502, {
          ok: false,
          error: "provider",
          message: "The mail provider could not be asked just now. Try again.",
        });
      const now = out.row ?? (await sendingDomainOf(db, tenantId, domainId));
      if (!now) return json(404, { ok: false, error: "not_found", message: "That domain isn't this workspace's." });
      return json(200, { ok: true, domain: domainDto(now), change: out.change });
    }
    if (op === "resume") {
      const out = await resumeSendingDomain(ports, row);
      return out.ok ? json(200, out) : json(out.status, out);
    }
    const gone = await removeSendingDomain(ports, row);
    return gone.ok ? json(200, { ok: true, removed: true }) : json(gone.status, gone);
  } catch (e) {
    L.error("sending_domain_door_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(503, { ok: false, error: "unavailable", message: "That didn't go through. Try again in a minute." });
  }
}
