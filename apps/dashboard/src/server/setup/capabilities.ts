/**
 * Switching a capability on and off (app/api/v1/capabilities/:kind): the act recorded, who and when, on a row per
 * capability, with readiness computed from the workspace's records and refused when they say no. The row and its event
 * are one write, on the member's session (capability_activate / capability_deactivate, 00514). The activation body is
 * declared here for the route to name as its input. The routes declare who may and how often.
 */
import { z } from "zod";
import { AppError, CAPABILITY_KINDS, capabilityStatus, type CapabilityKind, isOneOf } from "@chanlytics/contracts";
import { activateCapabilityFn, deactivateCapabilityFn } from "@chanlytics/db/workspace";
import { dbRefusal } from "@/server/shared/with-route";
import { setupDtoFor } from "@/server/setup/setup";
import { tellOwnerLive } from "@/server/workspace/tell";
import type { Member, Params } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

export const ActivateBody = z.object({
  note: z.string().trim().max(200, "Two hundred characters at most.").optional(),
  /** The first run's Finish: the workspace's first activation of any channel emails the owner that it answers. */
  first_run: z.boolean().optional(),
});

function kindOf(raw: unknown): CapabilityKind {
  const k = String(raw ?? "");
  if (!isOneOf(CAPABILITY_KINDS, k)) throw new AppError("not_found", "No such capability.", 404);
  return k;
}

export async function activateCapability(
  ctx: RouteContext & { params: Params },
  member: Member,
  input: z.infer<typeof ActivateBody>,
) {
  const kind = kindOf(ctx.params.kind);
  const dto = await setupDtoFor(ctx.supabase, member.tenantId, { kind: "member" });
  const before = capabilityStatus(kind, dto);
  if (!before.ready)
    throw new AppError("conflict", `Not ready to activate: ${before.blockers[0]?.words ?? "the records say no."}`, 409);
  // The row and its event, one write (00514). `first` says this is the workspace's first activation of any channel.
  const { data, error } = await activateCapabilityFn(ctx.supabase, member.tenantId, kind, input.note ?? null);
  if (error) throw dbRefusal(error, { code: "forbidden", status: 403 });
  const row = (data ?? {}) as { activated_at?: string; first?: boolean };
  const now = row.activated_at ?? new Date().toISOString();
  // The first run's Finish, switching on the workspace's first channel (calls or WhatsApp alike, decision 0091): the
  // owner is emailed that it answers. Setup's own Activate on a workspace that has answered for months says nothing.
  const firstLive = input.first_run === true && row.first === true;
  const activations = [
    ...(dto.activations ?? []).filter((a) => a.capability !== kind),
    { capability: kind, activated_at: now, activated_by: ctx.userId, deactivated_at: null },
  ];
  const notice = firstLive ? await tellOwnerLive(member.tenantId, ctx.userId) : false;
  return { capability: kind, status: capabilityStatus(kind, { ...dto, activations }), told: notice };
}

export async function deactivateCapability(ctx: RouteContext & { params: Params }, member: Member) {
  const kind = kindOf(ctx.params.kind);
  const { data, error } = await deactivateCapabilityFn(ctx.supabase, member.tenantId, kind);
  if (error) throw dbRefusal(error, { code: "forbidden", status: 403 });
  const row = (data ?? {}) as { error?: string; deactivated_at?: string };
  if (row.error === "not_activated") throw new AppError("conflict", "This capability was not activated.", 409);
  return { capability: kind, deactivated_at: row.deactivated_at ?? new Date().toISOString() };
}
