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
  WORKSPACE_MARKS,
  isOneOf,
} from "@chanlytics/contracts";
import { createWorkspaceFn, getMembershipCount, setSetupChoices } from "@chanlytics/db/workspace";
import { z } from "zod";
import { inviteCodeMatches, notifyPlatformSignup } from "@/server/workspace/signup";
import { giveFirstAlertAddress, giveOwnerAlertAddress } from "@/server/workspace/first-alert";
import { env } from "@/server/shared/env";
import { log } from "@/server/shared/log";
import type { RouteContext } from "@/server/shared/with-route";

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
  const memberships = await getMembershipCount(ctx.supabase, ctx.userId);
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
  // A database without the partner's argument yet makes the workspace without it, and the drop is logged (0012): the
  // workspace is made whichever deploys first.
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

  // What follows every workspace made, in one place (recordWorkspaceBegun): the platform's notice, the creator's address
  // as its first alert address, and sign-up's answers cleared.
  await recordWorkspaceBegun(ctx, data.id, { by: "created", notify: ctx.email ?? "", alertTo: ctx.email ?? null });

  // Returned in the same shape /api/v1/workspaces lists, so the client can put
  // it straight into its workspace list without a second round trip.
  return { workspace: data };
}

/**
 * What follows a workspace made, whichever way it was made (the onboarding PRD's item 7): the platform's notice, its
 * first alert address, the first run's marks it earned kept on the workspace (decision 0091), and sign-up's answers
 * cleared from the user's metadata. One place, so no way in forgets one: made from the create screen (`created`), a
 * lead's preview made theirs (`claimed`), set up by a partner for a business (`partner`, the address the owner is
 * invited at, beside any the partner keeps), or accepted from a partner (`accepted`, told to the platform at set-up).
 * Each is best effort: the workspace exists whether or not any of them lands.
 */
export async function recordWorkspaceBegun(
  ctx: RouteContext,
  tenantId: string,
  how: {
    by: "created" | "claimed" | "partner" | "accepted";
    /** The address the platform's notice names; null where the platform was told already. */
    notify: string | null;
    /** Whose address goes on the alert list. */
    alertTo: string | null;
    /** The first run's marks the workspace earned (a preview rehearsed and met). */
    marks?: readonly string[];
  },
): Promise<void> {
  if (how.notify !== null) await notifyPlatformSignup(tenantId, how.notify, ctx.userId);
  // The first alert address: the creator's own, or the owner's beside any address the partner chose. Without one,
  // every "a customer needs you" went to the platform, redacted, and the owner was never told.
  if (how.by === "created" || how.by === "claimed")
    await giveFirstAlertAddress(ctx.supabase, tenantId, how.alertTo, ctx.userId);
  else await giveOwnerAlertAddress(ctx.supabase, tenantId, how.alertTo, ctx.userId);
  const marks = (how.marks ?? []).filter((m): m is (typeof WORKSPACE_MARKS)[number] => isOneOf(WORKSPACE_MARKS, m));
  if (marks.length) {
    const { error } = await setSetupChoices(ctx.supabase, { p_tenant_id: tenantId, p_marks: marks });
    if (error) log.error("workspace_marks_not_kept", { tenant_id: tenantId, error: error.message });
  }
  if (how.by === "created" || how.by === "claimed") await clearPendingWorkspace(ctx);
}

/**
 * The name typed at sign-up rode in the user's metadata to prefill the create screen (signup.ts); a workspace exists
 * now, made or claimed (a preview made theirs, server/previews/claim.ts), so it goes -- or the next "create a
 * workspace" screen would offer a name already taken. Best effort: metadata that would not clear must not fail a
 * workspace made.
 */
async function clearPendingWorkspace(ctx: RouteContext): Promise<void> {
  if (!pendingWorkspaceOf(ctx.metadata)) return;
  try {
    const { error: clearErr } = await ctx.supabase.auth.updateUser({ data: { [PENDING_WORKSPACE_KEY]: null } });
    if (clearErr) log.error("pending_workspace_clear_failed", { error: clearErr.message });
  } catch (e) {
    log.error("pending_workspace_clear_failed", { error: e });
  }
}
