import { write, platform } from "@/server/route";
import { requireUuid } from "@/server/request-guards";
import { platformPartnerStanding } from "@/server/platform/platform";
import { AppError, PARTNER_STANDINGS } from "@chanlytics/contracts";

/**
 * POST /api/v1/platform/partners/standing — a person decides the standing of a workspace a partner brought
 * (decision 0012, P5): qualified, under review, or disqualified, and why.
 *
 * The nightly check decides once, from the card and the listing (00203); this is the person who looks at what it held
 * for review, or who changes their mind. Disqualified voids what the workspace still held and earns nothing more;
 * what was paid stays paid. Qualified makes what is past its thirty days payable now.
 *
 * On the platform scope, whose door is `backOffice()`, and checked again in the function, which records the decision
 * against the caller in the same transaction. The body names the workspace, as the line actions do.
 */
export const POST = write({
  scope: platform,
  role: null,
  rate: "platform_partner_standing",
  handle: async ({ req, office }) => {
    const body = (await req.json().catch(() => ({}))) as { tenant_id?: unknown; standing?: unknown; why?: unknown };
    const tenantId = requireUuid(body.tenant_id, "workspace");
    const standing = typeof body.standing === "string" ? body.standing : "";
    if (!(PARTNER_STANDINGS as readonly string[]).includes(standing))
      throw new AppError("validation", "Choose qualified, review or disqualified.", 400);
    const why = typeof body.why === "string" ? body.why.trim() : "";
    if (!why) throw new AppError("validation", "Say why: the partner is written to about it.", 400);
    return { result: await platformPartnerStanding(office, tenantId, standing, why) };
  },
});
