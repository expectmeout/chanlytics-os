import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformLineAct } from "@/server/platform";

/**
 * POST /api/v1/platform/lines/replace -- delete a refused campaign and file a new one.
 *
 * The remedy `refile` cannot be: Twilio's campaign update accepts nine fields, and
 * the opt-in message and its keywords are not among them ("cannot be edited under
 * any circumstances"). The live Chanlytics campaign was refused three times over a
 * confirmation no edit could reach. So this takes the refused campaign off the
 * Messaging Service and files a new one from today's facts, under the same
 * approved brand. A new campaign is a new vetting fee, about $15, which is why it
 * is its own door with its own button that says so, and never implied by refile.
 *
 * No `spend: true` here: the wrapper's spend gate reads the CALLER's workspace,
 * and platform staff act on someone else's. The billing hold is enforced where
 * the money is actually spent — apps/edge/api/admin/lines.ts, which reads the
 * line's own row and gates a rehearsal made real (and a replacement) rather
 * than exempting everything called a refile.
 *
 * The edge refuses a line whose campaign was not refused, and refuses before the
 * carrier is touched if the record or the workspace's name would not pass review;
 * both answers reach the page unchanged. Same bucket as refile: a support
 * ceiling, not the owner's.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_line_refile",
  handle: async ({ ctx, req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; line_id?: unknown };
    const tenantId = requireUuid(body.tenant_id, "workspace");
    const lineId = requireUuid(body.line_id, "line");
    const r = await platformLineAct(office, ctx, "replace", tenantId, lineId);
    return { ok: r.ok, status: r.status, result: r.body };
  },
});
