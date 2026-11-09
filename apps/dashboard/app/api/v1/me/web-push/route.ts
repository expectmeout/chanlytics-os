import { AppError, recordOrEmpty } from "@chanlytics/contracts";
import { forgetWebPush, keepWebPush } from "@chanlytics/db/workspace";
import { write, account } from "@/server/shared/route";

/**
 * POST /api/v1/me/web-push — this browser said yes to being told (D12 of the answers canvas). Body: its subscription as the
 * browser gives it, { endpoint, keys: { p256dh, auth } }. A person's own, as their phones are: RLS is the door.
 *
 * DELETE /api/v1/me/web-push — this browser is told no more. Body { endpoint }.
 */
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export const POST = write({
  scope: account,
  role: null,
  rate: null,
  handle: async ({ ctx, req }) => {
    const body = recordOrEmpty(await req.json().catch(() => null));
    const keys = recordOrEmpty(body.keys);
    const endpoint = clean(body.endpoint, 1000);
    const p256dh = clean(keys.p256dh, 200);
    const auth = clean(keys.auth, 200);
    if (!/^https:\/\//.test(endpoint) || !p256dh || !auth)
      throw new AppError("validation", "That is not a browser's subscription.");
    await keepWebPush(ctx.supabase, {
      userId: ctx.userId,
      endpoint,
      p256dh,
      auth,
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null,
    });
    return { kept: true };
  },
});

export const DELETE = write({
  scope: account,
  role: null,
  rate: null,
  handle: async ({ ctx, req }) => {
    const body = recordOrEmpty(await req.json().catch(() => null));
    await forgetWebPush(ctx.supabase, ctx.userId, clean(body.endpoint, 1000));
    return { kept: false };
  },
});
