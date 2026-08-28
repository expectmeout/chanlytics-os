import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, POLICY_CLASSES, POLICY_MODES } from "@chanlytics/contracts";
import { listPolicies, setPolicyMode } from "@chanlytics/db";

/** GET /api/v1/policies — the workspace autonomy matrix (E3). */
export const GET = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  return { policies: await listPolicies(ctx.supabase, member.tenantId), role: member.role };
});

/**
 * PUT /api/v1/policies — {class, mode}. Owners and operators tune autonomy
 * (the mockup's ST_PERMS says so); viewers are refused here, not just hidden.
 * 'veto' is refused until the drafts engine exists (R1: no option without an
 * enforcer), and the money lock lives in a DB trigger — even this route
 * cannot unlock it.
 */
export const PUT = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  const body = (await req.json().catch(() => null)) as { class?: string; mode?: string } | null;
  const cls = body?.class ?? "";
  const mode = body?.mode ?? "";
  if (!(POLICY_CLASSES as readonly string[]).includes(cls)) throw new AppError("validation", "Unknown policy class.");
  if (!(POLICY_MODES as readonly string[]).includes(mode)) throw new AppError("validation", "Unknown mode.");
  if (mode === "veto") {
    throw new AppError("validation", "Veto needs the drafts engine — it isn't enforceable yet, so it can't be chosen yet.");
  }
  try {
    const row = await setPolicyMode(ctx.supabase, member.tenantId, cls, mode);
    if (!row) throw new AppError("not_found", "Policy row not found.", 404);
    return { policy: row };
  } catch (e) {
    if (e instanceof AppError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/money decisions are owner-only/.test(msg)) {
      throw new AppError("forbidden", "Money stays owner-only by charter — that row is locked.", 403);
    }
    throw e;
  }
});
