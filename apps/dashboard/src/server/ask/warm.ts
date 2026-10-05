import "server-only";
import { ASK_WARM_MAX_TOKENS, MIN_MS } from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import type { Member } from "../route";
import { log } from "@/server/log";
import { readerContext } from "../readers";
import { GatewayRefused } from "./gateway";
import { askPorts, turnHead, type AskPorts } from "./loop";
import { askModel } from "./model";
import { turnFacts } from "./turn";

/**
 * The model's cache, written ahead of the question (5 Oct 2026).
 *
 * A turn's first request begins with a head the model caches for five minutes: the tools, the rules and facts, and
 * the workspace's shape, some thirty thousand tokens (loop.ts turnHead). Production's stored turns for the fortnight
 * to 5 Oct: a question that found the head cached had its first byte in 2.1 s; one that did not, about one in three
 * (two in three of those came more than an hour after the workspace's last), waited 4.4 s while the head was read and
 * written again. A warm sends that head alone, with one word for a message and next to nothing to write
 * (ASK_WARM_MAX_TOKENS; the API takes no request for nothing at all beside an answer format and a stream), so the
 * cache is written by the time the question arrives and the question reads it.
 *
 * What a warm costs is what the question would have paid: the write moves from the question to the warm, and the
 * question then pays a read. A warm no question follows inside five minutes is a write spent for nothing, so the page
 * asks for one only when a question is on its way, and an instance warms one head (a workspace's, for a role, on a
 * model at an effort) once in four minutes: a second warm inside them, or a warm just after another member's, finds
 * the cache as warm as it can be made. The gateway counts it apart from Ask's rounds (purpose `ask_warm`), and
 * refuses it as it refuses a turn: a spent day, a paused workspace, a preview.
 *
 * It never fails the page: the warm is a help to the answer, not a condition of it. What it found and what it wrote
 * are said in the log (`ask_model_warmed`: cache_read and cache_written), which is how its worth is counted.
 */

/** How long an instance holds a head as warmed: under the cache's own five minutes, so a kept warm is a warm cache. */
const ASK_WARM_KEPT_MS = 4 * MIN_MS;
/** The heads this instance may hold as warmed: past it the oldest is forgotten (and may be warmed again). */
const WARMED_CAP = 500;
/** The one message a warm carries: no word of the workspace's, and nothing to answer. */
const WARM_WORDS = "Warm-up only: there is no question yet. Answer nothing.";

const warmedAt = new Map<string, number>();

/** Why a warm did not run, for the log: the gateway's own word, or that it broke. */
const whyNot = (e: unknown): string => (e instanceof GatewayRefused ? e.refusal.kind : "failed");

/**
 * Warm the head the member's next question begins with. Answers whether the model was asked: false when this instance
 * warmed the same head inside ASK_WARM_KEPT_MS, or when the warm could not run.
 */
export async function warmAskModel(
  ctx: RouteContext,
  member: Member,
  ports: AskPorts = askPorts(),
): Promise<{ warmed: boolean }> {
  const model = askModel();
  const tenantId = member.tenantId;
  const key = `${tenantId}|${member.role}|${model.id}|${model.effort}`;
  const kept = warmedAt.get(key);
  if (kept !== undefined && Date.now() - kept < ASK_WARM_KEPT_MS) return { warmed: false };
  // Kept before the model is asked, so two warms a moment apart are one; forgotten again if this one fails.
  warmedAt.delete(key);
  warmedAt.set(key, Date.now());
  if (warmedAt.size > WARMED_CAP) warmedAt.delete(warmedAt.keys().next().value as string);
  try {
    const rc = readerContext(ctx, member, undefined, { keep: true });
    const [{ facts }, shape] = await Promise.all([turnFacts(rc), ports.shape(rc).catch(() => "")]);
    const t0 = Date.now();
    const round = await ports.round(
      {
        tenantId,
        userId: ctx.userId,
        purpose: "ask_warm",
        request: {
          ...turnHead(model, member.role, facts, shape),
          max_tokens: ASK_WARM_MAX_TOKENS,
          messages: [{ role: "user", content: WARM_WORDS }],
        },
      },
      () => {},
    );
    log.info("ask_model_warmed", {
      tenant_id: tenantId,
      model: model.id,
      cache_read: round.usage?.cacheReadTokens ?? null,
      cache_written: round.usage?.cacheCreationTokens ?? null,
      ms: Date.now() - t0,
    });
    return { warmed: true };
  } catch (e) {
    warmedAt.delete(key);
    log.warn("ask_model_warm_failed", { tenant_id: tenantId, why: whyNot(e) });
    return { warmed: false };
  }
}
