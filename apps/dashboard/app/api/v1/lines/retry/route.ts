import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { AppError, isUuid } from "@chanlytics/contracts";
import { callEdgeLines, EDGE_LINES_TIMEOUT_MS } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/shared/edge";
import { LINES_PRODUCTION_ONLY, CARRIER_DID_NOT_ANSWER } from "@/server/connections/line-words";

/**
 * POST /api/v1/lines/retry — {line_id}: resume a line that stopped at a
 * step. Owners only. The edge resumes the saga where it failed and buys
 * nothing twice.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_retry",
  input: z.object({ line_id: z.string().nullish() }),
  handle: async ({ ctx, input, member }) => {
    const lineId = (input.line_id ?? "").trim();
    if (!isUuid(lineId)) throw new AppError("validation", "Which line?", 400);
    // `by`, because the edge cannot tell an owner's Retry from support's: both send the
    // same op, and it used to write "started by support" on every one of them.
    const answer = await callEdgeLines(
      { op: "retry", tenant_id: member.tenantId, user_id: ctx.userId, line_id: lineId, by: "owner" },
      EDGE_LINES_TIMEOUT_MS,
    );
    const result = answer.body ?? {};
    if (answer.status === 404) throw new AppError("not_found", "That line is not here any more.", 404);
    // The edge's words for why not (a line already restarted, one still setting up): `detail`, beside its code.
    if (answer.status === 409)
      throw new AppError("conflict", edgeRefusalWords(result) ?? "That line is not waiting on a retry.", 409);
    if (answer.status === 503 && result.error === "preview") throw new AppError("conflict", LINES_PRODUCTION_ONLY, 409);
    if (answer.status === 503 && result.error === "no_line_provider")
      throw new AppError("conflict", "Getting a line is not available here yet — a person at Chanlytics has it.", 409);
    if (answer.status !== 200 && answer.status !== 202 && answer.status !== 502)
      throw new AppError("upstream_provider", edgeRefusalWords(result) ?? CARRIER_DID_NOT_ANSWER);
    // 202: the saga is on the ledger; the row says the step, and Setup repaints from it.
    return {
      ok: result.ok === true,
      queued: result.queued === true,
      line: result.line ?? null,
      step: typeof result.step === "string" ? result.step : null,
      error: typeof result.error === "string" ? result.error : null,
    };
  },
});
