/**
 * The paused-ad check, for the dashboard (the Ads plan's step 4, "Checking against Meta without spending"): the owner's
 * New ad draft, judged here as its screen's own route judges it, handed to the edge, which sends it to Meta once as
 * dry runs and then made paused, and reads it back (apps/edge/lib/ads/paused-check.ts). The edge holds the token and
 * makes every call; nothing here touches Meta.
 *
 * Only a draft that could be turned on is sent: written, with three versions of words that passed, nothing that would
 * stop it, and no special kind (decision 0050, calls 3 and 7). The first version is the one sent. The owner alone, as
 * every press that makes something at Meta is.
 */
import "server-only";
import { AppError, ROLE_PERMS } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "../shared/edge";
import { deployment } from "../shared/env";
import type { Member } from "../shared/route";
import { readerContext } from "../shared/reader";
import type { RouteContext } from "../shared/with-route";
import { adDraftAnswer, requireAdsOffered } from "./draft";
import { readAdDraftFacts } from "./draft-facts";
import type { AdDraftState } from "./draft-shape";

/** How long the check may take at the edge: its calls are Meta's, one after another, inside the route's minute. */
const CHECK_WAIT_MS = 57_000;

/** One step of the check, as the edge answers it. */
interface CheckStepAnswer {
  at: string;
  outcome: string;
  said: string | null;
  id: string | null;
}

/** What the check came to: matched, differed, or stopped at a step Meta refused; each step, and what differs. */
interface PausedCheckAnswer {
  outcome: string;
  steps: CheckStepAnswer[];
  differs: string[];
}

/** Why a draft cannot be sent, in the words its owner reads. Null where it can. */
function unsendable(answer: ReturnType<typeof adDraftAnswer>): string | null {
  if (!answer.can) return "A draft can't be written yet.";
  if (answer.draft.versions.length === 0) return "The draft has no words yet.";
  if (answer.checks.length > 0) return "Something would stop this ad. Fix it on New ad first.";
  if (answer.declared !== "none") return "An ad of a special kind isn't made here.";
  return null;
}

/** `POST ads/check`: the draft sent to Meta once, made paused, and read back. */
export async function runPausedAdCheck(
  ctx: RouteContext,
  member: Member,
  input: { draft: AdDraftState },
): Promise<PausedCheckAnswer> {
  if (!ROLE_PERMS[member.role].ads) throw new AppError("forbidden", "Only the owner can make an ad.", 403);
  const rc = readerContext(ctx, member);
  await requireAdsOffered(rc);
  const facts = await readAdDraftFacts(rc);
  const answer = adDraftAnswer(facts, input.draft);
  const why = unsendable(answer);
  if (why || !answer.can) throw new AppError("conflict", why ?? "A draft can't be written yet.", 409);
  const [version] = answer.draft.versions;
  if (!version || !facts.address || !facts.whatsappNumber)
    throw new AppError("conflict", "The draft has no words, address or number yet.", 409);
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("upstream_provider", "Meta can't be reached from here.");
  const sent = await callEdge(
    "/api/admin/ads/check",
    {
      tenant_id: member.tenantId,
      user_id: ctx.userId,
      draft: {
        service: answer.draft.service,
        picture: answer.draft.picture.id,
        miles: answer.draft.miles,
        total_minor: answer.draft.total_minor,
        end_day: answer.draft.end_day,
        text: version.text,
        headline: version.headline,
        address: facts.address,
        whatsapp: facts.whatsappNumber,
      },
    },
    { workspace: member.tenantId, user: ctx.userId, timeoutMs: CHECK_WAIT_MS },
  );
  const body = sent.body ?? {};
  if (sent.status !== 200 || body.ok !== true)
    throw new AppError("upstream_provider", `The check didn't run: ${body.error ?? `status ${sent.status}`}.`);
  return {
    outcome: typeof body.outcome === "string" ? body.outcome : "unknown",
    steps: Array.isArray(body.steps) ? body.steps : [],
    differs: Array.isArray(body.differs) ? body.differs : [],
  };
}
