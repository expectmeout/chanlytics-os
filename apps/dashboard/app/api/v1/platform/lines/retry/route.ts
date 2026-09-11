import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformLineAct } from "@/server/platform";

/**
 * POST /api/v1/platform/lines/retry — resume another workspace's line where it stopped.
 *
 * An owner has this for their own line already. This is the same operation for a
 * workspace the caller is not a member of, which is the whole difference: the
 * authorization is `platform_admins` rather than a membership, and the action is
 * recorded against the person who asked before it runs.
 *
 * The edge refuses a line that is not `failed`, and that refusal reaches the
 * page unchanged rather than being smoothed over here.
 *
 * On the platform scope, with a support ceiling, not the owner's: `lines_retry`
 * is one workspace's budget for its own line, and this route is worked down a
 * list of other people's.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_line_retry",
  handle: async ({ ctx, req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; line_id?: unknown };
    const tenantId = requireUuid(body.tenant_id, "workspace");
    const lineId = requireUuid(body.line_id, "line");
    const r = await platformLineAct(office, ctx, "retry", tenantId, lineId);
    // The edge's own answer, unchanged. A 409 from it is a real fact about the
    // line -- "the line is answering, not failed", "already_registered" -- and
    // rewording it here would put a second opinion between support and the truth.
    return { ok: r.ok, status: r.status, result: r.body };
  },
});
