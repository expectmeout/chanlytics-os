import "server-only";
import { MIN_MS, type ReplyDraftKind } from "@chanlytics/contracts";
import { claimControl } from "@chanlytics/db/conversations";
import type { ConversationDraftRow } from "@chanlytics/db/ask";
import { deployment } from "../shared/env";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "../shared/edge";

/** A draft rewritten by the model at the edge: as long as its door may take, so a timeout here is the door's own. */
const STEER_TIMEOUT_MS = MIN_MS;
import { serviceDb } from "../shared/service-db";

/**
 * Who is speaking on a thread right now (00132): a person's hold, taken for
 * their reply. A take-over takes it inside its own door, and a hand-back lets
 * it go inside its own (00386), so neither is here.
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

/**
 * Have the edge rewrite a held draft to the owner's instruction. The model
 * key lives there; RLS and the role door have already been checked by the
 * route that calls this.
 */
/**
 * A member's change to a thread's draft, or their Try again (decision 0093): the edge holds the writer, as it holds the
 * brain a held reply is rewritten by, and keeps the words on the thread's row. The call's answer is that row.
 */
export async function draftAtTheEdge(
  ask: { conversationId: string; kind: ReplyDraftKind; instruction: string | null },
  asker: { workspace: string; user: string },
): Promise<{ ok: true; draft: ConversationDraftRow } | { ok: false; reason: EdgeReason; detail: string | null }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview", detail: null };
  const item = await callEdge(
    "/api/admin/draft",
    {
      conversation_id: ask.conversationId,
      kind: ask.kind,
      ...(ask.instruction ? { instruction: ask.instruction } : {}),
    },
    { ...asker, timeoutMs: STEER_TIMEOUT_MS },
  );
  const body = (item.body ?? {}) as { ok?: boolean; draft?: ConversationDraftRow; detail?: unknown };
  if (edgeAnswered(item) && body.ok && body.draft) return { ok: true, draft: body.draft };
  return { ok: false, reason: edgeReasonOf(item), detail: typeof body.detail === "string" ? body.detail : null };
}

export async function steerDraft(
  messageId: string,
  text: string,
  asker: { workspace: string; user: string },
): Promise<{ ok: true; messageId: string; text: string } | { ok: false; reason: EdgeReason }> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  // The token names the workspace and the person: the edge rewrites only a draft of that workspace.
  const answer = await callEdge(
    "/api/admin/steer",
    { message_id: messageId, text },
    { ...asker, timeoutMs: STEER_TIMEOUT_MS },
  );
  const body = (answer.body ?? {}) as { ok?: boolean; message_id?: string; text?: string };
  if (edgeAnswered(answer) && body.ok && body.message_id)
    return { ok: true, messageId: body.message_id, text: body.text ?? "" };
  return { ok: false, reason: edgeReasonOf(answer) };
}
