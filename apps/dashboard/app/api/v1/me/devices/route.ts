import { write, account } from "@/server/route";
import { AppError, parseDevice } from "@chanlytics/contracts";

/**
 * PUT /api/v1/me/devices — {token, platform, app_version?}: the phone the native app runs on, registered to be
 * told. Yours alone, no workspace involved, so it is declared on the account; the definer door re-owns a token
 * another account held (the same phone, signed in as someone else). Counted, because a loop in the app would
 * otherwise write on every launch.
 */
export const PUT = write({
  scope: account,
  role: null,
  rate: "device_register",
  handle: async ({ ctx, req }) => {
    const parsed = parseDevice(await req.json().catch(() => ({})));
    if (!parsed.ok) throw new AppError("validation", parsed.reason, 400);
    const { device } = parsed;
    const { data, error } = await ctx.supabase.rpc("push_device_register", {
      p_token: device.token,
      p_platform: device.platform,
      ...(device.app_version ? { p_app_version: device.app_version } : {}),
      ...(device.activity_token ? { p_activity_token: device.activity_token } : {}),
    });
    if (error) throw new AppError("validation", error.message, 400);
    return data as { id: string };
  },
});

/** DELETE /api/v1/me/devices — {token}: sign-out on the phone. Someone else's row with that token is not yours to forget. */
export const DELETE = write({
  scope: account,
  role: null,
  rate: "device_register",
  handle: async ({ ctx, req }) => {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) throw new AppError("validation", "A device needs its push token.", 400);
    const { data, error } = await ctx.supabase.rpc("push_device_forget", { p_token: token });
    if (error) throw new AppError("validation", error.message, 400);
    return data as { forgotten: number };
  },
});
