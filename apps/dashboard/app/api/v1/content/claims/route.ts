import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { claimInput, keepClaimFor, withdrawClaimFor } from "@/server/content/claims";

/**
 * POST /api/v1/content/claims — `{ kind, text, source, valid_until? }`: what the owner claims, kept (00702; the content
 * loop PRD's 5.3): an offer, a price, a guarantee, or a fact they state until its day ends. What a post says is held to the
 * claims that stand (core evaluateClaimPolicy). Whoever may change the business's settings. Answers `{ claim }`.
 *
 * DELETE — `{ claim_id }`: a claim withdrawn. What carries it is held at its send, never taken down by itself. Answers
 * `{ withdrawn }`.
 *
 * The handles are in src/server/content/claims.ts.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: claimInput,
  handle: ({ ctx, input, member }) => keepClaimFor(ctx, member, input),
});

export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.strictObject({ claim_id: z.uuid() }),
  handle: ({ ctx, input, member }) => withdrawClaimFor(ctx, member, input),
});
