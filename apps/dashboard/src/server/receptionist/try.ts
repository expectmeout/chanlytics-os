import "server-only";
import { AppError, MIN_MS, TRY_IT_WORDS, tryItVM, type TryItAnswer, type TryItVM } from "@chanlytics/contracts";
import { callEdge, edgeConfigured, edgeReasonOf } from "../edge";
import { log } from "../log";

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
  const r = raw as Record<string, unknown>;
  if (r.ok !== true || typeof r.text !== "string") return null;
  const then = r.then && typeof r.then === "object" ? (r.then as TryItAnswer["then"]) : null;
  const meta = r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : null;
  const b = r.booking && typeof r.booking === "object" ? (r.booking as Record<string, unknown>) : null;
  const booking =
    b && typeof b.slot === "string" ? { slot: b.slot, service: typeof b.service === "string" ? b.service : "" } : null;
  return { text: r.text, meta, then: then && typeof then.text === "string" ? then : null, booking };
}

/** POST receptionist/try: the receptionist's answer to `text`, after the turns tried before it, and why. */
export async function tryReceptionist(
  tenantId: string,
  userId: string,
  text: string,
  history: readonly TryTurn[],
): Promise<TryItVM> {
  if (!edgeConfigured()) throw new AppError("conflict", TRY_IT_WORDS.notLive, 409);
  const a = await callEdge(
    "/api/admin/eval",
    { tenant_id: tenantId, cases: [{ id: "try", text, history }] },
    { workspace: tenantId, user: userId, timeoutMs: TRY_TIMEOUT_MS },
  );
  const results = (a.body as { results?: unknown } | null)?.results;
  const answer = a.status === 200 && Array.isArray(results) ? tryAnswerOf(results[0]) : null;
  if (answer) return tryItVM(answer);
  const reason = edgeReasonOf(a);
  log.warn("receptionist_try_failed", { tenant_id: tenantId, reason, status: a.status });
  if (reason === "no_persona" || reason === "config_broken")
    throw new AppError("conflict", TRY_IT_WORDS.noPersona, 409);
  throw new AppError("upstream_anthropic", TRY_IT_WORDS.failed, 502, { reason });
}
