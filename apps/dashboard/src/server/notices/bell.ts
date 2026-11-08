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
} from "@chanlytics/db/notices";
import type { RouteContext } from "@/server/shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

export const registerDevice = (ctx: Ctx, args: Parameters<typeof registerPushDevice>[1]) =>
  registerPushDevice(ctx.supabase, args);
export const forgetDevice = (ctx: Ctx, args: Parameters<typeof forgetPushDevice>[1]) =>
  forgetPushDevice(ctx.supabase, args);
export const markOne = (ctx: Ctx, args: Parameters<typeof markNotification>[1]) => markNotification(ctx.supabase, args);
export const markBellSeen = (ctx: Ctx, args: Parameters<typeof markNotificationsSeen>[1]) =>
  markNotificationsSeen(ctx.supabase, args);
export const saveMemberView = (ctx: Ctx, args: Parameters<typeof keepMemberView>[1]) =>
  keepMemberView(ctx.supabase, args);
