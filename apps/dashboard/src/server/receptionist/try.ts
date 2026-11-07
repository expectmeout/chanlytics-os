import "server-only";
import { AppError, MIN_MS, TRY_IT_WORDS, tryItVM, type TryItAnswer, type TryItVM } from "@chanlytics/contracts";
import { callEdge, edgeConfigured, edgeReasonOf } from "../shared/edge";
import { log } from "../shared/log";

/**
 * Settings › How it answers, Try it: a message an owner writes as a customer would, answered by the receptionist as it
 * stands, and why (contracts business-tab/try-it.ts says every word of it).
 *
 * The answer is the edge's eval door's (apps/edge/lib/receptionist/eval.ts), as the member who asked, for their
 * workspace, one case at a time: the live composed prompt, the clock and the open times, the live model, and beside it
 * what the live turn would do with it. Nothing is sent and nothing is written, and the receptionist's own day of
 * tokens is not touched (its budget counts the replies it sends). The model's call is the receptionist's in the usage
 * ledger, as an eval's is.
 */

/** What the route keeps of its minute for itself, past the edge's answer: the refusal or the view model. */
const ROUTE_MARGIN_MS = 5_000;
/** The door's answer can take a model's try, its fallback's, and the turn around them: under the route's minute. */
const TRY_TIMEOUT_MS = MIN_MS - ROUTE_MARGIN_MS;

/** One turn of what was tried before, as the door takes a case's history. */
interface TryTurn {
  role: "user" | "assistant";
  content: string;
}

/** A field of the door's answer, read as the box reads it: the shape is the edge's, so nothing in it is taken on trust. */
function tryAnswerOf(raw: unknown): TryItAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const response = raw as Record<string, unknown>;
  if (response.ok !== true || typeof response.text !== "string") return null;
  const then = response.then && typeof response.then === "object" ? (response.then as TryItAnswer["then"]) : null;
  const meta = response.meta && typeof response.meta === "object" ? (response.meta as Record<string, unknown>) : null;
  const second =
    response.booking && typeof response.booking === "object" ? (response.booking as Record<string, unknown>) : null;
  const booking =
    second && typeof second.slot === "string"
      ? { slot: second.slot, service: typeof second.service === "string" ? second.service : "" }
      : null;
  return { text: response.text, meta, then: then && typeof then.text === "string" ? then : null, booking };
}

/**
 * POST receptionist/try: the receptionist's answer to `text`, after the turns tried before it, and why. `userId` is the
 * member who asked, or null for a lead's own receptionist tried on its preview page, which nobody is a member of yet
 * (decision 0079): the edge's token then names the workspace alone.
 */
export async function tryReceptionist(
  tenantId: string,
  userId: string | null,
  text: string,
  history: readonly TryTurn[],
): Promise<TryItVM> {
  if (!edgeConfigured()) throw new AppError("conflict", TRY_IT_WORDS.notLive, 409);
  const result = await callEdge(
    "/api/admin/eval",
    { tenant_id: tenantId, cases: [{ id: "try", text, history: [...history] }] },
    { workspace: tenantId, user: userId, timeoutMs: TRY_TIMEOUT_MS },
  );
  const results = (result.body as { results?: unknown } | null)?.results;
  const answer = result.status === 200 && Array.isArray(results) ? tryAnswerOf(results[0]) : null;
  if (answer) return tryItVM(answer);
  const reason = edgeReasonOf(result);
  log.warn("receptionist_try_failed", { tenant_id: tenantId, reason, status: result.status });
  if (reason === "no_persona" || reason === "config_broken")
    throw new AppError("conflict", TRY_IT_WORDS.noPersona, 409);
  throw new AppError("upstream_anthropic", TRY_IT_WORDS.failed, 502, { reason });
}
