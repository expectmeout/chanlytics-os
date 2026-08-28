import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, parseTenantConfig, TenantConfigSchema } from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db";
import type { Json } from "@chanlytics/db";

/** GET /api/v1/settings — the tenant's config, with the version the client
 *  must echo back on write. Members read; RLS scopes. */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const row = await getTenantConfig(ctx.supabase, member.tenantId);
  if (!row) throw new AppError("not_found", "Workspace has no configuration row.", 404);
  return { config: parseTenantConfig(row.config) ?? {}, version: row.version, role: member.role };
});

/**
 * PUT /api/v1/settings — owner-only, whole-config write with optimistic
 * concurrency: {config, version}. A stale version is a 409, never a silent
 * clobber of another owner's edit. The zod schema is the SAME one the edge
 * parses, so an option that saves here exists in the runtime by construction.
 */
export const PUT = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  const body = (await req.json().catch(() => null)) as { config?: unknown; version?: number } | null;
  if (!body || typeof body.version !== "number") {
    throw new AppError("validation", "Body must be { config, version }.");
  }
  const parsed = TenantConfigSchema.safeParse(body.config ?? {});
  if (!parsed.success) {
    throw new AppError("validation", `Config rejected: ${parsed.error.issues[0]?.message ?? "invalid"}.`);
  }
  const row = await putTenantConfig(ctx.supabase, member.tenantId, parsed.data as Json, body.version);
  if (!row) {
    throw new AppError("conflict", "Someone else saved settings after you loaded them — reload and reapply.", 409);
  }
  return { config: parseTenantConfig(row.config) ?? {}, version: row.version };
});
