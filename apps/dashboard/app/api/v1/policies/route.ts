import { withRoute, memberContext, requireRole } from "@/server/with-route";
import {
  AppError,
  POLICY_CLASSES,
  POLICY_MODES,
  REPLY_DELAY_MIN_MS,
  REPLY_DELAY_MAX_MS,
} from "@chanlytics/contracts";
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
  const body = (await req.json().catch(() => null)) as
    | { class?: string; mode?: string; replyDelayMs?: number }
    | null;
  const cls = body?.class ?? "";
  const mode = body?.mode ?? "";
  if (!(POLICY_CLASSES as readonly string[]).includes(cls)) throw new AppError("validation", "Unknown policy class.");
  if (!(POLICY_MODES as readonly string[]).includes(mode)) throw new AppError("validation", "Unknown mode.");
  // 'veto' used to be refused here on the rule "no option without an
  // enforcer" — offering a mode nothing implemented would have been a switch
  // that lies. The enforcer now exists: the receptionist writes its reply as a
  // draft and a scheduled job sends it, so the option is real and the refusal
  // has become the thing standing in the way.
  //
  // Only the REPLY class can be vetoed. The others have no draft to hold.
  if (mode === "veto" && cls !== "reply") {
    throw new AppError("validation", "Only replies can be held for review — the other classes have no draft to hold.");
  }

  // The wait, in ms. Clamped at the boundary as well as in the reader: a value
  // that reaches the database out of range would be silently corrected on read
  // and the workspace would see a number it never chose.
  const limits: Record<string, unknown> = {};
  if (body?.replyDelayMs !== undefined) {
    const d = Number(body.replyDelayMs);
    if (!Number.isFinite(d) || d < REPLY_DELAY_MIN_MS || d > REPLY_DELAY_MAX_MS) {
      throw new AppError(
        "validation",
        `The reply delay must be between ${REPLY_DELAY_MIN_MS / 1000}s and ${REPLY_DELAY_MAX_MS / 60000} minutes.`,
      );
    }
    if (cls !== "reply") throw new AppError("validation", "A reply delay only applies to the reply policy.");
    limits.reply_delay_ms = Math.round(d);
  }
  try {
    const row = await setPolicyMode(ctx.supabase, member.tenantId, cls, mode, limits);
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
