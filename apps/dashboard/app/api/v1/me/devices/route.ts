import { z } from "zod";
import { write, account } from "@/server/shared/route";
import { AppError, parseDevice } from "@chanlytics/contracts";
import { dbRefusal } from "@/server/shared/with-route";
import { forgetDevice, registerDevice } from "@/server/notices/bell";

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
    const { data, error } = await registerDevice(ctx, {
      p_token: device.token,
      p_platform: device.platform,
      ...(device.app_version ? { p_app_version: device.app_version } : {}),
      ...(device.activity_token ? { p_activity_token: device.activity_token } : {}),
    });
    if (error) throw dbRefusal(error);
    return data as { id: string };
  },
});

/** DELETE /api/v1/me/devices — {token}: sign-out on the phone. Someone else's row with that token is not yours to forget. */
export const DELETE = write({
  scope: account,
  role: null,
  rate: "device_register",
  input: z.object({ token: z.string().nullish() }),
  handle: async ({ ctx, input }) => {
    const token = (input.token ?? "").trim();
    if (!token) throw new AppError("validation", "A device needs its push token.", 400);
    const { data, error } = await forgetDevice(ctx, { p_token: token });
    if (error) throw dbRefusal(error);
    return data as { forgotten: number };
  },
});
