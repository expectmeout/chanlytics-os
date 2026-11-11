import "server-only";
/**
 * The member's own phones, bell and kept views, on the route's session: packages/db's doors (notices/devices.ts,
 * notices/member-alerts.ts), each answered as it came for the route to read its refusal. A route names no table or
 * function (decision 0111).
 */
import {
  forgetPushDevice,
  keepMemberView,
  markNotification,
  markNotificationsReadThrough,
  markNotificationsSeen,
  registerPushDevice,
  forgetWebPush,
  keepWebPush,
} from "@chanlytics/db/notices";
import { readAnswer } from "@chanlytics/db/shared";
import type { TenantId } from "@chanlytics/contracts";
import { z } from "zod";
import { dbRefusal, type RouteContext } from "@/server/shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

export const registerDevice = (ctx: Ctx, args: Parameters<typeof registerPushDevice>[1]) =>
  registerPushDevice(ctx.supabase, args);
/** This browser said yes to being told (D12 of the answers canvas): a person's own, as their phones are. */
export const keepBrowser = (
  ctx: RouteContext,
  s: { endpoint: string; p256dh: string; auth: string; userAgent: string | null },
) => keepWebPush(ctx.supabase, { userId: ctx.userId, ...s });

/** This browser is told no more. */
export const forgetBrowser = (ctx: RouteContext, endpoint: string) => forgetWebPush(ctx.supabase, ctx.userId, endpoint);

export const forgetDevice = (ctx: Ctx, args: Parameters<typeof forgetPushDevice>[1]) =>
  forgetPushDevice(ctx.supabase, args);
export const markOne = (ctx: Ctx, args: Parameters<typeof markNotification>[1]) => markNotification(ctx.supabase, args);
export const markBellSeen = (ctx: Ctx, args: Parameters<typeof markNotificationsSeen>[1]) =>
  markNotificationsSeen(ctx.supabase, args);

/** What notifications_read_through answers (00614): the moments it left, and where read-through stood before. */
const ReadThrough = z.object({ seen_at: z.string(), read_through_at: z.string(), was: z.string() }).partial();

/**
 * Mark all read, or its Undo with the moment to go back to (00614, decision 0124): the member's look and how far they
 * have read as the door left them, and where read-through stood before (`was`, which a Mark all read alone answers).
 * The door's refusal is raised in its own words.
 */
export async function markBellReadThrough(ctx: Ctx, tenantId: TenantId, through: string | undefined) {
  const { data, error } = await markNotificationsReadThrough(ctx.supabase, {
    p_tenant_id: tenantId,
    ...(through !== undefined ? { p_through: through } : {}),
  });
  if (error) throw dbRefusal(error);
  const moments = readAnswer("notifications_read_through", ReadThrough, data ?? {});
  return {
    seen_at: moments.seen_at ?? null,
    read_through_at: moments.read_through_at ?? null,
    was: moments.was ?? null,
  };
}
export const saveMemberView = (ctx: Ctx, args: Parameters<typeof keepMemberView>[1]) =>
  keepMemberView(ctx.supabase, args);
