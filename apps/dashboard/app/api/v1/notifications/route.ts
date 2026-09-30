import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { load, readerContext } from "@/server/readers";
import { notifications } from "@/server/readers/notifications";
import { dbRefusal } from "@/server/with-route";

/**
 * GET /api/v1/notifications — the workspace's kept notifications of the last
 * thirty days, newest first, with this person's own marks on each row and
 * when they last opened the bell. The body is its reader's (readers/notifications.ts).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), notifications, undefined)).data,
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
      if (error) throw dbRefusal(error);
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
    if (error) throw dbRefusal(error);
    return { notification_id: id, read, dismissed };
  },
});
