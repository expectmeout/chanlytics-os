import { z } from "zod";
import { ROLES } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { setMemberRole, removeMember } from "@/server/service";
import { requireUuid } from "@/server/request-guards";

const Body = z.object({
  role: z.enum(ROLES as unknown as [string, ...string[]], { message: "Unknown role." }),
});

/**
 * PATCH /api/v1/team/:id — {role}. Owner-only; the last owner is immovable
 * (the service refuses it). Thirty team changes an hour: one person
 * reshaping a roster stays well under it; a script does not.
 */
export const PATCH = write({
  scope: workspace,
  role: "owner",
  rate: "team",
  input: Body,
  handle: async ({ ctx, member, input }) =>
    await setMemberRole(ctx, member.tenantId, requireUuid(ctx.params.id, "member"), input.role as "owner" | "operator" | "viewer"),
});

/** DELETE /api/v1/team/:id — remove a member (or revoke an open invite). Owner-only. */
export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "team",
  handle: async ({ ctx, member }) => await removeMember(ctx, member.tenantId, requireUuid(ctx.params.id, "member"), ctx.userId),
});
