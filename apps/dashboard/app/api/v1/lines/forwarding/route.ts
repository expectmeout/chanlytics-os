import { write, workspace } from "@/server/route";
import {
  AppError,
  isCarrier,
  isForwardingMode,
  normalizePhone,
  parseTenantConfig,
  whyNotForward,
} from "@chanlytics/contracts";
import { getTenantConfig } from "@chanlytics/db";
import { dbRefusal } from "@/server/with-route";

/**
 * POST /api/v1/lines/forwarding — {number, carrier, mode, test_from?}: keep
 * the number you have and forward its calls to the receptionist's line.
 * Owners only. The RPC keeps one forwarded row per workspace, instructed
 * until a test call proves it. The body is the route's own to read:
 * normalizePhone decides what a number is, and each refusal is a sentence.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_forwarding",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as {
      number?: unknown;
      carrier?: unknown;
      mode?: unknown;
      test_from?: unknown;
    };
    const number = typeof body.number === "string" ? normalizePhone(body.number) : null;
    if (!number) throw new AppError("validation", "Give the number you keep, with its area code.", 400);
    if (!isCarrier(body.carrier)) throw new AppError("validation", "Pick your carrier.", 400);
    if (!isForwardingMode(body.mode)) throw new AppError("validation", "Pick which calls to forward.", 400);
    const testFrom =
      typeof body.test_from === "string" && body.test_from.trim() ? normalizePhone(body.test_from) : null;
    if (typeof body.test_from === "string" && body.test_from.trim() && !testFrom)
      throw new AppError("validation", "The phone you will test from needs its area code.", 400);
    // The loop from this side: the number the receptionist puts callers through to cannot become a number that
    // forwards to the receptionist, or a caller put through to it would come straight back.
    const cfg = await getTenantConfig(ctx.supabase, member.tenantId);
    const loop = whyNotForward(number, parseTenantConfig(cfg?.config ?? null)?.brain?.profile?.handoff_number);
    if (loop) throw new AppError("conflict", loop, 409);
    const { data, error } = await ctx.supabase.rpc("line_forwarding_set", {
      p_tenant_id: member.tenantId,
      p_number: number,
      p_carrier: body.carrier,
      p_mode: body.mode,
      // The generated argument type is `string`; the function takes null ("no phone named") and the API carries it.
      p_test_from: testFrom as string,
    });
    if (error) throw dbRefusal(error, { code: "conflict", status: 409 });
    return { line_id: data };
  },
});
