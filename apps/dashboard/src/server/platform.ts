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
import { AppError, type PlatformTenantDto } from "@chanlytics/contracts";
import type { RouteContext } from "./with-route";

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

/** One workspace's identity, for the detail view's heading. */
export async function platformTenant(office: BackOffice, tenantId: string): Promise<{ id: string; slug: string; name: string; status: string; timezone: string; created_at: string } | null> {
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
