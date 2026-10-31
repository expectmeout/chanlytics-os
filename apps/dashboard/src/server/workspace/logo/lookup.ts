/**
 * A look for the workspace's logo on the business's own website, on the owner's press (00407). The look is the edge's
 * (POST /api/admin/imports/logo-lookup, lib/imports/logo-lookup.ts): the page is read by the platform's one page
 * reader, whose key the dashboard does not hold. Which website, what a mark is and which picture is taken are said
 * there. Nothing is stored: the picture found travels back in the answer, the page draws it into the circle and the
 * owner says whether it is theirs, and only a Save keeps anything, through the same door as a chosen picture. What
 * happened is logged by its outcome, never with the file, so how often a business's own site has a usable logo is a
 * number we can read.
 */
import "server-only";
import { AppError, LOGO_WORDS, logoLookupAnswerOf, type LogoLookupAnswer } from "@chanlytics/contracts";
import { callEdge, edgeAnswered } from "@/server/edge";
import { log } from "@/server/log";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";

/** The edge's door for the look. */
const LOOKUP_DOOR = "/api/admin/imports/logo-lookup";
/** Up to two page reads (6 s each) and three image reads (4 s each) on the edge, inside this route's own 30 s. */
const LOOKUP_MS = 28_000;

/** POST workspaces/logo/lookup. */
export async function lookupLogo(ctx: RouteContext, member: Member): Promise<LogoLookupAnswer> {
  const a = await callEdge(
    LOOKUP_DOOR,
    { tenant_id: member.tenantId },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: LOOKUP_MS },
  );
  const answer = edgeAnswered(a) ? logoLookupAnswerOf(a.body) : null;
  if (!answer) {
    log.warn("workspace_logo_lookup", { tenant_id: member.tenantId, outcome: "failed", status: a.status });
    throw new AppError("internal", LOGO_WORDS.lookFailed, 502);
  }
  log.info("workspace_logo_lookup", { tenant_id: member.tenantId, outcome: answer.outcome });
  return answer;
}
