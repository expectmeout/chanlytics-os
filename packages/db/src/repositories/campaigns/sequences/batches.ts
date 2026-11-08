/** Sequences: batches. */

import { answer, type DoorResult } from "../reach-out/leads";
import type { Db } from "./reads";
import { decided, type DoorDecision, type SequenceDoorAnswer } from "./doors";
import type { TenantId } from "@chanlytics/contracts";

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
  if (error) throw new Error(`cannot cancel the batch: ${error.message}`);
  return data === true;
}
