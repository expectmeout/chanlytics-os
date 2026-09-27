/**
 * POST /api/admin/billing — a workspace's way to pay. Diagnostic-key only;
 * the dashboard's /api/v1/billing verbs call it for an owner.
 *
 *   { op: "status" }                                  → what this deployment can do, whether its key is live or test, the plan as Stripe states it, the trial length
 *   { op: "checkout", tenant_id, email, return? }     → the way to Checkout (a card, the trial), back to Billing -- or to the first run, `return: "start"` -- after
 *   { op: "portal", tenant_id }                       → the way to Stripe's portal (card, invoices, cancel)
 *   { op: "invoices", tenant_id }                     → the last twelve invoices
 *   { op: "sync", tenant_id }                         → read the subscription from Stripe now and apply it
 *   { op: "resume", tenant_id }                       → a paused subscription resumed, billing from now
 *   { op: "start_now", tenant_id }                    → a free trial's plan started now: charged today, and what the
 *                                                       trial does not cover (a number, texting, leads) opens
 *
 * The secret key lives here and nowhere else. Without it, and the price and
 * the webhook secret, the ops say "not_ready" and the dashboard draws
 * nothing it cannot do.
 *
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. The routines are lib/billing.ts's;
 * what each op logs and answers with is lib/billing-ops.ts's; what is left
 * here is the knock, the workspace's row and slug, and the dispatch.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { pg } from "../../lib/pg.js";
import {
  billingReadiness,
  checkoutFor,
  invoicesFor,
  portalFor,
  priceForClient,
  resumeFor,
  startPlanNowFor,
  stripeLivemode,
  syncFor,
  trialDays,
} from "../../lib/billing.js";
import { logger, type Logger } from "../../lib/log.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/packages/db.js";
import {
  type BillingBody,
  type BillingOp,
  type BillingOutcome,
  UNKNOWN_BILLING_OP,
  billingStatusOf,
  billingLogOf,
  checkoutRequest,
} from "../../lib/billing-ops.js";

type Db = SupabaseClient<Database>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An op's call past the knock: a database, the workspace named by id, and the log. */
interface BillingCall {
  body: BillingBody;
  db: Db;
  tenantId: string;
  L: Logger;
}

/** Every op past status, over one call: each asks billing.ts, and the outcome is logged and answered as billing-ops.ts says. */
const OPS: Record<BillingOp, (c: BillingCall) => Promise<Response>> = {
  checkout,
  portal,
  invoices,
  sync,
  resume,
  start_now: startNow,
};

/** The slug a tenant read answered with, or null when the read did not. */
const slugOf = (r: { data: { slug?: string | null } | null }): string | null => r.data?.slug ?? null;

/** The body as sent; not JSON is an empty body, validated below like any other. */
async function readBody(request: Request): Promise<BillingBody> {
  try {
    return JSON.parse(await request.text());
  } catch {
    return {};
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/billing");
  if (!auth.ok) return auth.response;
  const body = await readBody(request);
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;

  if (op === "status") return status();

  const call = workspaceCall(body);
  if (!call.ok) return call.response;
  const run = Object.hasOwn(OPS, op) ? OPS[op as BillingOp] : null;
  return run ? run(call.value) : json(UNKNOWN_BILLING_OP.status, UNKNOWN_BILLING_OP.body);
}

/** What this deployment can do, and the plan as Stripe states it -- no amount is shown for a button that cannot charge. */
async function status(): Promise<Response> {
  const ready = billingReadiness();
  return json(200, {
    ok: true,
    ready: ready.ready,
    livemode: stripeLivemode(),
    doors: ready,
    price: ready.ready ? await priceForClient() : null,
    trial_days: trialDays(),
  });
}

/** Past status every op needs a database and a workspace id. */
function workspaceCall(body: BillingBody): { ok: true; value: BillingCall } | { ok: false; response: Response } {
  const db = pg();
  if (!db) return { ok: false, response: json(503, { ok: false, error: "no_database" }) };
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
  if (!UUID.test(tenantId)) {
    return { ok: false, response: json(400, { ok: false, error: "tenant_id (a workspace id) is required" }) };
  }
  return { ok: true, value: { body, db, tenantId, L: logger({ tenant: tenantId }) } };
}

/** The outcome on the wire: logged as the op says, answered with the status its refusal earns, the body as billing.ts stated it. */
function answered(c: BillingCall, op: BillingOp, r: BillingOutcome): Response {
  const log = billingLogOf(op, r);
  if (log) c.L.info(log.event, log.fields);
  return json(billingStatusOf(r), r);
}

async function checkout(c: BillingCall): Promise<Response> {
  const tenant = await c.db.from("tenants").select("name, slug").eq("id", c.tenantId).maybeSingle();
  if (tenant.error) return json(503, { ok: false, error: tenant.error.message });
  if (!tenant.data) return json(404, { ok: false, error: "no such workspace" });
  const { email, back } = checkoutRequest(c.body.email, c.body.return);
  const r = await checkoutFor(c.db, c.tenantId, tenant.data.name, email, tenant.data.slug ?? null, back);
  return answered(c, "checkout", r);
}

async function portal(c: BillingCall): Promise<Response> {
  const slug = slugOf(await c.db.from("tenants").select("slug").eq("id", c.tenantId).maybeSingle());
  return answered(c, "portal", await portalFor(c.db, c.tenantId, slug));
}

async function invoices(c: BillingCall): Promise<Response> {
  return answered(c, "invoices", await invoicesFor(c.db, c.tenantId));
}

async function sync(c: BillingCall): Promise<Response> {
  return answered(c, "sync", await syncFor(c.db, c.tenantId));
}

async function resume(c: BillingCall): Promise<Response> {
  return answered(c, "resume", await resumeFor(c.db, c.tenantId));
}

async function startNow(c: BillingCall): Promise<Response> {
  return answered(c, "start_now", await startPlanNowFor(c.db, c.tenantId));
}
