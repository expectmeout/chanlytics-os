import { z } from "zod";
import { AppError } from "@chanlytics/contracts";
import { read, write, workspace } from "@/server/shared/route";
import { requireUuid } from "@/server/shared/request-guards";
import { load, readerContext } from "@/server/shared/reader";
import { notifications } from "@/server/readers/notifications";
import { dbRefusal } from "@/server/shared/with-route";
import { markBellReadThrough, markBellSeen, markOne } from "@/server/notices/bell";

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
  read_all: z.boolean().optional(),
  read_through: z.iso.datetime({ offset: true, message: "read_through is a moment, in ISO 8601." }).optional(),
  id: z.string().optional(),
  read: z.boolean().optional(),
  dismissed: z.boolean().optional(),
});

/**
 * PUT /api/v1/notifications — { seen: true } (the member looked: the number starts again, no note is read),
 * { read_all: true } (Mark all read: every note up to now is read, and looked at; answers `was`, the moment they had
 * read through before), { read_through } (its Undo: back to that moment, never forward), or { id, read?, dismissed? }:
 * this person's own marks, which every member may make (a viewer reads the bell too). The definer functions write only
 * the caller's rows.
 */
export const PUT = write({
  scope: workspace,
  role: "viewer",
  rate: "notify_mark",
  input: Mark,
  handle: async ({ ctx, member, input: body }) => {
    const tenantId = member.tenantId;
    if (body.read_all === true || body.read_through !== undefined)
      return markBellReadThrough(ctx, tenantId, body.read_through);
    if (body.seen === true) {
      const { data, error } = await markBellSeen(ctx, { p_tenant_id: tenantId });
      if (error) throw dbRefusal(error);
      return { seen_at: ((data ?? {}) as { seen_at?: string }).seen_at ?? null };
    }
    if (typeof body.id !== "string")
      throw new AppError("validation", "Send { seen: true }, { read_all: true } or { id, read?, dismissed? }.");
    const id = requireUuid(body.id, "notification");
    const read = typeof body.read === "boolean" ? body.read : undefined;
    const dismissed = typeof body.dismissed === "boolean" ? body.dismissed : undefined;
    if (read === undefined && dismissed === undefined) throw new AppError("validation", "Nothing to mark.");
    const { error } = await markOne(ctx, {
      p_id: id,
      ...(read !== undefined ? { p_read: read } : {}),
      ...(dismissed !== undefined ? { p_dismissed: dismissed } : {}),
    });
    if (error) throw dbRefusal(error);
    return { notification_id: id, read, dismissed };
  },
});
