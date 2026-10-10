/**
 * Keep the number you have and forward its calls to the receptionist's line (POST /api/v1/lines/forwarding): the body's
 * number, carrier and mode are judged in the person's words, the loop from this side is refused
 * (the number the receptionist puts callers through to cannot become a number that forwards to the receptionist), and
 * the database function keeps one forwarded row per workspace, instructed until a test call proves it, and refuses a
 * workspace with no receptionist line to forward to and the receptionist's own number. It answers the line's id. The
 * route declares who may and how often.
 */
import {
  AppError,
  isCarrier,
  isForwardingMode,
  normalizePhone,
  parseTenantConfig,
  whyNotForward,
} from "@chanlytics/contracts";
import { emitEvent, lineForwardingSet } from "@chanlytics/db";
import { configRowOf } from "@/server/workspace/config-row";
import { serviceDb } from "@/server/service-db";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

const NO_TEST_PHONE: string | null = null;

export async function setLineForwarding(ctx: RouteContext, req: Request, member: Member) {
  const body = (await req.json().catch(() => ({}))) as {
    number?: unknown;
    carrier?: unknown;
    mode?: unknown;
  };
  const number = typeof body.number === "string" ? normalizePhone(body.number) : null;
  if (!number) throw new AppError("validation", "Give the number you keep, with its area code.", 400);
  if (!isCarrier(body.carrier)) throw new AppError("validation", "Pick your carrier.", 400);
  if (!isForwardingMode(body.mode)) throw new AppError("validation", "Pick which calls to forward.", 400);
  // The loop from this side: the number the receptionist puts callers through to cannot become a number that
  // forwards to the receptionist, or a caller put through to it would come straight back.
  const cfg = await configRowOf(ctx.supabase, member.tenantId);
  const loop = whyNotForward(number, parseTenantConfig(cfg?.config ?? null)?.brain?.profile?.handoff_number);
  if (loop) throw new AppError("conflict", loop, 409);
  const { data, error } = await lineForwardingSet(ctx.supabase, {
    p_tenant_id: member.tenantId,
    p_number: number,
    p_carrier: body.carrier,
    p_mode: body.mode,
    // No phone to test from is asked any more (8 Oct 2026; surfaces/setup/rows/forwarding.tsx says why), and one an
    // older page still sends is not read. The function keeps the argument until a migration drops it: null is "none
    // named", and clears one an earlier save left. Its generated type is `string`; the function takes null.
    p_test_from: NO_TEST_PHONE as string,
  });
  if (error) throw dbRefusal(error, { code: "conflict", status: 409 });
  // Where a business's calls go changed on a member's word: the ledger says who and which calls, never the number.
  await emitEvent(serviceDb(), member.tenantId, "line.forwarding_set", "line", data, {
    carrier: body.carrier,
    mode: body.mode,
    by: ctx.userId,
  });
  return { line_id: data };
}
