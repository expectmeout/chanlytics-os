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

/**
 * DELETE /api/v1/me — delete your own account (App Store 5.1.1(v); 00190). The door refuses the only owner of a
 * workspace with other members, who must make someone else an owner first; that refusal is a conflict the page says
 * in the door's own words. On success the session is ended here too, so the page that asked lands on the sign-in.
 */
export const DELETE = write({
  scope: account,
  role: null,
  rate: "profile_set",
  handle: async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc("delete_my_account");
    if (error) {
      if (error.message.includes("sole_owner")) {
        throw new AppError(
          "conflict",
          "You are the only owner of a workspace with other members. Make someone else an owner first.",
          409,
        );
      }
      throw new AppError("validation", error.message, 400);
    }
    await ctx.supabase.auth.signOut().catch(() => undefined);
    const left =
      data && typeof data === "object" && !Array.isArray(data)
        ? Number((data as { workspaces_left_empty?: unknown }).workspaces_left_empty ?? 0)
        : 0;
    return { deleted: true, workspaces_left_empty: left };
  },
});
