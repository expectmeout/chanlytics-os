import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { SETUP_REQUEST_KINDS, isOneOf } from "@chanlytics/contracts";
import { tellPlatformOfSetupRequest } from "@/server/workspace/tell";
import { dbRefusal } from "@/server/shared/with-route";
import { requestWorkspaceSetup } from "@/server/setup/setup";

const ASK = "Say what you are asking for.";
const Body = z.object({
  what: z.string({ message: ASK }).refine((w) => isOneOf(SETUP_REQUEST_KINDS, w), ASK),
});

/**
 * POST /api/v1/setup/request — {what: "line" | "port" | "repair" | "forwarding" | "name"}.
 *
 * The owner asks a person at Chanlytics for something the product cannot do
 * by itself yet: a phone line, bringing the number they have over, or
 * repairing a configuration the receptionist can no longer read (00123), or
 * setting up forwarding in an office phone system with them on a call (00173),
 * or changing the name the carriers hold for its texting (00439).
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
    const subject = input.what;
    const { data, error } = await requestWorkspaceSetup(ctx, { p_tenant_id: member.tenantId, p_what: subject });
    if (error) throw dbRefusal(error, { code: "conflict", status: 409 });
    const already = !!(
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as { already?: unknown }).already === true
    );
    const wasTold = already
      ? false
      : await tellPlatformOfSetupRequest(member.tenantId, subject, ctx.email ?? null, ctx.userId);
    return { request: data, told: wasTold };
  },
});
