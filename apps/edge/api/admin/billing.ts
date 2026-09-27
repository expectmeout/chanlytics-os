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
 * THIS FILE IS THE WIRE, NOT THE JUDGEMENT. The routines are
 * lib/billing/billing.ts's; what each op logs and answers with is
 * lib/billing/billing-ops.ts's; what is left here is the knock, the
 * workspace's row and slug, and the dispatch.
 */
import { json } from "../../lib/http.js";
import { authorizeAdmin, workspaceFor } from "../../lib/admin-auth.js";
import { readBody, respond, workspaceOf, workspaceRow, type Refused } from "../../lib/admin-door.js";
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
} from "../../lib/billing/billing.js";
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
} from "../../lib/billing/billing-ops.js";

type Db = SupabaseClient<Database>;

/** An op's call past the knock: a database, the workspace named by id, and the log. */
interface BillingCall {
  body: BillingBody;
  db: Db;
  tenantId: string;
  L: Logger;
}

/**
 * Every op past status, over one call: each asks billing.ts for its outcome, which the dispatch logs and answers as
 * billing-ops.ts says. Checkout answers for itself when the workspace it names cannot be read.
 */
const OPS: Record<BillingOp, (c: BillingCall) => Promise<BillingOutcome | Response>> = {
  checkout,
  portal,
  invoices: (c) => invoicesFor(c.db, c.tenantId),
  sync: (c) => syncFor(c.db, c.tenantId),
  resume: (c) => resumeFor(c.db, c.tenantId),
  start_now: (c) => startPlanNowFor(c.db, c.tenantId),
};

/** The slug a tenant read answered with, or null when the read did not. */
const slugOf = (r: { data: { slug?: string | null } | null }): string | null => r.data?.slug ?? null;

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAdmin(request, "/api/admin/billing");
  if (!auth.ok) return auth.response;
  const body = await readBody<BillingBody>(request);
  const op = typeof body.op === "string" ? body.op : "";
  const ws = workspaceFor(auth, body.tenant_id);
  if (!ws.ok) return ws.response;
  body.tenant_id = ws.tenantId ?? undefined;

  if (op === "status") return status();

  const call = workspaceCall(body);
  if (!call.ok) return call.response;
  if (!Object.hasOwn(OPS, op)) return respond(UNKNOWN_BILLING_OP);
  const r = await OPS[op as BillingOp](call.value);
  return r instanceof Response ? r : answered(call.value, op as BillingOp, r);
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
function workspaceCall(body: BillingBody): { ok: true; value: BillingCall } | Refused {
  const ws = workspaceOf(body.tenant_id);
  if (!ws.ok) return ws;
  return { ok: true, value: { body, db: ws.db, tenantId: ws.tenantId, L: logger({ tenant: ws.tenantId }) } };
}

/** The outcome on the wire: logged as the op says, answered with the status its refusal earns, the body as billing.ts stated it. */
function answered(c: BillingCall, op: BillingOp, r: BillingOutcome): Response {
  const log = billingLogOf(op, r);
  if (log) c.L.info(log.event, log.fields);
  return json(billingStatusOf(r), r);
}

async function checkout(c: BillingCall): Promise<BillingOutcome | Response> {
  const read = await c.db.from("tenants").select("name, slug").eq("id", c.tenantId).maybeSingle();
  const tenant = workspaceRow(read);
  if (!tenant.ok) return tenant.response;
  const { email, back } = checkoutRequest(c.body.email, c.body.return);
  return checkoutFor(c.db, c.tenantId, tenant.row.name, email, tenant.row.slug ?? null, back);
}

async function portal(c: BillingCall): Promise<BillingOutcome> {
  const slug = slugOf(await c.db.from("tenants").select("slug").eq("id", c.tenantId).maybeSingle());
  return portalFor(c.db, c.tenantId, slug);
}
