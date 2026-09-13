import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformLineAct } from "@/server/platform";

/**
 * POST /api/v1/platform/lines/refile — send a registration to the carriers again.
 *
 * The action this door exists for. Two things wear the name, and the edge tells
 * them apart by the line's own state:
 *
 *   a REJECTED campaign  is corrected in place. Twilio assesses the vetting fee
 *                        once per campaign, so this is free.
 *   a REHEARSAL filing   is taken off and replaced by a real one. That spends
 *                        about $19.50 and cannot be undone -- a registered brand
 *                        is permanent.
 *
 * An owner cannot do either: the first because a rejection needs somebody who
 * can read what the carriers said, the second because it spends Chanlytics'
 * money rather than theirs. The page says which one a given line is offering,
 * and what it costs, before the button is pressed.
 *
 * No `spend: true` here: the wrapper's spend gate reads the CALLER's workspace,
 * and platform staff act on someone else's. The billing hold is enforced where
 * the money is actually spent — apps/edge/api/admin/lines.ts, which reads the
 * line's own row and gates a rehearsal made real (and a replacement) rather
 * than exempting everything called a refile.
 *
 * On the platform scope: the database decides who may, and the bucket is a
 * support ceiling, not the owner's. `lines_register` is three an hour because a
 * first filing spends about $19.50 and cannot be undone; correcting a REJECTED
 * campaign is free and is the most common thing this door is opened for.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_line_refile",
  handle: async ({ ctx, req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; line_id?: unknown };
    const tenantId = requireUuid(body.tenant_id, "workspace");
    const lineId = requireUuid(body.line_id, "line");
    const r = await platformLineAct(office, ctx, "refile", tenantId, lineId);
    // The edge's own answer, unchanged. A 409 from it is a real fact about the
    // line -- "the line is answering, not failed", "already_registered" -- and
    // rewording it here would put a second opinion between support and the truth.
    return { ok: r.ok, status: r.status, result: r.body };
  },
});
