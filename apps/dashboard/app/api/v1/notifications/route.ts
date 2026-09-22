import { z } from "zod";
import { AppError, type NotificationDto, type NotificationsDto } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";

const KEEP_DAYS = 30;
const LIMIT = 60;

/**
 * GET /api/v1/notifications — the workspace's kept notifications of the last
 * thirty days, newest first, with this person's own marks on each row and
 * when they last opened the bell.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const tenantId = member.tenantId;
    const since = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    const sb = ctx.supabase;
    const [rows, seen] = await Promise.all([
      sb
        .from("notifications")
        .select("id, kind, title, body, route, subject_type, subject_id, created_at")
        .eq("tenant_id", tenantId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(LIMIT),
      sb.from("notification_reads").select("seen_at").eq("tenant_id", tenantId).eq("user_id", ctx.userId).maybeSingle(),
    ]);
    if (rows.error) throw new Error(rows.error.message);
    if (seen.error) throw new Error(seen.error.message);
    // The marks for THESE notifications. Read in parallel it could name no ids,
    // so it fetched every mark this person has ever left, in every workspace
    // they belong to -- a row per notification per user, kept for ever, to
    // build a map consulted at most LIMIT times. One more round trip bounds it.
    const ids = (rows.data ?? []).map((r) => r.id);
    const marks = ids.length
      ? await sb
          .from("notification_marks")
          .select("notification_id, read_at, dismissed_at")
          .eq("user_id", ctx.userId)
          .in("notification_id", ids)
      : { data: [], error: null };
    if (marks.error) throw new Error(marks.error.message);
    const byId = new Map((marks.data ?? []).map((m) => [m.notification_id, m]));
    const notifications: NotificationDto[] = (rows.data ?? []).map((r) => {
      const m = byId.get(r.id);
      return {
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        route: r.route,
        subject_type: r.subject_type,
        subject_id: r.subject_id,
        created_at: r.created_at,
        read: !!m?.read_at,
        dismissed: !!m?.dismissed_at,
      };
    });
    const out: NotificationsDto = { notifications, seen_at: seen.data?.seen_at ?? null };
    return out;
  },
});

const Mark = z.object({
  seen: z.boolean().optional(),
  id: z.string().optional(),
  read: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

/**
 * PUT /api/v1/notifications — { seen: true }, or { id, read?, dismissed? }:
 * this person's own marks, which every member may make (a viewer reads the
 * bell too). The definer functions write only the caller's rows.
 */
export const PUT = write({
  scope: workspace,
  role: "viewer",
  rate: "notify_mark",
  input: Mark,
  handle: async ({ ctx, member, input: body }) => {
    const tenantId = member.tenantId;
    if (body.seen === true) {
      const { data, error } = await ctx.supabase.rpc("notifications_seen", { p_tenant_id: tenantId });
      if (error) throw new AppError("validation", error.message);
      return { seen_at: ((data ?? {}) as { seen_at?: string }).seen_at ?? null };
    }
    if (typeof body.id !== "string")
      throw new AppError("validation", "Send { seen: true } or { id, read?, dismissed? }.");
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
  },
});
