import { z } from "zod";
import { forgetWebPush, keepWebPush } from "@chanlytics/db/workspace";
import { write, account } from "@/server/shared/route";

/**
 * POST /api/v1/me/web-push — this browser said yes to being told (D12 of the answers canvas). Body: its subscription as the
 * browser gives it, { endpoint, keys: { p256dh, auth } }. A person's own, as their phones are: RLS is the door.
 *
 * DELETE /api/v1/me/web-push — this browser is told no more. Body { endpoint }.
 */
const ENDPOINT = z.string().max(1000);

export const POST = write({
  scope: account,
  role: null,
  rate: null,
  input: z.object({
    endpoint: ENDPOINT.regex(/^https:\/\//, "That is not a browser's subscription."),
    keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(200) }),
  }),
  handle: async ({ ctx, req, input }) => {
    await keepWebPush(ctx.supabase, {
      userId: ctx.userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null,
    });
    return { kept: true };
  },
});

export const DELETE = write({
  scope: account,
  role: null,
  rate: null,
  input: z.object({ endpoint: ENDPOINT }),
  handle: async ({ ctx, input }) => {
    await forgetWebPush(ctx.supabase, ctx.userId, input.endpoint);
    return { kept: false };
  },
});
