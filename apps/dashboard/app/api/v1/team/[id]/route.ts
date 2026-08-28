import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, ROLES } from "@chanlytics/contracts";
import { setMemberRole, removeMember } from "@/server/service";

/** PATCH /api/v1/team/:id — {role}. Owner-only; the last owner is immovable. */
export const PATCH = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  const id = String(ctx.params.id ?? "");
  const body = (await req.json().catch(() => null)) as { role?: string } | null;
  const role = body?.role ?? "";
  if (!(ROLES as readonly string[]).includes(role)) throw new AppError("validation", "Unknown role.");
  return await setMemberRole(member.tenantId, id, role as "owner" | "operator" | "viewer");
});

/** DELETE /api/v1/team/:id — remove a member (or revoke an open invite). */
export const DELETE = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  return await removeMember(member.tenantId, String(ctx.params.id ?? ""), ctx.userId);
});
