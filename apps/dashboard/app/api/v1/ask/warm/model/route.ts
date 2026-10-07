import { write, workspace } from "@/server/route";
import { warmAskModel } from "@/server/ask/warm";

/**
 * POST /api/v1/ask/warm/model — the model's cache, written before the question is asked (server/ask/warm.ts).
 *
 * The page sends it when a question is on its way (words being typed on the Line, a hold on the mic): the head of
 * the turn this member would send next goes to the model ahead of it, so the question finds it cached and its first
 * words come about two seconds sooner than a cold one's. It carries no body: the head is the workspace's, the role's
 * and the deployment's model, none of it the page's. It answers whether the model was asked (`warmed`), which it is
 * not when this instance warmed the same head in the last four minutes, or when the warm could not run; a warm never
 * fails the page.
 *
 * Every member who may ask may warm, and it is counted as a question is (the `ask` bucket): it asks the model. The
 * edge counts what it spends apart from Ask's rounds, and refuses it as it refuses a turn.
 */

export const maxDuration = 30;

export const POST = write({
  scope: workspace,
  role: "viewer",
  rate: "ask",
  handle: async ({ ctx, member }) => warmAskModel(ctx, member),
});
