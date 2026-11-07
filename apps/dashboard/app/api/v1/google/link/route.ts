import { z } from "zod";
import { write, workspace } from "@/server/shared/route";
import { AppError } from "@chanlytics/contracts";
import { callEdgeGoogle, readOutcome } from "@/server/connections/google";
import { edgeRefusalWords } from "@/server/shared/edge";

/**
 * POST /api/v1/google/link — {place_id}: this is the business on Google.
 * The edge reads the listing before keeping it, so a wrong id is refused
 * here and never becomes a row that reads nothing. Owners only.
 *
 * DELETE /api/v1/google/link — the listing, its reviews and its days, gone.
 */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const REASON_WORDS: Record<string, string> = {
  no_places_key: "Finding listings is not available here yet.",
  unreadable: "Google could not read that listing. Pick it again from a fresh search.",
};

export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  input: z.object({ place_id: z.string().nullish() }),
  handle: async ({ ctx, input, member }) => {
    const placeId = (input.place_id ?? "").trim();
    if (!PLACE_ID.test(placeId)) throw new AppError("validation", "Pick a listing from the search first.", 400);
    const answer = await callEdgeGoogle(
      { op: "link", tenant_id: member.tenantId, user_id: ctx.userId, place_id: placeId },
      25_000,
    );
    const result = answer.body ?? {};
    if (answer.status !== 200 || result.ok !== true) {
      const reason = typeof result.error === "string" ? result.error : "failed";
      throw new AppError(
        reason === "no_places_key" ? "conflict" : "internal",
        REASON_WORDS[reason] ?? `The listing could not be linked (${edgeRefusalWords(result) ?? reason}).`,
        reason === "no_places_key" ? 409 : 502,
      );
    }
    return { listing: result.listing ?? null, read: readOutcome(result.read) };
  },
});

export const DELETE = write({
  scope: workspace,
  role: "partner",
  rate: "google_link",
  handle: async ({ ctx, member }) => {
    const answer = await callEdgeGoogle({ op: "unlink", tenant_id: member.tenantId, user_id: ctx.userId }, 15_000);
    const body = answer.body ?? {};
    if (answer.status !== 200 || body.ok !== true)
      throw new AppError(
        "internal",
        (typeof body.error === "string" ? REASON_WORDS[body.error] : null) ??
          edgeRefusalWords(body) ??
          "The listing could not be removed. Try again.",
        502,
      );
    return { removed: body.removed === true };
  },
});
