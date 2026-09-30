import { write, account } from "@/server/route";
import { AppError, cleanDisplayName } from "@chanlytics/contracts";
import { endEmptiedWorkspaces } from "@/server/workspace/billing";
import { log } from "@/server/log";
import { dbRefusal } from "@/server/with-route";

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
    if (error) throw dbRefusal(error);
    const saved =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as { display_name?: string }).display_name
        : cleaned.name;
    return { display_name: saved ?? cleaned.name };
  },
});

/**
 * DELETE /api/v1/me — delete your own account (App Store 5.1.1(v); 00190, 00208). The door refuses by name the only
 * owner of a workspace with other members, who must make someone else an owner first, and a partner whose record
 * holds workspaces or money, which the platform closes first; each refusal is a conflict the page says in its own
 * words. Anything else the door says is not the person's to read: it is logged, and they are told nothing changed.
 * On success the session is ended here too, so the page that asked lands on the sign-in. A workspace the person was
 * the only member of is ended (00262): the door pauses it, and its plan is ended here, through the edge's billing door.
 */
const REFUSALS: Record<string, string> = {
  sole_owner: "You are the only owner of a workspace with other members. Make someone else an owner first.",
  partner_records:
    "Your partner record holds workspaces you brought or money you earned. Write to us to close it first.",
};

export const DELETE = write({
  scope: account,
  role: null,
  rate: "profile_set",
  handle: async ({ ctx }) => {
    const { data, error } = await ctx.supabase.rpc("delete_my_account");
    if (error) {
      const named = Object.keys(REFUSALS).find((k) => error.message.includes(k));
      if (named) throw new AppError("conflict", REFUSALS[named], 409);
      log.error("account_delete_failed", { message: error.message.slice(0, 200) });
      throw new AppError(
        "internal",
        "Your account could not be deleted. Nothing was changed. Try again, or write to us.",
      );
    }
    await ctx.supabase.auth.signOut().catch(() => undefined);
    const answer = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
    const left = Number(answer.workspaces_left_empty ?? 0);
    await endEmptiedWorkspaces(answer.workspaces_emptied);
    return { deleted: true, workspaces_left_empty: left };
  },
});
