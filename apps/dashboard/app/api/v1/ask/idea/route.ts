import { AppError } from "@chanlytics/contracts";
import { write, workspace } from "@/server/route";
import { keepIdeaCard } from "@/server/ask/tools/act/leads/idea-card";

/**
 * POST /api/v1/ask/idea — an idea pressed on Leads' first day, as a card in Ask (Ruben, 23 Oct 2026: Ask opens with the
 * card, and a change is said to Ask, which updates it).
 *
 * Body: { words }, the idea as the page shows it. The idea is read from the workspace's own ideas by those words; its
 * search, the plan the idea already holds, is made a card with no model asked and nothing spent, and kept as the first
 * answer of a thread of its own, titled by the idea, which the Line then opens. An idea pressed again while its card
 * still waits opens the thread it waits in. Answers { thread: { id, title } }.
 *
 * The owner's and the partner's, as a search is (the card starts one), counted as questions.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "ask",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { words?: unknown } | null;
    const words = typeof body?.words === "string" ? body.words.trim() : "";
    if (!words || words.length > 200) throw new AppError("validation", "Pick one of the ideas shown.");
    return keepIdeaCard(ctx, member.tenantId, words);
  },
});
