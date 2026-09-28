import { z } from "zod";
import { SPEND_TEXTING, AppError, MOCK_TEXTING_SENTENCE } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { edgeLines, EDGE_LINES_TIMEOUT_MS } from "@/server/connections/lines";
import { edgeRefusalWords } from "@/server/edge";

const Body = z.object({
  line_id: z.string().trim().min(1, "Which line?"),
});

/**
 * POST /api/v1/lines/register — file this line with the carriers.
 *
 * Owners only, and it costs the workspace money: a brand and a campaign
 * carry one-off and monthly fees ($4.50 for the brand and $15.00 for the
 * campaign, one time and non-refundable, on Chanlytics' account; see
 * requireSpend, which `spend` declares). The edge runs the saga; a refusal
 * is a result, not an error, so the row keeps what it made and the page can
 * say where it stopped. A campaign the carriers cannot accept yet is a wait,
 * not a failure, and the hourly sweep finishes it.
 *
 * `mock` files against the provider's free test registry instead — nothing
 * is charged and nothing routes. It is not offered to owners; it is how
 * this path is exercised before anyone pays.
 *
 * Every refusal the edge can give this route is named here, and each says what
 * happened in the owner's words. Two were missing and both reached the owner as
 * something untrue: a campaign the carriers SENT BACK fell through to "the
 * carriers did not answer", and a record the pre-flight refused arrived as the
 * literal string `record_incomplete`. A refusal a person cannot act on is what
 * made the first real filing take four rounds and a month.
 *
 * `sole_proprietor_unsupported` was handled here too — "a different registration,
 * which we do not offer yet". Gate 7 built that registration; nothing has produced
 * that token since, and the sentence was no longer true of the product, so it is
 * gone rather than left as a claim nobody can trigger.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "lines_register",
  spend: true,
  // A refusal here is about registering for texting, not about buying a number.
  spendWords: SPEND_TEXTING,
  input: Body,
  handle: async ({ member, input }) => {
    const a = await edgeLines(
      { op: "register", tenant_id: member.tenantId, line_id: input.line_id },
      EDGE_LINES_TIMEOUT_MS,
    );
    const b = a.body ?? {};
    if (a.status === 404) throw new AppError("not_found", "That line does not exist.", 404);
    if (a.status === 503 && b.error === "preview")
      throw new AppError("conflict", "Registering only works on the production dashboard.", 409);
    // The edge asks the billing question again on its own side, and it now asks
    // it of the FILING rather than of a flag, so a 402 can reach here where it
    // could not before. It carries the sentence whyCannotSpend wrote; reporting
    // it as "the carriers did not answer" would be about nothing that happened.
    if (a.status === 402)
      throw new AppError(
        "payment_required",
        typeof b.detail === "string" ? b.detail : "Billing needs attention before this can be filed.",
        402,
      );
    if (a.status === 409 && b.error === "no_business_record")
      throw new AppError("conflict", "Fill in your business on record first — the carriers ask who you are.", 409);
    if (a.status === 409 && b.error === "already_registered")
      throw new AppError("conflict", "This line is already registered with the carriers.", 409);
    // A rehearsal filing, which this route deliberately cannot replace: making it
    // real charges the workspace, so it is an operator's call with the record in
    // front of them, not the outcome of an owner pressing resubmit. Without this
    // case the catch-all below told them "the carriers did not answer", which was
    // about nothing that had happened.
    if (a.status === 409 && b.error === "mock_registration") throw new AppError("conflict", MOCK_TEXTING_SENTENCE, 409);
    // THE CARRIERS SENT IT BACK, which is a message they explicitly sent — and this
    // route answered "the carriers did not answer" about it, because a 409 is
    // neither of the two statuses the catch-all below lets through. Resubmitting is
    // deliberately not an owner's action (gate 6 put it behind `platform_admins`,
    // because a rejection needs somebody who can read what the carriers said), so
    // this says what happened and who has it rather than offering a button that
    // cannot work.
    if (a.status === 409 && b.error === "campaign_rejected") {
      const said = typeof b.reason === "string" && b.reason.trim() ? ` They said: ${b.reason.trim()}` : "";
      throw new AppError(
        "conflict",
        `The carriers sent this registration back.${said} Chanlytics resubmits it once the business on record answers what they named — correct it here and we take it from there.`,
        409,
      );
    }
    // The pre-flight refused, and it has SENTENCES: what is wrong and what to do,
    // in the owner's words. They used to be dropped — the edge stored them on the
    // row and returned a token, this route passed the token through, and the bridge
    // printed `record_incomplete` at the person who had just pressed the button.
    if (a.status === 409 && (b.error === "record_incomplete" || b.error === "sole_proprietor_incomplete")) {
      const problems = Array.isArray(b.problems)
        ? b.problems.filter((x: unknown): x is string => typeof x === "string" && !!x.trim())
        : [];
      throw new AppError(
        "conflict",
        problems.length
          ? problems.join(" ")
          : "Something on your business record is not ready for the carriers yet. Open it and the form will say which field.",
        409,
      );
    }
    if (a.status !== 200 && a.status !== 502)
      throw new AppError("internal", "The carriers did not answer. Try again in a moment.", 502);
    return {
      ok: b.ok === true,
      pending: b.pending === true,
      line: b.line ?? null,
      step: typeof b.step === "string" ? b.step : null,
      // Where the filing stopped, in the carrier's words (`detail`): the page shows it as it is.
      error: edgeRefusalWords(b),
    };
  },
});
