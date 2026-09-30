import "server-only";
import { MIN_MS } from "@chanlytics/contracts";
import { claimControl, releaseControl } from "@chanlytics/db";
import { deployment } from "../deployment";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../edge";

/** A draft rewritten by the model at the edge: as long as its door may take, so a timeout here is the door's own. */
const STEER_TIMEOUT_MS = MIN_MS;
import { serviceDb } from "../service-db";

/**
 * Who is speaking on a thread right now (00132).
 *
 * On the service client for the same reason a job is: the column grant fences
 * these columns off from a member's own session, so the claim is the database's
 * to make and not PostgREST's. A person's hold is never refused -- it outranks
 * a call's and is not blocked by a colleague's -- so this answers with nothing,
 * and a failure throws rather than being read as a hold we do not have.
 */
export async function takeThreadControl(
  tenantId: string,
  conversationId: string,
  userId: string,
  seconds: number,
): Promise<void> {
  const outcome = await claimControl(serviceDb(), {
    tenantId,
    conversationId,
    holder: { kind: "person", userId },
    seconds,
  });
  if (outcome === "gone")
    throw new Error(`takeThreadControl: no conversation ${conversationId} in workspace ${tenantId}`);
}

/** This person's hold, let go. Somebody else's is left where it is. */
export async function letThreadControlGo(tenantId: string, conversationId: string, userId: string): Promise<void> {
  await releaseControl(serviceDb(), { tenantId, conversationId, holder: { kind: "person", userId } });
}

/**
 * Have the edge rewrite a held draft to the owner's instruction. The model
 * key lives there; RLS and the role door have already been checked by the
 * route that calls this.
 */
export async function steerDraft(
  messageId: string,
  text: string,
): Promise<{ ok: true; messageId: string; text: string } | { ok: false; reason: EdgeReason }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await callEdge("/api/admin/steer", { message_id: messageId, text }, { timeoutMs: STEER_TIMEOUT_MS });
  const j = (r.body ?? {}) as { ok?: boolean; message_id?: string; text?: string };
  if (edgeAnswered(r) && j.ok && j.message_id) return { ok: true, messageId: j.message_id, text: j.text ?? "" };
  return { ok: false, reason: edgeReasonOf(r) };
}
