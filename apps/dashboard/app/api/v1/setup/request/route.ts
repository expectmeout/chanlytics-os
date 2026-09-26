import { z } from "zod";
import { write, workspace } from "@/server/route";
import { AppError, SETUP_REQUEST_KINDS } from "@chanlytics/contracts";
import { tellPlatformOfSetupRequest } from "@/server/workspace/tell";

const ASK = "Say what you are asking for.";
const Body = z.object({
  what: z.string({ message: ASK }).refine((w) => (SETUP_REQUEST_KINDS as readonly string[]).includes(w), ASK),
});

/**
 * POST /api/v1/setup/request — {what: "line" | "port" | "repair" | "forwarding"}.
 *
 * The owner asks a person at Chanlytics for something the product cannot do
 * by itself yet: a phone line, bringing the number they have over, or
 * repairing a configuration the receptionist can no longer read (00123), or
 * setting up forwarding in an office phone system with them on a call (00173).
 * The RPC records it for the workspace's bell and for the
 * platform, once per day per thing; a first ask also emails the platform
 * mailbox through the edge (told: whether that went out). Operators may
 * ask; viewers may not.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "setup_request",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const what = input.what;
    const { data, error } = await ctx.supabase.rpc("setup_request", { p_tenant_id: member.tenantId, p_what: what });
    if (error) throw new AppError("conflict", error.message, 409);
    const already = !!(
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as { already?: unknown }).already === true
    );
    const told = already ? false : await tellPlatformOfSetupRequest(member.tenantId, what, ctx.email ?? null);
    return { request: data, told };
  },
});
