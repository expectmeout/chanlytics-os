import { write, account } from "@/server/route";
import { AppError, cleanDisplayName } from "@chanlytics/contracts";

/**
 * PUT /api/v1/me — {display_name}: the name you go by. Yours alone to set;
 * no workspace is involved, so it is declared on the account. Empty clears
 * it, and the app falls back to the words it always had: "Your account" for
 * you, the email for a member. Counted as name changes.
 */
export const PUT = write({
  scope: account,
  role: null,
  rate: "profile_set",
  handle: async ({ ctx, req }) => {
    const body = (await req.json().catch(() => ({}))) as { display_name?: unknown };
    const cleaned = cleanDisplayName(body.display_name ?? "");
    if (!cleaned.ok) throw new AppError("validation", cleaned.reason, 400);
    const { data, error } = await ctx.supabase.rpc("profile_set", { p_display_name: cleaned.name });
    if (error) throw new AppError("validation", error.message, 400);
    const saved =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as { display_name?: string }).display_name
        : cleaned.name;
    return { display_name: saved ?? cleaned.name };
  },
});
