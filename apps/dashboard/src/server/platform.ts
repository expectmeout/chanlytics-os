import "server-only";

/**
 * The back office's server side: who may look across workspaces, and the two
 * reads that do.
 *
 * THE ONE RULE. Every path to cross-tenant data passes `requirePlatformAdmin`,
 * and that function asks the DATABASE — `is_platform_admin()`, which reads
 * `platform_admins` for `auth.uid()` and can answer about nobody else. There is
 * no env var, no key, and no list in this file: an answer that lives in two
 * places is an answer that can disagree with itself, and the copy that says
 * "yes" wins by accident.
 *
 * The list read (`platformOverview`) does not even need this helper -- the RPC
 * carries the same check as its first statement, so a route that forgot would
 * get a 403 from Postgres rather than somebody else's customers. It calls it
 * anyway, because the refusal should read the same on both routes.
 *
 * The detail read DOES need it, and that is the honest asymmetry in the design.
 * Rendering another workspace's Setup means running the app's own assembly --
 * sixteen queries across a dozen tables -- which is TypeScript, so it cannot
 * live inside an RPC. It runs on the service client, and the only thing standing
 * between it and a customer's data is this function, called first. Which is why
 * a test asserts that every route under app/api/v1/platform calls it.
 */
import { createServiceClient } from "@chanlytics/db";
import type { Database } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AppError, type PlatformTenantDto } from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";

let svc: SupabaseClient<Database> | null = null;
function serviceDb(): SupabaseClient<Database> {
  svc ??= createServiceClient({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
  return svc;
}

/**
 * Refuse anyone the database refuses.
 *
 * 404, not 403: a customer who guessed the URL learns nothing about whether
 * there is a back office behind it. A real admin never sees this.
 */
export async function requirePlatformAdmin(ctx: RouteContext): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin");
  if (error) throw new AppError("not_found", "No such page.", 404);
  if (data !== true) throw new AppError("not_found", "No such page.", 404);
}

/** Whether this session may see the back office at all. Never throws: the answer "no" is ordinary. */
export async function isPlatformAdmin(ctx: RouteContext): Promise<boolean> {
  const { data, error } = await ctx.supabase.rpc("is_platform_admin");
  return !error && data === true;
}

/**
 * Every workspace, from the guarded RPC.
 *
 * Read on the SESSION client on purpose. The check inside the function is
 * `auth.uid()`, so it only passes for a real signed-in admin -- the service-role
 * key gets a 403 from it like everybody else, which is a property worth keeping
 * rather than routing around.
 */
export async function platformOverview(ctx: RouteContext): Promise<PlatformTenantDto[]> {
  const { data, error } = await ctx.supabase.rpc("platform_overview");
  if (error) {
    // 42501 is the function's own refusal. Anything else is ours to own.
    if (error.code === "42501") throw new AppError("not_found", "No such page.", 404);
    throw new Error(error.message);
  }
  return (data ?? []) as PlatformTenantDto[];
}

/** One workspace's identity, for the detail view's heading. Service client: the admin check has already passed. */
export async function platformTenant(tenantId: string): Promise<{ id: string; slug: string; name: string; status: string; timezone: string; created_at: string } | null> {
  const { data, error } = await serviceDb()
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
  data: unknown;
}

/**
 * What has happened in a workspace lately.
 *
 * The ledger `emitEvent` already writes on every provisioning step, filing,
 * connection and billing change -- the trail that was only ever readable by
 * hand. Capped and newest-first: this answers "what changed just before it
 * broke", which is a short question.
 */
export async function platformEvents(tenantId: string, limit = 40): Promise<PlatformEvent[]> {
  const { data, error } = await serviceDb()
    .from("events")
    .select("kind, category, subject_type, created_at, data")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as PlatformEvent[];
}

/** The client the detail view assembles Setup with. Only ever reached after requirePlatformAdmin. */
export function platformDb(): SupabaseClient<Database> {
  return serviceDb();
}
