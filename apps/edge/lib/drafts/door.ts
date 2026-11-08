/**
 * A member's change to a thread's draft, or their Try again (decision 0093): the door is api/admin/draft.ts, which checks
 * who may knock and reads the body, then hands this the knock and what the body carried. Everything after is here.
 *
 * Internal endpoint: the per-call token, called by the dashboard's draft route after RLS has proved the thread belongs to
 * the member's workspace and the role door has been checked there. The token names that workspace, and a thread of another
 * is a thread that is not there. Body: { conversation_id, kind, instruction? }. Nothing leaves by it: the words are kept on
 * the thread's row, for the reply's own door to send on a press.
 */
import { MIN_MS, SECOND_MS, UUID, type ReplyDraftKind, isTenantId } from "@chanlytics/contracts";
import { rewriteReplyDraft, type RewriteOutcome } from "@chanlytics/core";
import { replyDraftPortsOf, type ReplyDraftEdge } from "@chanlytics/jobs";
import { tokenWorkspace, type Admitted, NAMES_NO_WORKSPACE } from "../shared/admin-auth.js";
import { env } from "../shared/env.js";
import { json, refuse } from "../shared/http.js";
import { logger } from "../shared/log.js";
import { pg } from "../shared/pg.js";
import { draftEdge } from "./writer.js";

/** A member's change, as long as the route takes it. */
const INSTRUCTION_MAX = 500;
/** How long the member's own wait gives the writer: the route's two tries, and one more ask, under the door's minute. */
const DOOR_MS = MIN_MS - 5 * SECOND_MS;

/** What each refusal answers. A word the door has no code of its own for is the writer's, said in `detail`. */
function refused(otherRefused: Extract<RewriteOutcome, { done: false }>["refused"]): Response {
  switch (otherRefused) {
    case "gone":
      return refuse(404, "not_found");
    case "nothing_to_answer":
      return refuse(409, "nothing_to_answer");
    case "named_money":
      return refuse(409, "policy_block_price");
    case "not_owed":
    case "older":
      return refuse(409, "draft_not_owed");
    default:
      return refuse(409, "draft_refused", otherRefused);
  }
}

export async function draftAtTheDoor(
  auth: Admitted,
  body: Partial<{ conversation_id: string; kind: string; instruction: string }>,
  over?: { edge?: ReplyDraftEdge } | null,
): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return refuse(503, "no_model_key");
  const workspace = tokenWorkspace(auth);
  if (auth.via !== "token" || !workspace || !isTenantId(workspace))
    return refuse(400, "bad_tenant", NAMES_NO_WORKSPACE);
  const conversationId = String(body.conversation_id ?? "");
  const kind: ReplyDraftKind = body.kind === "brief" ? "brief" : "reply";
  const instruction = String(body.instruction ?? "").trim();
  if (!UUID.test(conversationId) || instruction.length > INSTRUCTION_MAX)
    return refuse(400, "bad_request", `conversation_id, and an instruction of ${INSTRUCTION_MAX} characters at most`);
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const started = Date.now();
  const out = await rewriteReplyDraft(replyDraftPortsOf(db, over?.edge ?? draftEdge(db)), {
    tenantId: workspace,
    conversationId,
    kind,
    instruction: instruction || null,
    by: auth.user,
    now: new Date(started),
    deadline: started + DOOR_MS,
  });
  // The words are the member's and the model's and stay out of the log.
  logger({ tenant_id: workspace }).info("admin_draft", {
    conversation: conversationId,
    kind,
    rewrite: !!instruction,
    done: out.done,
    ms: Date.now() - started,
  });
  return out.done ? json(200, { ok: true, draft: out.draft }) : refused(out.refused);
}
