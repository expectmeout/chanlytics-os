import { z } from "zod";
import { AppError, CAPABILITY_KINDS, capabilityStatus, type CapabilityKind } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { setupDtoFor } from "@/server/setup";

const Body = z.object({
  note: z.string().trim().max(200, "Two hundred characters at most.").optional(),
});

function kindOf(raw: unknown): CapabilityKind {
  const k = String(raw ?? "");
  if (!(CAPABILITY_KINDS as readonly string[]).includes(k)) throw new AppError("not_found", "No such capability.", 404);
  return k as CapabilityKind;
}

/**
 * POST /api/v1/capabilities/:kind — the owner switches a capability on.
 *
 * The act, recorded: who and when, on a row per capability. Readiness is
 * computed from the workspace's records and refused when they say no, so an
 * activation is never a claim ahead of the facts; evidence stays what the
 * records show. Owners only: it is the owner's decision what the workspace
 * says is live. Activation gates nothing at runtime yet.
 */
export const POST = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  input: Body,
  handle: async ({ ctx, member, input }) => {
    const kind = kindOf(ctx.params.kind);
    const dto = await setupDtoFor(ctx.supabase, member.tenantId, { kind: "member" });
    const before = capabilityStatus(kind, dto);
    if (!before.ready)
      throw new AppError(
        "conflict",
        `Not ready to activate: ${before.blockers[0]?.words ?? "the records say no."}`,
        409,
      );
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
    const activations = [
      ...(dto.activations ?? []).filter((a) => a.capability !== kind),
      { capability: kind, activated_at: now, activated_by: ctx.userId, deactivated_at: null },
    ];
    return { capability: kind, status: capabilityStatus(kind, { ...dto, activations }) };
  },
});

/** DELETE /api/v1/capabilities/:kind — the owner switches it off again. The row stays; the history does. */
export const DELETE = write({
  scope: workspace,
  role: "owner",
  rate: "settings",
  handle: async ({ ctx, member }) => {
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
    return { capability: kind, deactivated_at: now };
  },
});
