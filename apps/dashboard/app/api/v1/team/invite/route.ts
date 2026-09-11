import { z } from "zod";
import { write, workspace } from "@/server/route";
import { inviteMember } from "@/server/service";

const Body = z.object({
  /** Stored lowercased at the door, so the same address invited twice is the same address. */
  email: z.string().trim().toLowerCase().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "That doesn't look like an email address."),
  role: z.enum(["operator", "viewer"], { message: "Invites can grant operator or viewer." }),
});

/**
 * POST /api/v1/team/invite — {email, role}. Owner-only. Sends the real
 * Supabase invite email and records the intent; accepting creates the
 * membership at the invited role. Owners are added by hand, not by invite —
 * the blast radius of a mistyped owner email is the whole workspace, which
 * is why the schema admits only the two lesser roles.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "invite",
  input: Body,
  handle: async ({ ctx, member, input }) => await inviteMember(ctx.supabase, member.tenantId, ctx.userId, input.email, input.role),
});
