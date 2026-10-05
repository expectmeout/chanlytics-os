/**
 * Bringing a new workspace into existence (app/api/v1/workspaces/create): the body it takes, the sign-up door for an
 * account that arrived through a provider, the partner's cookie, the create_workspace function that is the one audited
 * place the privilege exists, and what follows a made workspace (the platform's notice, the creator's first alert
 * address, the sign-up answers cleared from the user's metadata). The route declares who may and how often, and says
 * why it names no role.
 */
import {
  AppError,
  firstWorkspaceDoor,
  signupPosture,
  PENDING_WORKSPACE_KEY,
  pendingWorkspaceOf,
  pendingCodeOf,
  InviteCodeSchema,
  partnerCodeFromCookie,
} from "@chanlytics/contracts";
import { createWorkspaceFn, membershipCountOf } from "@chanlytics/db";
import { z } from "zod";
import { inviteCodeMatches, notifyPlatformSignup } from "@/server/platform/signup";
import { giveFirstAlertAddress } from "@/server/workspace/first-alert";
import { env } from "@/server/env";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";

/** The error Postgres or PostgREST answers a call with an argument the function does not take. */
const noSuchSignature = (code: string | null | undefined, message: string): boolean =>
  code === "42883" || code === "PGRST202" || /could not find the function/i.test(message);

const Body = z
  .object({
    name: z.string().trim().min(2, "A workspace needs a name of at least 2 characters.").max(120),
    /** IANA zone. Optional — the function defaults it and validates it. */
    timezone: z.string().trim().min(1).max(64).optional(),
    /** The invite code, asked of a first workspace when sign-up is by invitation. */
    code: InviteCodeSchema.optional(),
    /** The partner's code the person agreed to add to their team, as the create screen asked (0012). */
    partner: z.string().trim().max(40).optional(),
  })
  .strict();

/** Postgres error codes the function raises deliberately, mapped to the wire. */
const RAISED: Record<string, { code: "validation" | "forbidden" | "conflict"; status: number }> = {
  "22023": { code: "validation", status: 400 }, // bad name or unknown timezone
  "54000": { code: "conflict", status: 409 }, // per-account workspace cap
  "28000": { code: "forbidden", status: 403 }, // no auth.uid() behind the session
};

export async function createWorkspace(ctx: RouteContext, req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError("validation", parsed.error.issues[0]?.message ?? "Give the workspace a name.");
  }

  // The door (see the route's header): the posture, for an account with no membership
  // yet. Counted on the session client, which sees only its own rows.
  // The error is read: `count` comes back null on a failed read, which the
  // door takes for "no memberships" -- so an owner making their second
  // workspace would be refused with a wrong-invite-code message, for a field
  // the create screen never showed them.
  const memberships = await membershipCountOf(ctx.supabase, ctx.userId);
  const door = firstWorkspaceDoor({
    posture: signupPosture(env.SIGNUP_CODE),
    memberships,
    // The code typed here, or the one sign-up checked and kept (pendingCodeOf): so the first workspace is made
    // from sign-up's answers with nothing typed twice, and a code that stopped being right stops opening it.
    codeMatches: inviteCodeMatches(parsed.data.code) || inviteCodeMatches(pendingCodeOf(ctx.metadata)),
  });
  if (!door.open) throw new AppError(door.code, door.message);

  // A partner's link leaves a cookie (0012), but a partner joins a team only with the owner's yes: the create
  // screen names the partner and sends their code back when the person agrees. A cookie with no yes beside it,
  // or a yes for some other code, credits nobody and seats nobody.
  const cookieCode = partnerCodeFromCookie(req.headers.get("cookie"));
  const partnerCode = cookieCode && parsed.data.partner === cookieCode ? cookieCode : null;
  const args = { p_name: parsed.data.name, p_timezone: parsed.data.timezone ?? undefined };
  let { data, error } = await createWorkspaceFn(
    ctx.supabase,
    partnerCode ? { ...args, p_partner_code: partnerCode } : args,
  );
  if (error && partnerCode && noSuchSignature(error.code, error.message)) {
    log.error("partner_code_dropped", { code: partnerCode, error: error.message });
    ({ data, error } = await createWorkspaceFn(ctx.supabase, args));
  }

  if (error) {
    // The messages on these codes are written for an owner to read — the
    // function raises "Unknown timezone: Mars/Olympus", not a constraint name —
    // so they are passed through rather than replaced with something vaguer.
    const mapped = RAISED[error.code ?? ""];
    if (mapped) throw new AppError(mapped.code, error.message, mapped.status);
    throw new Error(error.message);
  }
  // A call that raised nothing answers one row; none is the database's fault, not a workspace to hand over.
  if (!data) throw new Error("create_workspace answered no row");

  // The platform mailbox hears about a new workspace from the one place
  // workspaces are made. Bounded and best-effort: the workspace exists whether
  // or not the notice gets through.
  await notifyPlatformSignup(data.id, ctx.email ?? "", ctx.userId);

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
      if (clearErr) log.error("pending_workspace_clear_failed", { error: clearErr.message });
    } catch (e) {
      log.error("pending_workspace_clear_failed", { error: e });
    }
  }

  // Returned in the same shape /api/v1/workspaces lists, so the client can put
  // it straight into its workspace list without a second round trip.
  return { workspace: data };
}
