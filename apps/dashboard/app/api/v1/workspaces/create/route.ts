import { withRoute } from "@/server/with-route";
import { AppError } from "@chanlytics/contracts";
import { z } from "zod";
import { takeRate } from "@/server/rate-limit";

/**
 * POST /api/v1/workspaces/create — bring a new workspace into existence.
 *
 * NOTE THE ABSENT ROLE CHECK, which is deliberate. Every other mutating route
 * calls requireRole against a workspace the caller already belongs to. There is
 * no such workspace here: this is the one write that creates the thing roles
 * are scoped to. The authorisation that matters is the session itself, and the
 * function reads the caller from auth.uid() rather than trusting anything sent.
 *
 * Neither `tenants` nor `memberships` has an INSERT policy — on purpose, since
 * one on tenants would let any signed-in user mint rows, and one on memberships
 * would let them join a workspace nobody invited them to. So the write goes
 * through create_workspace (00021), a security-definer function that is the
 * single audited place this privilege exists. Service-role never enters the
 * request path.
 */

const Body = z
  .object({
    name: z.string().trim().min(2, "A workspace needs a name of at least 2 characters.").max(120),
    /** IANA zone. Optional — the function defaults it and validates it. */
    timezone: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

/** Postgres error codes the function raises deliberately, mapped to the wire. */
const RAISED: Record<string, { code: "validation" | "forbidden" | "conflict"; status: number }> = {
  "22023": { code: "validation", status: 400 }, // bad name or unknown timezone
  "54000": { code: "conflict", status: 409 },   // per-account workspace cap
  "28000": { code: "forbidden", status: 403 },  // no auth.uid() behind the session
};

export const POST = withRoute(async (req, ctx) => {
  takeRate(ctx.userId, "create_workspace");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    throw new AppError("validation", parsed.error.issues[0]?.message ?? "Give the workspace a name.");
  }

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

  // Returned in the same shape /api/v1/workspaces lists, so the client can put
  // it straight into its workspace list without a second round trip.
  return { workspace: data };
});
