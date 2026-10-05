/**
 * POST /api/admin/sending-domains — a workspace's own domains for cold email (Reach out, Part 2). The dashboard's
 * /api/v1/sending-domains verbs call it for an owner; the cold mail account's key lives here and nowhere else.
 *
 * The door is api/admin/sending-domains.ts: it reads the body once as text (the token's body hash is checked over those
 * bytes), works out whether this knock is the platform's lift of a hold, and asks who is knocking (authorizeAdmin);
 * everything after is here, handed the knock, the request (for the token header) and the body.
 *
 *   { op: "status" }                                        → may this deployment add domains at all
 *   { op: "add", tenant_id, host, from_local, from_name }   → held for the workspace, created at the provider
 *   { op: "check", tenant_id, domain_id }                   → the provider asked to look again, and read now
 *   { op: "remove", tenant_id, domain_id }                  → gone at the provider, then the row
 *   { op: "resume", tenant_id, domain_id }                  → a reputation hold lifted by the owner, 30 a day again
 *   { op: "resume", tenant_id, domain_id, by: "platform" }  → one held twice in 30 days, lifted by the platform (D16):
 *                                                             the platform's key only, never a dashboard's token
 *
 * What each answer means is lib/email/sending-domains.ts's; the ops are here (sendingDomainsOp), the door
 * is who may knock and what the body says it is.
 */
import { json, refuse } from "../http.js";
import { personFor, workspaceFor, type Admitted } from "../admin-auth.js";
import { pg } from "../pg.js";
import { logger } from "../log.js";
import { env } from "../env.js";
import { sendingDomainOf } from "../packages/db.js";
import { dkimPublished, readDmarc } from "./dmarc.js";
import { pageOperator } from "../ops/page-operator.js";
import {
  addSendingDomain,
  checkSendingDomain,
  domainDto,
  removeSendingDomain,
  resumeSendingDomain,
  type DomainPorts,
} from "./sending-domains.js";
import { UUID } from "../packages/contracts.js";

export interface Body {
  op?: unknown;
  tenant_id?: unknown;
  user_id?: unknown;
  domain_id?: unknown;
  by?: unknown;
  host?: unknown;
  from_local?: unknown;
  from_name?: unknown;
}

export async function sendingDomainsOp(auth: Admitted, request: Request, body: Partial<Body>): Promise<Response> {
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  const op = str(body.op);
  const coldKey = env.RESEND_COLD_API_KEY;

  if (op === "status") return json(200, { ok: true, ready: !!coldKey });
  if (op !== "add" && op !== "check" && op !== "remove" && op !== "resume") return refuse(400, "unknown_op");
  if (!coldKey)
    return json(503, {
      ok: false,
      error: "no_cold_key",
      message: "Sending from your own domain isn't switched on here yet.",
    });
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const tenantId = ws.tenantId ?? "";
  if (!UUID.test(tenantId)) return refuse(400, "bad_tenant", "tenant_id (a workspace id) is required");

  const L = logger({ door: "sending-domains", tenant_id: tenantId, op });
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
        by: personFor(auth, body.user_id),
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
      // The platform lifts a second hold (D16) with its own key: a dashboard's token speaks for an owner, whatever it says.
      const platform = str(body.by) === "platform";
      // A call that carries a dashboard's token is a dashboard's, even while this edge lets the key decide.
      if (platform && (auth.via !== "key" || request.headers.get("x-edge-token")))
        return json(403, { ok: false, error: "platform_only", message: "Only the platform lifts this hold." });
      const out = await resumeSendingDomain(ports, row, platform ? "platform" : "owner");
      return out.ok ? json(200, out) : json(out.status, out);
    }
    const gone = await removeSendingDomain(ports, row);
    return gone.ok ? json(200, { ok: true, removed: true }) : json(gone.status, gone);
  } catch (e) {
    L.error("sending_domain_door_failed", { error: e instanceof Error ? e.message : String(e) });
    return json(503, { ok: false, error: "unavailable", message: "That didn't go through. Try again in a minute." });
  }
}
