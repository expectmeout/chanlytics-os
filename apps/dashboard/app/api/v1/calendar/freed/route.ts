import { z } from "zod";
import { AppError, CAMPAIGNS_PAUSED_WORDS, TODAY_PHONE_WORDS, offerRefusedWords } from "@chanlytics/contracts";
import { write, workspace } from "@/server/shared/route";
import { offerFreedNow } from "@/server/campaigns/playbook-run";

/** The visit cancelled: the edge reads the time it freed from the visit itself, never a span the page sends. */
const Freed = z.object({
  visit_id: z.uuid({ message: "Name what was cancelled." }),
});

/** Why an offer could not be made, in the owner's words, where it is not the time's or the run's own (offerRefusedWords). */
const REASON_WORDS: Record<string, string> = {
  preview: "Offering only works on the production dashboard.",
  no_step: "Nothing offers a freed time yet: set up Fill a cancellation in Campaigns.",
  paused: "Fill a cancellation is paused, or the workspace is, so nothing was offered.",
  nobody: TODAY_PHONE_WORDS.offer.nobody,
  off: "Fill a cancellation could not run just now.",
  payment_required: CAMPAIGNS_PAUSED_WORDS,
  run_failed: "The offer could not be made just now: something it reads did not answer. Try again in a minute.",
};

/** A reason in the owner's words: the time's or the run's own, else the page's, else the code said plainly. */
const saidOf = (reason: string, detail: string | null = null): string =>
  offerRefusedWords(reason, detail) ?? REASON_WORDS[reason] ?? `Nothing was offered (${reason}).`;

/**
 * POST /api/v1/calendar/freed — offer an hour a cancellation freed, now (Today in three zones, 2 Nov 2026; Offer it on
 * Today's day; decision 0082). The edge makes the offer it makes when the cancellation arrives: over the time the
 * receptionist would book now (contracts freedTimeOf, from the visit itself), the workspace's running step on
 * `slot_opened`, to the people who asked and never booked, once per appointment, its batch waiting for the owner's OK in
 * To decide where the sequence asks first and going on its own where it does not (`waits`). Owner or operator.
 */
export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "playbook",
  input: Freed,
  handle: async ({ ctx, member, input }) => {
    const r = await offerFreedNow(member.tenantId, ctx.userId, input.visit_id);
    if (!r.ok) {
      const sentence = saidOf(r.reason, r.detail ?? null);
      if (r.reason === "payment_required") throw new AppError("payment_required", sentence, 402);
      throw new AppError("upstream_meta", sentence, 502);
    }
    if (!r.offered) return { offered: false as const, people: 0, why: saidOf(r.why, r.detail ?? null) };
    return { offered: true as const, people: r.people, waits: r.waits };
  },
});
