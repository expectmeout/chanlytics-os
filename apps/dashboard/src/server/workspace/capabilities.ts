/**
 * Switching a capability on and off (app/api/v1/capabilities/:kind): the act recorded, who and when, on a row per
 * capability, with readiness computed from the workspace's records and refused when they say no. The activation body
 * is declared here for the route to name as its input. The routes declare who may and how often.
 */
import { z } from "zod";
import { AppError, CAPABILITY_KINDS, capabilityStatus, type CapabilityKind } from "@chanlytics/contracts";
import { emitEvent } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { setupDtoFor } from "@/server/workspace/setup";
import { tellOwnerLive } from "@/server/workspace/tell";
import type { Member, Params } from "@/server/route";
import type { RouteContext } from "@/server/with-route";

export const ActivateBody = z.object({
  note: z.string().trim().max(200, "Two hundred characters at most.").optional(),
  /** The first run's Finish: its first activation of calls emails the owner that the receptionist answers. */
  first_run: z.boolean().optional(),
});

function kindOf(raw: unknown): CapabilityKind {
  const k = String(raw ?? "");
  if (!(CAPABILITY_KINDS as readonly string[]).includes(k)) throw new AppError("not_found", "No such capability.", 404);
  return k as CapabilityKind;
}

export async function activateCapability(
  ctx: RouteContext & { params: Params },
  member: Member,
  input: z.infer<typeof ActivateBody>,
) {
  const kind = kindOf(ctx.params.kind);
  const dto = await setupDtoFor(ctx.supabase, member.tenantId, { kind: "member" });
  const before = capabilityStatus(kind, dto);
  // The first run's Finish, activating calls for the first time: the owner is emailed that it answers. Setup's own
  // Activate on a workspace that has answered for months is not a first run, and says nothing by email.
  const firstCalls =
    input.first_run === true && kind === "voice" && !(dto.activations ?? []).some((a) => a.capability === "voice");
  if (!before.ready)
    throw new AppError("conflict", `Not ready to activate: ${before.blockers[0]?.words ?? "the records say no."}`, 409);
  const now = new Date().toISOString();
  const { error } = await ctx.supabase.from("capability_activations").upsert(
    {
      tenant_id: member.tenantId,
      capability: kind,
      activated_at: now,
      activated_by: ctx.userId,
      deactivated_at: null,
      note: input.note ?? null,
    },
    { onConflict: "tenant_id,capability" },
  );
  if (error) throw new Error(error.message);
  // The row says who switched it on last; the ledger says each time, beside everything else an owner did.
  await emitEvent(serviceDb(), member.tenantId, "capability.activated", "workspace", member.tenantId, {
    capability: kind,
    by: ctx.userId,
  });
  const activations = [
    ...(dto.activations ?? []).filter((a) => a.capability !== kind),
    { capability: kind, activated_at: now, activated_by: ctx.userId, deactivated_at: null },
  ];
  const told = firstCalls ? await tellOwnerLive(member.tenantId, ctx.userId) : false;
  return { capability: kind, status: capabilityStatus(kind, { ...dto, activations }), told };
}

export async function deactivateCapability(ctx: RouteContext & { params: Params }, member: Member) {
  const kind = kindOf(ctx.params.kind);
  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("capability_activations")
    .update({ deactivated_at: now })
    .eq("tenant_id", member.tenantId)
    .eq("capability", kind)
    .is("deactivated_at", null)
    .select("capability");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new AppError("conflict", "This capability was not activated.", 409);
  await emitEvent(serviceDb(), member.tenantId, "capability.deactivated", "workspace", member.tenantId, {
    capability: kind,
    by: ctx.userId,
  });
  return { capability: kind, deactivated_at: now };
}
