import { after } from "next/server";
import { read, write, workspace } from "@/server/route";
import { morningLanguage, morningOf, startMorning } from "@/server/ask/companion/morning";

/**
 * Ask's morning on Today (decision 0070; server/ask/companion/morning.ts).
 *
 * GET /api/v1/ask/morning — the caller's morning of today, as Today draws it: none, writing, ready (the Say and the
 * cards still waiting, at most three), quiet or failed, and whether they may have one at all (`offered`: mornings on,
 * and a member who acts).
 *
 * POST /api/v1/ask/morning — Today asks for it as the member arrives, { language, locale }: the page's language Ask
 * answers in, and the browser's tag the thread's date is written in. The day is claimed once a member a day; the call
 * that wins answers at once with the morning writing, and the turn runs after the response (next/server's `after`),
 * with no stop: a tab closed does not stop it. Counted as a question (the ask rate), and an operator's at least, since a
 * viewer approves no card.
 */

// A turn's budget (contracts ASK_TURN_BUDGET_MS) and the time to store its answer, as POST ask has.
export const maxDuration = 150;

export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => ({ morning: await morningOf(ctx, member, Date.now()) }),
});

/** The platform waits for the morning after the response has gone; outside a request (a test) nobody is told. */
function waitFor(run: Promise<void>): void {
  try {
    after(run);
  } catch {
    /* no request scope */
  }
}

export const POST = write({
  scope: workspace,
  role: "operator",
  rate: "ask",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { language?: unknown; locale?: unknown } | null;
    const { morning, run } = await startMorning(
      ctx,
      member,
      { language: morningLanguage(body?.language), locale: body?.locale },
      Date.now(),
    );
    if (run) waitFor(run);
    return { morning };
  },
});
