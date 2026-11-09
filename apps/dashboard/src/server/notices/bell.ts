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
  markNotificationsSeen,
  registerPushDevice,
  forgetWebPush,
  keepWebPush,
} from "@chanlytics/db/notices";
import type { RouteContext } from "@/server/shared/with-route";

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
export const saveMemberView = (ctx: Ctx, args: Parameters<typeof keepMemberView>[1]) =>
  keepMemberView(ctx.supabase, args);
