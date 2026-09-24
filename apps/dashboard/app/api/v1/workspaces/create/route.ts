import { write, account } from "@/server/route";
import {
  AppError,
  firstWorkspaceDoor,
  signupPosture,
  PENDING_WORKSPACE_KEY,
  pendingWorkspaceOf,
  pendingCodeOf,
  InviteCodeSchema,
} from "@chanlytics/contracts";
import { z } from "zod";
import { inviteCodeMatches, notifyPlatformSignup } from "@/server/signup";
import { giveFirstAlertAddress } from "@/server/first-alert";

/**
 * POST /api/v1/workspaces/create — bring a new workspace into existence.
 *
 * NOTE THE ABSENT ROLE CHECK, which is deliberate. Every other mutating route
 * names a role against a workspace the caller already belongs to. There is
 * no such workspace here: this is the one write that creates the thing roles
 * are scoped to, so it is declared on the account, with no role to name. The
 * authorisation that matters is the session itself, and the function reads
 * the caller from auth.uid() rather than trusting anything sent.
 *
 * Neither `tenants` nor `memberships` has an INSERT policy — on purpose, since
 * one on tenants would let any signed-in user mint rows, and one on memberships
 * would let them join a workspace nobody invited them to. So the write goes
 * through create_workspace (00021), a security-definer function that is the
 * single audited place this privilege exists. Service-role never enters the
 * request path.
 *
 * Every workspace starts here, the first one included: sign-up keeps what its
 * form said on the auth user and makes nothing, and the person who enters the
 * code lands on the create screen with those answers filled in. A workspace
 * exists only for a person who has proved the inbox that owns it.
 *
 * AND IT IS THE DOOR, for an account that arrived through a provider. The
 * email form asks the sign-up posture at /api/v1/signup before any user
 * exists; Sign in with Google makes the user first, so the posture is asked
 * here, where every first workspace is made -- and only of an account with no
 * membership yet. Somebody already inside was let in by an invitation or by
 * their first workspace, and makes the next one without a code.
 *
 * The body stays the route's own to read: the first issue's message is what
 * the create screen shows, without a field name in front of it.
 */

const Body = z
  .object({
    name: z.string().trim().min(2, "A workspace needs a name of at least 2 characters.").max(120),
    /** IANA zone. Optional — the function defaults it and validates it. */
    timezone: z.string().trim().min(1).max(64).optional(),
    /** The invite code, asked of a first workspace when sign-up is by invitation. */
    code: InviteCodeSchema.optional(),
  })
  .strict();

/** Postgres error codes the function raises deliberately, mapped to the wire. */
const RAISED: Record<string, { code: "validation" | "forbidden" | "conflict"; status: number }> = {
  "22023": { code: "validation", status: 400 }, // bad name or unknown timezone
  "54000": { code: "conflict", status: 409 }, // per-account workspace cap
  "28000": { code: "forbidden", status: 403 }, // no auth.uid() behind the session
};

export const POST = write({
  scope: account,
  role: null,
  rate: "create_workspace",
  handle: async ({ ctx, req }) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new AppError("validation", parsed.error.issues[0]?.message ?? "Give the workspace a name.");
    }

    // The door (see the header): the posture, for an account with no membership
    // yet. Counted on the session client, which sees only its own rows.
    // The error is read: `count` comes back null on a failed read, which the
    // door takes for "no memberships" -- so an owner making their second
    // workspace would be refused with a wrong-invite-code message, for a field
    // the create screen never showed them.
    const { count, error: countErr } = await ctx.supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", ctx.userId);
    if (countErr) throw new Error(`memberships_count: ${countErr.message}`);
    const door = firstWorkspaceDoor({
      posture: signupPosture(process.env.SIGNUP_CODE),
      memberships: count ?? 0,
      // The code typed here, or the one sign-up checked and kept (pendingCodeOf): so the first workspace is made
      // from sign-up's answers with nothing typed twice, and a code that stopped being right stops opening it.
      codeMatches: inviteCodeMatches(parsed.data.code) || inviteCodeMatches(pendingCodeOf(ctx.metadata)),
    });
    if (!door.open) throw new AppError(door.code, door.message);

    const { data, error } = await ctx.supabase
      .rpc("create_workspace", { p_name: parsed.data.name, p_timezone: parsed.data.timezone ?? undefined })
      .single();

    if (error) {
      // The messages on these codes are written for an owner to read — the
      // function raises "Unknown timezone: Mars/Olympus", not a constraint name —
      // so they are passed through rather than replaced with something vaguer.
      const mapped = RAISED[error.code ?? ""];
      if (mapped) throw new AppError(mapped.code, error.message, mapped.status);
      throw new Error(error.message);
    }

    // The platform mailbox hears about a new workspace from the one place
    // workspaces are made. Bounded and best-effort: the workspace exists whether
    // or not the notice gets through.
    await notifyPlatformSignup(data.id, ctx.email ?? "");

    // The creator hears from their own workspace: their address is its first alert
    // address, the one Settings › Notifications shows and changes. Without it every
    // "a customer needs you" went to the platform, redacted, and the owner was never
    // told. Best effort, like the notice above.
    await giveFirstAlertAddress(ctx.supabase, data.id, ctx.email, ctx.userId);

    // The name typed at sign-up rode in the user's metadata to prefill this
    // screen (signup.ts); the workspace exists now, so it goes -- or the next
    // "create a workspace" screen would offer a name already taken. Best
    // effort: metadata that would not clear must not fail a workspace made.
    if (pendingWorkspaceOf(ctx.metadata)) {
      try {
        const { error: clearErr } = await ctx.supabase.auth.updateUser({ data: { [PENDING_WORKSPACE_KEY]: null } });
        if (clearErr) console.error("pending_workspace_clear_failed", clearErr.message);
      } catch (e) {
        console.error("pending_workspace_clear_failed", e instanceof Error ? e.message : String(e));
      }
    }

    // Returned in the same shape /api/v1/workspaces lists, so the client can put
    // it straight into its workspace list without a second round trip.
    return { workspace: data };
  },
});
