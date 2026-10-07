import { write, workspace } from "@/server/route";
import { AppError, isUuid } from "@chanlytics/contracts";
import { edgeLines, EDGE_LINES_TIMEOUT_MS } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/edge";

/**
 * POST /api/v1/lines/retry — {line_id}: resume a line that stopped at a
 * step. Owners only. The edge resumes the saga where it failed and buys
 * nothing twice.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_retry",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => ({}))) as { line_id?: unknown };
    const lineId = typeof body.line_id === "string" ? body.line_id.trim() : "";
    if (!isUuid(lineId)) throw new AppError("validation", "Which line?", 400);
    // `by`, because the edge cannot tell an owner's Retry from support's: both send the
    // same op, and it used to write "started by support" on every one of them.
    const a = await edgeLines(
      { op: "retry", tenant_id: member.tenantId, user_id: ctx.userId, line_id: lineId, by: "owner" },
      EDGE_LINES_TIMEOUT_MS,
    );
    const b = a.body ?? {};
    if (a.status === 404) throw new AppError("not_found", "That line is not here any more.", 404);
    // The edge's words for why not (a line already restarted, one still setting up): `detail`, beside its code.
    if (a.status === 409)
      throw new AppError("conflict", edgeRefusalWords(b) ?? "That line is not waiting on a retry.", 409);
    if (a.status === 503 && b.error === "preview")
      throw new AppError("conflict", "Getting a line only works on the production dashboard.", 409);
    if (a.status === 503 && b.error === "no_line_provider")
      throw new AppError("conflict", "Getting a line is not available here yet — a person at Chanlytics has it.", 409);
    if (a.status !== 200 && a.status !== 202 && a.status !== 502)
      throw new AppError("internal", edgeRefusalWords(b) ?? "The carrier did not answer. Try again in a moment.", 502);
    // 202: the saga is on the ledger; the row says the step, and Setup repaints from it.
    return {
      ok: b.ok === true,
      queued: b.queued === true,
      line: b.line ?? null,
      step: typeof b.step === "string" ? b.step : null,
      error: typeof b.error === "string" ? b.error : null,
    };
  },
});
