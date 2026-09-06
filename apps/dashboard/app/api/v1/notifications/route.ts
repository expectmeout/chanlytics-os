import { AppError, type NotificationDto, type NotificationsDto } from "@chanlytics/contracts";
import { withRoute, memberContext } from "@/server/with-route";
import { jsonBody, requireUuid } from "@/server/request-guards";
import { takeRate } from "@/server/rate-limit";

const KEEP_DAYS = 30;
const LIMIT = 60;

/**
 * GET /api/v1/notifications — what needed this workspace's attention, kept.
 *
 * The last month of rows the edge wrote, newest first, with this person's
 * marks and their "seen everything" moment, so the bell can decide unread
 * the same way on every device. Members read under their own RLS.
 */
export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
  const sb = ctx.supabase;
  const [rows, marks, seen] = await Promise.all([
    sb.from("notifications").select("id, kind, title, body, route, subject_type, subject_id, created_at")
      .eq("tenant_id", tenantId).gte("created_at", since).order("created_at", { ascending: false }).limit(LIMIT),
    sb.from("notification_marks").select("notification_id, read_at, dismissed_at").eq("user_id", ctx.userId),
    sb.from("notification_reads").select("seen_at").eq("tenant_id", tenantId).eq("user_id", ctx.userId).maybeSingle(),
  ]);
  if (rows.error) throw new Error(rows.error.message);
  if (marks.error) throw new Error(marks.error.message);
  if (seen.error) throw new Error(seen.error.message);
  const byId = new Map((marks.data ?? []).map((m) => [m.notification_id, m]));
  const notifications: NotificationDto[] = (rows.data ?? []).map((r) => {
    const m = byId.get(r.id);
    return {
      id: r.id, kind: r.kind, title: r.title, body: r.body, route: r.route,
      subject_type: r.subject_type, subject_id: r.subject_id, created_at: r.created_at,
      read: !!m?.read_at, dismissed: !!m?.dismissed_at,
    };
  });
  const out: NotificationsDto = { notifications, seen_at: seen.data?.seen_at ?? null };
  return out;
});

/**
 * PUT /api/v1/notifications — { seen: true } or { id, read?, dismissed? }.
 *
 * "Mark all read" moves this person's seen moment for the workspace; a row's
 * marks are this person's too. Both through definer doors, any member.
 */
export const PUT = withRoute(async (req, ctx) => {
  takeRate(ctx.userId, "notify_mark");
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  const body = (await jsonBody(req)) as { seen?: unknown; id?: unknown; read?: unknown; dismissed?: unknown } | null;
  if (body?.seen === true) {
    const { data, error } = await ctx.supabase.rpc("notifications_seen", { p_tenant_id: tenantId });
    if (error) throw new AppError("validation", error.message);
    return { seen_at: ((data ?? {}) as { seen_at?: string }).seen_at ?? null };
  }
  if (typeof body?.id !== "string") throw new AppError("validation", "Send { seen: true } or { id, read?, dismissed? }.");
  const id = requireUuid(body.id, "notification");
  const read = typeof body.read === "boolean" ? body.read : undefined;
  const dismissed = typeof body.dismissed === "boolean" ? body.dismissed : undefined;
  if (read === undefined && dismissed === undefined) throw new AppError("validation", "Nothing to mark.");
  const { error } = await ctx.supabase.rpc("notification_mark", {
    p_id: id,
    ...(read !== undefined ? { p_read: read } : {}),
    ...(dismissed !== undefined ? { p_dismissed: dismissed } : {}),
  });
  if (error) throw new AppError("validation", error.message);
  return { notification_id: id, read, dismissed };
});
