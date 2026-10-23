import "server-only";
import {
  AppError,
  ASK_ANSWER_CAPS,
  LEAD_MAX_PLACES,
  PEOPLE_COUNT_MAX,
  answerForCards,
  planSentence,
  planWho,
  startsSearch,
  v1FromAnswer,
  type AskAnswer,
  type AskProposal,
  type LeadIdeaDto,
} from "@chanlytics/contracts";
import { leadCardsLive } from "@chanlytics/db";
import type { RouteContext } from "../../../../with-route";
import { suggestionsKept } from "../../../../leads/lead-suggestions";
import { planFacts } from "../../../../leads/lead-plan-facts";
import { peopleCard } from "./lead-search";
import { propose } from "../../context";
import { titleFromQuestion } from "../../../prompt";
import { appendMessage, createThread, listThreads, readThread, touchThread } from "../../../store";

/**
 * An idea pressed (Ruben, 23 Oct 2026: "allow the ask to open up and provide a card … if user wants to tweak anything
 * they can just conversate with the ask so the ask can update the card"): its search as a card in Ask, made from the plan
 * the idea already holds, with no model asked and nothing spent, kept as the first answer of a thread of its own, so the
 * Line opens on it and a change said there is a turn like any other (the card it makes replaces this one, contracts
 * leads/search/search-card.ts). The idea is read from the workspace's own ideas by its words, never taken from the page.
 */

/** What the answer over the card says: why this idea, and that a change is said here. */
const IDEA_DETAIL = "Say what to change and I'll update the card. Nothing is searched until you press Find.";

/** The thread's title and its question: the idea's own words, as the first day showed them. */
const ideaTitle = (words: string) => titleFromQuestion(words.charAt(0).toUpperCase() + words.slice(1));

/** The answer over an idea's card: the idea's why, the way to change it, and two changes most often said, ready to tap. */
function ideaAnswer(idea: LeadIdeaDto, card: AskProposal): AskAnswer {
  const a = answerForCards([card], "en", null, null);
  const why = idea.who_for.trim();
  a.say.headline = (why || `Here is the search for ${idea.words}.`).slice(0, ASK_ANSWER_CAPS.headline);
  a.say.detail = IDEA_DETAIL;
  const count = idea.plan?.count ?? idea.people?.count ?? 0;
  const most = idea.people ? PEOPLE_COUNT_MAX : LEAD_MAX_PLACES;
  const website = idea.plan?.criteria.some((c) => /website/i.test(c.text)) ?? true;
  a.do.next = [
    ...(count > 0 && count * 2 <= most ? [`Make it ${count * 2}`] : []),
    ...(idea.plan && !website ? ["Only ones with a website"] : []),
  ].slice(0, ASK_ANSWER_CAPS.next);
  return a;
}

/** The idea's search as a card: a places plan, or a people plan where the people card finds leads now (00430). */
async function ideaCard(ctx: RouteContext, tenantId: string, idea: LeadIdeaDto, title: string, now: Date) {
  if (idea.people) {
    const live = await leadCardsLive(ctx.supabase).catch(() => [] as string[]);
    if (!live.includes("people_at_companies"))
      throw new AppError(
        "conflict",
        "Finding people at companies opens once it has been checked. Nothing was started.",
        409,
      );
    return propose(await peopleCard(ctx, tenantId, now, { ...idea.people, from: "idea" }, title)).proposal;
  }
  if (!idea.plan) return null;
  // A new search, at the plan's first version: what the door starts (lead_search_create), and from an idea (the ideas'
  // own measure of whether they are followed).
  const plan = { ...idea.plan, version: 1, from: "idea" as const };
  const facts = await planFacts(ctx, tenantId, { categoryKey: plan.category_key ?? null, now });
  return propose({
    kind: "lead_search",
    title,
    summary: planSentence(plan),
    payload: { plan, view: { title: `Find ${plan.count} ${planWho(plan)}` }, facts },
  }).proposal;
}

/** The thread an idea pressed before opened, while its card still waits: pressed again, it opens there, never twice. */
async function ideaThreadWaiting(ctx: RouteContext, tenantId: string, title: string) {
  const twin = (await listThreads(ctx, tenantId)).find((t) => t.title === title);
  if (!twin) return null;
  const found = await readThread(ctx, twin.id);
  const waits = found?.messages.some((m) => m.proposals.some((p) => !p.outcome && startsSearch(p)));
  return waits && found ? { id: found.thread.id, title: found.thread.title } : null;
}

/**
 * POST ask/idea's work: the idea named by its words, its card kept as the answer of a new thread (or the thread it waits
 * in), and the thread said back for the Line to open. An idea the workspace no longer holds is said, as is one kept from
 * before ideas were plans, which the page asks Ask in words instead.
 */
export async function keepIdeaCard(
  ctx: RouteContext,
  tenantId: string,
  words: string,
  now: Date = new Date(),
): Promise<{ thread: { id: string; title: string } }> {
  const ideas = await suggestionsKept(ctx, tenantId);
  const idea = ideas.items.find((i) => i.words === words);
  if (!idea) throw new AppError("not_found", "That idea has changed. Pick one of the ideas shown now.", 404);
  if (!idea.plan && !idea.people) throw new AppError("validation", "That idea has no search to start yet.", 400);
  const title = ideaTitle(idea.words);
  const waiting = await ideaThreadWaiting(ctx, tenantId, title);
  if (waiting) return { thread: waiting };
  const made = await ideaCard(ctx, tenantId, idea, title, now);
  if (!made) throw new AppError("validation", "That idea has no search to start yet.", 400);
  const thread = await createThread(ctx, tenantId, title, null);
  // The card carries the thread it was planned in, as a turn's does (turn.ts), so the search keeps it (00172).
  const card: AskProposal = { ...made, payload: { ...made.payload, thread_id: thread.id } };
  const answer = ideaAnswer(idea, card);
  await appendMessage(ctx, thread.id, tenantId, "user", { text: title });
  await appendMessage(ctx, thread.id, tenantId, "assistant", {
    v: 2,
    answer,
    ...v1FromAnswer(answer),
    proposals: [card],
    language: answer.language,
    failed: false,
    idea: true,
  });
  await touchThread(ctx, thread.id, undefined);
  return { thread: { id: thread.id, title: thread.title } };
}
