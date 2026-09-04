import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, parseTenantConfig, parseTenantConfigResult, TenantConfigWriteSchema } from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db";
import type { Json } from "@chanlytics/db";
import { takeRate } from "@/server/rate-limit";

/** GET /api/v1/settings — the tenant's config, with the version the client
 *  must echo back on write. Members read; RLS scopes. */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const row = await getTenantConfig(ctx.supabase, member.tenantId);
  if (!row) throw new AppError("not_found", "Workspace has no configuration row.", 404);
  // A config the parser refuses is a different fact from "nothing configured".
  // Collapsing both to {} showed a broken workspace the "no receptionist yet"
  // invitation — and the form behind it would have saved over the broken row,
  // deleting whatever it still held. The edge already tells the two apart
  // (tenant-runtime's configBroken); this is the same answer for the pane.
  const parsed = parseTenantConfigResult(row.config);
  if (parsed.ok) return { config: parsed.config, version: row.version, role: member.role, configBroken: false };
  return { config: null, version: row.version, role: member.role, configBroken: true, issues: parsed.issues };
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
  takeRate(ctx.userId, "settings");
  const body = (await req.json().catch(() => null)) as { config?: unknown; version?: number } | null;
  if (!body || typeof body.version !== "number") {
    throw new AppError("validation", "Body must be { config, version }.");
  }
  // The WRITE schema: the same shape, plus the rules that only apply on the
  // way in. They are not on the read schema because a refinement there turns
  // an already-stored bad row into configBroken, and the receptionist goes
  // silent rather than an owner seeing a message.
  const parsed = TenantConfigWriteSchema.safeParse(body.config ?? {});
  if (!parsed.success) {
    // Say WHICH field, and say all of them.
    //
    // This reported issues[0].message alone and threw the path away, so a form
    // rejected for two bad days produced "Config rejected: A day needs both an
    // opening and a closing time" — no day named — and the caller fixed one,
    // resubmitted, and got the same unattributed sentence again. The write
    // rules build a path for exactly this.
    const said = parsed.error.issues.slice(0, 3).map((i) => {
      const field = i.path.filter((p) => typeof p === "string").slice(-2).join(".");
      return field ? `${field}: ${i.message}` : i.message;
    });
    const more = parsed.error.issues.length - said.length;
    throw new AppError(
      "validation",
      `Config rejected — ${said.join(" ")}${more > 0 ? ` (and ${more} more)` : ""}`,
    );
  }
  const result = await putTenantConfig(ctx.supabase, member.tenantId, parsed.data as Json, body.version);
  if (!result.ok) {
    // These are different failures and used to share one message. Telling an
    // owner "someone else saved settings" when the row simply does not exist
    // blames an imaginary colleague and prescribes a reload that can never
    // help. Provisioning (migration 00017) makes the second case unreachable
    // for tenants created from now on; this stays honest about the rest.
    if (result.reason === "missing") {
      throw new AppError(
        "conflict",
        "This workspace has no settings record yet, so there was nothing to update. It needs provisioning before settings can be saved.",
        409,
      );
    }
    throw new AppError("conflict", "Someone else saved settings after you loaded them — reload and reapply.", 409);
  }
  return { config: parseTenantConfig(result.row.config) ?? {}, version: result.row.version };
});
