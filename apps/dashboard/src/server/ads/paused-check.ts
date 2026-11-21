/**
 * The paused-ad check, for the dashboard (the Ads plan's step 4, "Checking against Meta without spending"): the owner's
 * New ad draft, judged here as its screen's own route judges it, handed to the edge, which sends it to Meta once as
 * dry runs and then made paused, and reads it back (apps/edge/lib/ads/paused-check.ts). The edge holds the token and
 * makes every call; nothing here touches Meta.
 *
 * Only a draft that could be turned on is sent: written, with three versions of words that passed, nothing that would
 * stop it but the account having no card yet, and no special kind (decision 0050, calls 3 and 7). The first version is
 * the one sent. In place of a draft, Meta's id for a campaign an earlier check left is handed on to be removed, or for an
 * ad a check made whose campaign is gone, to have its creative and picture removed; the edge removes only what a check
 * made. The owner alone, as every press that makes something at Meta is.
 */
import "server-only";
import { AppError, ROLE_PERMS } from "@chanlytics/contracts";
import { callEdge, edgeConfigured } from "../shared/edge";
import { deployment } from "../shared/env";
import type { Member } from "../shared/route";
import { readerContext, type ReaderContext } from "../shared/reader";
import type { RouteContext } from "../shared/with-route";
import { adDraftAnswer, requireAdsOffered } from "./draft";
import { readAdDraftFacts } from "./draft-facts";
import type { AdCheckDto, AdDraftState } from "./draft-shape";

/** How long the check may take at the edge: its calls are Meta's, one after another, inside the route's minute. */
const CHECK_WAIT_MS = 57_000;

/** One step of the check, as the edge answers it. */
interface CheckStepAnswer {
  at: string;
  outcome: string;
  said: string | null;
  id: string | null;
}

/** What the check came to: matched, differed, removed, or stopped at a step Meta refused; each step, and what differs. */
interface PausedCheckAnswer {
  outcome: string;
  steps: CheckStepAnswer[];
  differs: string[];
}

/** The draft as the edge's door takes it. */
interface SentDraft {
  service: string;
  picture: string;
  miles: number;
  /** A place wider than the circle, by Meta's key, where the draft holds one: then no street address is sent. */
  area?: { kind: "city" | "region" | "country"; key: string };
  total_minor: number;
  end_day: string;
  text: string;
  headline: string;
  address?: string;
  whatsapp: string;
}

/**
 * The one check the paused-ad check is sent past: the account has no card on file. That is what makes it safe, since
 * with no card nothing can be charged, and Turn on itself still stops at it.
 */
const noCardYet = (check: AdCheckDto): boolean => check.code === "account" && check.check === "payment";

/** Why a draft cannot be sent, in the words its owner reads. Null where it can. */
function unsendable(answer: ReturnType<typeof adDraftAnswer>): string | null {
  if (!answer.can) return "A draft can't be written yet.";
  if (answer.draft.versions.length === 0) return "The draft has no words yet.";
  if (answer.checks.some((check) => !noCardYet(check))) return "Something would stop this ad. Fix it on New ad first.";
  if (answer.declared !== "none") return "An ad of a special kind isn't made here.";
  return null;
}

/** The draft judged as New ad judges it, and its first version, as the edge's door takes it. */
async function draftToSend(rc: ReaderContext, draft: AdDraftState): Promise<SentDraft> {
  const facts = await readAdDraftFacts(rc, [draft.picture]);
  const answer = adDraftAnswer(facts, draft);
  const reason = unsendable(answer);
  if (reason || !answer.can) throw new AppError("conflict", reason ?? "A draft can't be written yet.", 409);
  const [version] = answer.draft.versions;
  const { area } = answer.draft;
  if (!version || !(area || facts.address) || !facts.whatsappNumber)
    throw new AppError("conflict", "The draft has no words, address or number yet.", 409);
  return {
    service: answer.draft.service,
    picture: answer.draft.picture.id,
    miles: answer.draft.miles,
    ...(area ? { area: { kind: area.kind, key: area.key } } : { address: facts.address ?? "" }),
    total_minor: answer.draft.total_minor,
    end_day: answer.draft.end_day,
    text: version.text,
    headline: version.headline,
    whatsapp: facts.whatsappNumber,
  };
}

/** `POST ads/check`: the draft sent to Meta once, made paused, and read back; or what a check left, removed. */
export async function runPausedAdCheck(
  ctx: RouteContext,
  member: Member,
  input: { draft?: AdDraftState; remove?: string; tidy?: string },
): Promise<PausedCheckAnswer> {
  if (!ROLE_PERMS[member.role].ads) throw new AppError("forbidden", "Only the owner can make an ad.", 403);
  const rc = readerContext(ctx, member);
  await requireAdsOffered(rc);
  const ask = input.draft ? { draft: await draftToSend(rc, input.draft) } : { remove: input.remove, tidy: input.tidy };
  if (!edgeConfigured() || !deployment.providersLive)
    throw new AppError("upstream_provider", "Meta can't be reached from here.");
  const sent = await callEdge(
    "/api/admin/ads/check",
    { tenant_id: member.tenantId, user_id: ctx.userId, ...ask },
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
