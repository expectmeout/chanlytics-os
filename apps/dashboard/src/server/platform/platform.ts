import "server-only";

/**
 * The back office's server side: who may look across workspaces, and the reads
 * that do.
 *
 * THE ONE RULE. Every path to cross-tenant data passes `backOffice(ctx)`, and
 * that function asks the DATABASE — `is_platform_admin()`, which reads
 * `platform_admins` for `auth.uid()` and can answer about nobody else. There is
 * no env var, no key, and no list in this file: an answer that lives in two
 * places is an answer that can disagree with itself, and the copy that says
 * "yes" wins by accident.
 *
 * THE CAPABILITY IS THE CHECK. The first version exported `platformDb()` — a
 * service-role client, no arguments, available to any module that imported it —
 * and relied on a test walking one directory to prove nothing else did. That is
 * the wrong shape for the one boundary in this product where reading another
 * business's data is a feature: a grep cannot see a route that has not been
 * written yet, and the route that matters is the one somewhere ELSE that
 * imports it.
 *
 * So the client is unreachable except as a property of a `BackOffice` handle,
 * and the only way to construct one is to await `backOffice(ctx)`, which throws
 * unless the database says yes. The type is branded so it cannot be forged from
 * an object literal either. Nothing is exported that hands out authority.
 */
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AppError,
  platformHealthOf,
  QUEUE_SHOWN,
  type PlatformHealth,
  type PlatformQueue,
  type PlatformTenantDto,
  type SweepHealthRow,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

declare const backOfficeBrand: unique symbol;

/**
 * Proof that the database said this session is a platform admin, carrying the
 * client that proof unlocks. Only `backOffice()` can make one.
 */
export interface BackOffice {
  readonly [backOfficeBrand]: true;
  /** Service-role, RLS off, every workspace. Reachable only through the check above it. */
  readonly db: SupabaseClient<Database>;
  /** The session client, for the reads whose own RPC carries the same check. */
  readonly session: SupabaseClient<Database>;
}

/**
 * Ask the database whether this session may look across workspaces.
 *
 * Three answers, not two, and the third is the one that was wrong: a database
 * that cannot answer is not a "no". Telling a real admin "No such page" during
 * a Postgres hiccup is exactly the moment they opened the back office for.
 */
async function admitted(ctx: RouteContext): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin");
  if (error) throw new AppError("internal", "Could not check that just now — try again in a moment.", 503);
  return data === true;
}

/**
 * The back office, or a refusal.
 *
 * 404, not 403: a customer who guessed the URL learns nothing about whether
 * there is a back office behind it. A real admin never sees this.
 */
export async function backOffice(ctx: RouteContext): Promise<BackOffice> {
  if (!(await admitted(ctx))) throw new AppError("not_found", "No such page.", 404);
  return { db: serviceDb(), session: ctx.supabase } as BackOffice;
}

/** Whether the back office exists for this session. For the nav, which needs a boolean rather than a door. */
export async function isPlatformAdmin(ctx: RouteContext): Promise<boolean> {
  return admitted(ctx).catch(() => false);
}

/**
 * Every workspace, from the guarded RPC.
 *
 * Read on the SESSION client on purpose. The check inside the function is
 * `auth.uid()`, so it only passes for a real signed-in admin — the service-role
 * key gets a 403 from it like everybody else, which is a property worth keeping
 * rather than routing around.
 */
export async function platformOverview(office: BackOffice): Promise<PlatformTenantDto[]> {
  const { data, error } = await office.session.rpc("platform_overview");
  if (error) {
    // 42501 is the function's own refusal — which the caller has already been
    // cleared past, so seeing it here means the two checks disagree.
    if (error.code === "42501") throw new AppError("not_found", "No such page.", 404);
    throw new Error(error.message);
  }
  // No cast: the generated Functions type is precise, so a column renamed in a
  // future migration fails the build here rather than shipping `undefined` to
  // the page.
  const rows: PlatformTenantDto[] = data ?? [];
  return rows;
}

/**
 * Whether the machinery under every workspace is running.
 *
 * Read on `office.db`, the service-role client, because both functions are
 * granted to that role alone — `revoke ... from authenticated` in 00105 and
 * 00107, deliberately: they count across every workspace, and no session
 * should be able to ask. Reaching them needs no new grant and no migration,
 * only the door that is already in front of this file.
 *
 * NEITHER READ IS FATAL. The back office exists to be opened when something
 * is wrong, and a page that 500s because the health read failed is useless at
 * exactly that moment. A backlog that could not be read stays null, which the
 * judgement treats as "not healthy" rather than "all clear".
 */
export async function platformHealth(office: BackOffice, now = new Date()): Promise<PlatformHealth> {
  const [health, backlog] = await Promise.all([
    office.db.rpc("sweep_health").then(
      (r) => r,
      () => ({ data: null, error: { message: "unreadable" } }),
    ),
    office.db.rpc("jobs_backlog").then(
      (r) => r,
      () => ({ data: null, error: { message: "unreadable" } }),
    ),
  ]);
  const rows = (!health.error && Array.isArray(health.data) ? health.data : []) as SweepHealthRow[];
  const due = !backlog.error && typeof backlog.data === "number" ? backlog.data : null;
  return platformHealthOf(rows, due, now);
}

/**
 * The people waiting for a workspace, oldest first.
 *
 * Read on `office.db`. `public.waitlist` is deny-all with no policies (00088):
 * nobody on it has a workspace to be scoped to, so there is no membership that
 * could make a row legitimately readable by a session, and the service-role
 * client is the only thing that can see it at all.
 *
 * NOT FATAL, and null is not empty. The back office is opened when something is
 * wrong, so a read that failed must not take the page down with it -- and it
 * must not come back as "nobody is waiting" either, which is the one answer a
 * queue must never give by accident.
 */
export async function platformWaitlist(office: BackOffice, limit = QUEUE_SHOWN): Promise<PlatformQueue> {
  const { data, error, count } = await office.db
    .from("waitlist")
    .select("id, email, business, source, created_at", { count: "exact" })
    .is("invited_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("platform_waitlist_unreadable", JSON.stringify({ error: error.message }));
    return { waiting: null, total: null };
  }
  return { waiting: data ?? [], total: count ?? (data ?? []).length };
}

/**
 * Somebody was invited. The product sent nothing and says so (QUEUE_SENDS_NOTHING):
 * this records that a person did, which is what takes the row out of the queue.
 *
 * Conditional on the row still waiting, so two admins working the same list do
 * not both claim it, and the row count says which of them this was. `invited_by`
 * is the attribution the table was given a column for.
 */
export async function platformWaitlistInvited(
  office: BackOffice,
  ctx: RouteContext,
  id: string,
): Promise<"marked" | "already"> {
  const { data, error } = await office.db
    .from("waitlist")
    .update({ invited_at: new Date().toISOString(), invited_by: ctx.userId })
    .eq("id", id)
    .is("invited_at", null)
    .select("id");
  if (error)
    throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);
  return data && data.length > 0 ? "marked" : "already";
}

/** One workspace's identity, for the detail view's heading. */
export async function platformTenant(
  office: BackOffice,
  tenantId: string,
): Promise<{ id: string; slug: string; name: string; status: string; timezone: string; created_at: string } | null> {
  const { data, error } = await office.db
    .from("tenants")
    .select("id, slug, name, status, timezone, created_at")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export interface PlatformEvent {
  kind: string;
  category: string;
  subject_type: string | null;
  created_at: string;
}

/**
 * What has happened in a workspace lately.
 *
 * The ledger `emitEvent` already writes on every provisioning step, filing,
 * connection and billing change — the trail that was only ever readable by
 * hand. Capped and newest-first: this answers "what changed just before it
 * broke", which is a short question.
 *
 * `data` is deliberately NOT selected. It is the one unbounded field on this
 * route — emitEvent's payloads carry numbers, addresses and provider ids from
 * every corner of the product — and the page renders none of it. Sending
 * another business's payloads to a browser to be thrown away is the kind of
 * quiet over-reach a cross-tenant surface has no excuse for. If support ever
 * needs one, it should be a deliberate per-event read with a named field list.
 */
export async function platformEvents(office: BackOffice, tenantId: string, limit = 40): Promise<PlatformEvent[]> {
  const { data, error } = await office.db
    .from("events")
    .select("kind, category, subject_type, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformEvent[];
}

/* -------------------------------------------------------------------------- *
 * The ops door: the write half of the back office.
 *
 * WHY IT EXISTS. `/api/admin/lines` — retry, refile, release — is gated on
 * DIAG_KEY, which Vercel holds as a SENSITIVE variable: write-only, unreadable
 * by anyone including the person who set it. So every one of those actions has
 * been performed by importing the library into a local script and recovering
 * four values from Twilio and the database by hand. That is fine once. It is not
 * an operations model, and refiling a rejected campaign is the single most
 * common A2P support action there is.
 *
 * The key stays where it is and stays unreadable. What changes is that a
 * PERSON'S SESSION can now authorise these, through the same `platform_admins`
 * check as every other back-office read.
 *
 * NEVER A PASSTHROUGH. Each route names its own operation. A route that forwards
 * an arbitrary `op` to the edge is a back door with extra steps, and this is the
 * one surface in the product where that would be handing out the master key.
 * -------------------------------------------------------------------------- */

import { edgeLines } from "../connections/lines";
import type { PlatformLineAction } from "@chanlytics/contracts";

/** The edge call each action makes. Written out so the set is a list somebody can read, not a parameter. */
const EDGE_OP: Record<PlatformLineAction, (tenantId: string, lineId: string) => Record<string, unknown>> = {
  retry: (tenant_id, line_id) => ({ op: "retry", tenant_id, line_id, by: "support" }),
  // `refile` is the same edge operation as an owner's own registration, with the
  // flag that lets it replace a rehearsal or resend a rejected campaign -- the
  // two things an owner may not do and support must.
  refile: (tenant_id, line_id) => ({ op: "register", tenant_id, line_id, refile: true }),
  // `replace` is the same door once more, with the flag that deletes a refused
  // campaign and files a new one -- a second vetting fee, so never implied by
  // refile and never reachable from an owner's own registration.
  replace: (tenant_id, line_id) => ({ op: "register", tenant_id, line_id, refile: true, replace: true }),
  release: (tenant_id, line_id) => ({ op: "release", tenant_id, line_id }),
};

export interface PlatformActionResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}

/**
 * Do one thing to one workspace's line, and record who asked before doing it.
 *
 * The order is the point. The attribution is written FIRST and the action is
 * refused if it cannot be written — an action taken on somebody else's business
 * that nobody can be held to is worse than an action that did not happen. What
 * happened next is the line's own event, written by the edge moments later, so
 * the pair reads in order in one ledger.
 */
export async function platformLineAct(
  office: BackOffice,
  ctx: RouteContext,
  action: PlatformLineAction,
  tenantId: string,
  lineId: string,
): Promise<PlatformActionResult> {
  const { error: auditErr } = await office.db.from("events").insert({
    tenant_id: tenantId,
    kind: "platform.acted",
    category: "platform",
    subject_type: "line",
    subject_id: lineId,
    data: { action, by: ctx.userId, by_email: ctx.email ?? null },
  });
  if (auditErr)
    throw new AppError("internal", "That could not be recorded, so it was not done. Try again in a moment.", 503);

  const a = await edgeLines(EDGE_OP[action](tenantId, lineId), 60_000);
  return { ok: a.status === 200, status: a.status, body: a.body };
}
