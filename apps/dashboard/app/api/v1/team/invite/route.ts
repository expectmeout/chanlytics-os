import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { AppError, ROLES } from "@chanlytics/contracts";
import { inviteMember } from "@/server/service";
import { takeRate } from "@/server/rate-limit";

/**
 * POST /api/v1/team/invite — {email, role}. Owner-only. Sends the real
 * Supabase invite email and records the intent; accepting creates the
 * membership at the invited role. Owners are added by hand, not by invite —
 * the blast radius of a mistyped owner email is the whole workspace.
 */
export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "owner");
  takeRate(ctx.userId, "invite");
  const body = (await req.json().catch(() => null)) as { email?: string; role?: string } | null;
  const email = (body?.email ?? "").trim().toLowerCase();
  const role = body?.role ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError("validation", "That doesn't look like an email address.");
  if (!(ROLES as readonly string[]).includes(role) || role === "owner") {
    throw new AppError("validation", "Invites can grant operator or viewer.");
  }
  return await inviteMember(ctx.supabase, member.tenantId, ctx.userId, email, role as "operator" | "viewer");
});
