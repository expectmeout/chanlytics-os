import "server-only";
import { AppError, parseMemberAlerts, type PushKind } from "@chanlytics/contracts";
import { setMemberPushOff } from "@chanlytics/db";
import { deployment } from "../env";
import { callEdge, edgeConfigured } from "../edge";
import { log } from "../log";
import { dbRefusal, type RouteContext } from "../with-route";

/** A test waits this long for the edge to say it was sent: one mail through the provider, whose own bound is ten seconds. */
const TEST_TIMEOUT_MS = 12_000;

/**
 * PUT me/alerts: the kinds this member's phones are not told in this workspace (decision 0040), saved on their own
 * membership row through member_push_off_set, which judges the caller alone. Any role may, for themselves.
 */
export async function saveMemberPushOff(
  ctx: RouteContext,
  tenantId: string,
  body: unknown,
): Promise<{ push_off: PushKind[] }> {
  const parsed = parseMemberAlerts(body);
  if (!parsed.ok) throw new AppError("validation", parsed.reason, 400);
  try {
    await setMemberPushOff(ctx.supabase, { tenantId, kinds: parsed.pushOff });
  } catch (e) {
    throw dbRefusal(e as { code?: string | null; message: string });
  }
  return { push_off: parsed.pushOff };
}

/** What a test came to: sent to how many addresses, or why not. */
interface AlertTestAnswer {
  sent: boolean;
  to: number;
  why: "no_address" | "not_live" | "not_sent" | null;
}

/**
 * POST notifications/test: the edge emails every address the workspace's alerts go to, once (api/admin/email/alert-test.ts).
 * Only where providers are live: a preview or a laptop sends nobody mail, and says so. The edge refusing, or not
 * answering, is "not sent", never a guess that it went.
 */
export async function sendAlertTest(tenantId: string, userId: string): Promise<AlertTestAnswer> {
  if (!deployment.providersLive || !edgeConfigured()) return { sent: false, to: 0, why: "not_live" };
  const r = await callEdge(
    "/api/admin/email/alert-test",
    { tenant_id: tenantId },
    { workspace: tenantId, user: userId, timeoutMs: TEST_TIMEOUT_MS },
  );
  const body = (r.body ?? {}) as { sent?: unknown; to?: unknown; why?: unknown };
  const to = typeof body.to === "number" ? body.to : 0;
  if (r.status === 200 && body.sent === true) return { sent: true, to, why: null };
  if (r.status === 200 && body.why === "no_address") return { sent: false, to: 0, why: "no_address" };
  log.error("alert_test_failed", { tenant_id: tenantId, status: r.status, error: r.body?.error });
  return { sent: false, to, why: "not_sent" };
}
