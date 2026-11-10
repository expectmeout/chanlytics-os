/** Sequences: batches. */

import { answer, type DoorResult } from "../reach-out/leads";
import type { Db } from "./reads";
import { decided, type DoorDecision, type SequenceDoorAnswer } from "./doors";
import type { TenantId } from "@chanlytics/contracts";
import { DbFailure } from "@chanlytics/contracts";

/** The search a sequence to leads draws its new ready leads from, or none (00459 reach_out_source_set: auto-add). */
export async function setChainSource(
  db: Db,
  params: { tenantId: TenantId; rootId: string; searchId: string | null },
): Promise<DoorResult<{ root_id: string; source_search_id: string | null }>> {
  const { data, error } = await db.rpc("reach_out_source_set", {
    p_tenant_id: params.tenantId,
    p_root_id: params.rootId,
    ...(params.searchId ? { p_search_id: params.searchId } : {}),
  });
  return answer<{ root_id: string; source_search_id: string | null }>(data, error);
}

/**
 * Try a business that never answered again after `days`, or never (null) (00589 reach_out_again_set, decision 0120): a
 * member who may approve, on the member's own session. Turned on, its words wait for an OK once more.
 */
export async function setChainAgain(
  db: Db,
  params: { tenantId: TenantId; rootId: string; days: number | null },
): Promise<DoorResult<{ root_id: string; again_after_days: number | null }>> {
  const { data, error } = await db.rpc("reach_out_again_set", {
    p_tenant_id: params.tenantId,
    p_root_id: params.rootId,
    ...(params.days ? { p_days: params.days } : {}),
  });
  return answer<{ root_id: string; again_after_days: number | null }>(data, error);
}

/**
 * Whether a sequence to leads tries again, after how many days, and who would come back at `days` and from when (00589
 * reach_out_again_count), on the service role once the route has checked the member. A read that fails throws.
 */
export async function findChainAgain(
  db: Db,
  params: { tenantId: TenantId; rootId: string; days: number },
): Promise<{ again_after_days: number | null; count: number; first_at: string | null }> {
  const [step, counted] = await Promise.all([
    db
      .from("sequence_steps")
      .select("again_after_days")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.rootId)
      .maybeSingle(),
    db.rpc("reach_out_again_count", { p_tenant_id: params.tenantId, p_root_id: params.rootId, p_days: params.days }),
  ]);
  if (step.error) throw new DbFailure(step.error, "cannot read whether the sequence tries again");
  if (counted.error) throw new DbFailure(counted.error, "cannot count who would come back");
  const c = counted.data && typeof counted.data === "object" && !Array.isArray(counted.data) ? counted.data : {};
  return {
    again_after_days: step.data?.again_after_days ?? null,
    count: typeof c.count === "number" ? c.count : 0,
    first_at: typeof c.first_at === "string" ? c.first_at : null,
  };
}

/** The sequence a search's Add goes to, or none (00459 lead_search_aim): kept on the search, a member's. */
export async function aimSearchAt(
  db: Db,
  params: { tenantId: TenantId; searchId: string; sequenceId: string | null },
): Promise<DoorResult<{ search_id: string; adds_to: string | null }>> {
  const { data, error } = await db.rpc("lead_search_aim", {
    p_tenant_id: params.tenantId,
    p_search_id: params.searchId,
    ...(params.sequenceId ? { p_sequence_id: params.sequenceId } : {}),
  });
  return answer<{ search_id: string; adds_to: string | null }>(data, error);
}

/** A sequence that never sent taken away whole (00442 sequence_discard): a draft let go, or a new one undone. */
export async function discardSequence(
  db: Db,
  params: { tenantId: TenantId; sequenceId: string } & DoorDecision,
): Promise<DoorResult<SequenceDoorAnswer>> {
  const { data, error } = await db.rpc("sequence_discard", {
    p_tenant_id: params.tenantId,
    p_sequence_id: params.sequenceId,
    ...decided(params),
  });
  return answer<SequenceDoorAnswer>(data, error);
}

/** A batch canceled by a member, only from the state it was read in (00442 sequence_batch_cancel). True when it moved. */
export async function cancelSequenceBatch(
  db: Db,
  params: { tenantId: TenantId; batchId: string; from: string },
): Promise<boolean> {
  const { data, error } = await db.rpc("sequence_batch_cancel", {
    p_tenant_id: params.tenantId,
    p_batch_id: params.batchId,
    p_from: params.from,
  });
  if (error) throw new DbFailure(error, "cannot cancel the batch");
  return data === true;
}
