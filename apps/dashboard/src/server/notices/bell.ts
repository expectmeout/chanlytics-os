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
 * Mark all read, or its Undo with the moment to go back to (00614, 00622, decision 0124): the member's look and how
 * far they have read as the door left them, and where read-through stood before (`was`, which a read alone answers).
 * A read (`read`) with a moment goes up to it, the newest note the bell had listed, never past now and never back;
 * with none it goes up to now. A moment that is no read is the Undo. The door's refusal is raised in its own words.
 */
export async function markBellReadThrough(ctx: Ctx, tenantId: TenantId, through: string | undefined, read: boolean) {
  const { data, error } = await markNotificationsReadThrough(ctx.supabase, {
    p_tenant_id: tenantId,
    ...(through !== undefined ? { p_through: through } : {}),
    ...(read && through !== undefined ? { p_read: true } : {}),
  });
  if (error) throw dbRefusal(error);
  const moments = readAnswer("notifications_read_through", ReadThrough, data ?? {});
  return {
    seen_at: moments.seen_at ?? null,
    read_through_at: moments.read_through_at ?? null,
    was: moments.was ?? null,
  };
}

/** What the database says of a note that is not there for this member: purged, or another workspace's. */
const NOT_THERE = "P0002";

/**
 * Several notes read by one press (a group's check in the bell), each through the member's own door, so a note of
 * another workspace is not there, as it is for one. A note that has left since the bell listed it is passed over; any
 * other refusal is raised in the door's words. Answers how many the door read.
 */
export async function markManyRead(ctx: Ctx, ids: readonly string[]) {
  const answers = await Promise.all(ids.map((id) => markNotification(ctx.supabase, { p_id: id, p_read: true })));
  const refused = answers.find((a) => a.error && a.error.code !== NOT_THERE);
  if (refused?.error) throw dbRefusal(refused.error);
  return { read: answers.filter((a) => !a.error).length };
}

export const saveMemberView = (ctx: Ctx, args: Parameters<typeof keepMemberView>[1]) =>
  keepMemberView(ctx.supabase, args);
