/**
 * POST /api/admin/billing — a workspace's way to pay. Diagnostic-key only;
 * the dashboard's /api/v1/billing verbs call it for an owner.
 *
 *   { op: "status" }                                  → what this deployment can do, the plan as Stripe states it, the trial length
 *   { op: "checkout", tenant_id, email }              → the way to Checkout (a card, the trial), back to Billing after
 *   { op: "portal", tenant_id }                       → the way to Stripe's portal (card, invoices, cancel)
 *   { op: "invoices", tenant_id }                     → the last twelve invoices
 *   { op: "sync", tenant_id }                         → read the subscription from Stripe now and apply it
 *   { op: "resume", tenant_id }                       → a paused subscription resumed, billing from now
 *
 * The secret key lives here and nowhere else. Without it, and the price and
 * the webhook secret, the ops say "not_ready" and the dashboard draws
 * nothing it cannot do.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import { billingReadiness, checkoutFor, invoicesFor, portalFor, priceForClient, resumeFor, syncFor, trialDays } from "../../lib/billing.js";

interface Body {
  op?: string;
  tenant_id?: string;
  email?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const config = { maxDuration: 30 };

const STATUS_OF: Record<string, number> = { not_ready: 503, no_account: 404, direct: 409, already_subscribed: 409, no_customer: 409, no_subscription: 409, not_paused: 409, stripe_refused: 502 };

/** The slug a tenant read answered with, or null when the read did not. */
const slugOf = (r: { data: { slug?: string | null } | null }): string | null => r.data?.slug ?? null;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/billing");
  if (!auth.ok) return auth.response;
  let body: Body = {};
  try { body = JSON.parse(await request.text()); } catch { /* validated below */ }
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;

  if (op === "status") {
    const ready = billingReadiness();
    return json(200, { ok: true, ready: ready.ready, doors: ready, price: ready.ready ? await priceForClient() : null, trial_days: trialDays() });
  }

  const db = pg();
  if (!db) return json(503, { ok: false, error: "no_database" });
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!UUID.test(tenantId)) return json(400, { ok: false, error: "tenant_id (a workspace id) is required" });
  const log = (event: string, extra: Record<string, unknown> = {}) => console.log(event, JSON.stringify({ tenant: tenantId, ...extra }));

  if (op === "checkout") {
    const tenant = await db.from("tenants").select("name, slug").eq("id", tenantId).maybeSingle();
    if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
    if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });
    const email = typeof body.email === "string" && body.email.includes("@") ? body.email.trim().slice(0, 254) : null;
    const r = await checkoutFor(db, tenantId, tenant.data.name, email, tenant.data.slug ?? null);
    log(r.ok ? "billing_checkout_opened" : "billing_checkout_refused", r.ok ? {} : { error: r.error, detail: r.detail?.slice(0, 200) });
    return json(r.ok ? 200 : STATUS_OF[r.error] ?? 500, r);
  }
  if (op === "portal") {
    const r = await portalFor(db, tenantId, slugOf(await db.from("tenants").select("slug").eq("id", tenantId).maybeSingle()));
    return json(r.ok ? 200 : STATUS_OF[r.error] ?? 500, r);
  }
  if (op === "invoices") {
    const r = await invoicesFor(db, tenantId);
    return json(r.ok ? 200 : STATUS_OF[r.error] ?? 500, r);
  }
  if (op === "sync") {
    const r = await syncFor(db, tenantId);
    log(r.ok ? "billing_synced" : "billing_sync_refused", r.ok ? { status: r.status } : { error: r.error });
    return json(r.ok ? 200 : STATUS_OF[r.error] ?? 500, r);
  }
  if (op === "resume") {
    const r = await resumeFor(db, tenantId);
    log(r.ok ? "billing_resumed" : "billing_resume_refused", r.ok ? { status: r.status } : { error: r.error });
    return json(r.ok ? 200 : STATUS_OF[r.error] ?? 500, r);
  }
  return json(400, { ok: false, error: "op must be status, checkout, portal, invoices, sync or resume" });
}
