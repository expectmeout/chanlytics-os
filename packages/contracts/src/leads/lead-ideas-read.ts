/**
 * The model's answer to the ideas' question (lead-ideas.ts), read back into ready plans with the code's rules held
 * whatever the model wrote: an idea in no listed place, of a kind that did not work or that the business is itself, of
 * a kind searched where it names, passed on twice, or twice over, is dropped and counted by its rule. Pure, like the
 * question's module; zod reads the answer, so this stays on the server (decision 0024, the browser's entry).
 */
import { z } from "zod";
import type { LeadIdeaDto } from "./lead-dtos";
import {
  IDEA_PASSED_ENOUGH,
  IDEA_SIZES,
  LEAD_IDEAS_MAX,
  ideaAreaPhrase,
  ideaKey,
  type IdeaPacket,
  type IdeaPlace,
} from "./lead-ideas";
import { planLeadSearch, ProposeLeadSearchSchema } from "./lead-plan-schema";
import type { LeadSearchPlan } from "./search/plan";
import { LeadSearchPlanSchema } from "./search/plan-schema";

const cut = (max: number) => z.string().transform((s) => s.trim().slice(0, max));

/** The model's answer, read leniently: what does not fit a plan is dropped by ideasFrom, never the whole answer. */
export const LeadIdeasAnswerSchema = z.object({
  line: z
    .string()
    .trim()
    .min(3)
    .transform((s) => s.slice(0, 160)),
  ideas: z
    .array(
      z.object({
        words: cut(80),
        why: cut(140),
        who: cut(60),
        who_one: cut(60),
        category_key: cut(40),
        terms: z.array(z.string()).catch([]),
        place: z.string().catch(""),
        count: z.number().int().catch(IDEA_SIZES[1]),
        contact: z.enum(["email", "phone"]).catch("email"),
        criteria: z
          .array(
            z.object({
              text: z.string(),
              standard: z.enum(["likely", "seen"]).catch("likely"),
              required: z.boolean().catch(false),
            }),
          )
          .catch([]),
        leave_out: z.array(z.string()).catch([]),
      }),
    )
    .min(1),
});
export type LeadIdeasAnswer = z.infer<typeof LeadIdeasAnswerSchema>;
type IdeaAnswer = LeadIdeasAnswer["ideas"][number];

/* ------------------------------------------------------------ the answer -- */

const capFirst = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** The plan as Ask is asked for it (Ask's Leads chip): "Find 50 plumbers near 78701, leaving out chains". */
export function ideaAsk(plan: LeadSearchPlan): string {
  const out = plan.exclusions.map((x) => x.text);
  return `Find ${plan.count} ${plan.name} ${ideaAreaPhrase(plan.area.label)}${out.length ? `, leaving out ${out.join(" and ")}` : ""}`;
}

/** One idea's plan: through the planner Ask's tool uses, then set in the listed place's own area. */
function ideaPlanOf(idea: IdeaAnswer, key: string, place: IdeaPlace, p: IdeaPacket): LeadSearchPlan | null {
  const terms = idea.terms.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 60);
  const input = ProposeLeadSearchSchema.safeParse({
    looking_for: "local_businesses",
    country: "US",
    count: p.sizes.includes(idea.count) ? idea.count : (p.sizes[1] ?? p.sizes[0] ?? IDEA_SIZES[0]),
    who: idea.who,
    who_one: idea.who_one,
    category_key: key,
    terms: (terms.length ? terms : [idea.who]).slice(0, 3),
    city: null,
    region: place.area.state,
    zip: null,
    contact: idea.contact,
    criteria: idea.criteria.filter((c) => c.text.trim().length >= 2).slice(0, 3),
    leave_out: idea.leave_out
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && w.length <= 40)
      .slice(0, 4)
      .map((words) => ({ words })),
    asked: `${capFirst(idea.words)} ${ideaAreaPhrase(place.area.label)}`.slice(0, 400),
  });
  if (!input.success) return null;
  const r = planLeadSearch(input.data);
  if (!r.ok) return null;
  const placed = LeadSearchPlanSchema.safeParse({ ...r.plan, area: place.area });
  return placed.success ? placed.data : null;
}

/** Why an idea the model wrote was not kept: the rule it broke (ideasRead counts them). */
export type IdeaDropped =
  "no_words" | "own_kind" | "did_not_work" | "place_unlisted" | "place_taken" | "passed" | "no_plan" | "twice";

/** One idea read back, or the rule that refuses it whatever the model wrote. */
function ideaOf(idea: IdeaAnswer, p: IdeaPacket): LeadIdeaDto | IdeaDropped {
  if (idea.words.length < 3) return "no_words";
  const key = ideaKey(idea.category_key || idea.who);
  if (p.ownKind && key === p.ownKind) return "own_kind";
  if (p.kinds.some((k) => k.key === key && k.verdict === "did_not_work")) return "did_not_work";
  const place = p.places.find((x) => x.id === idea.place) ?? null;
  if (p.places.length && !place) return "place_unlisted";
  if (place && place.takenFor.includes(key)) return "place_taken";
  if (
    place &&
    p.passed.some((x) => x.key === key && x.place === place.area.label.toLowerCase() && x.times >= IDEA_PASSED_ENOUGH)
  )
    return "passed";
  const plan = place ? ideaPlanOf(idea, key, place, p) : null;
  if (place && !plan) return "no_plan";
  const words = capFirst(idea.words);
  return {
    words: place ? `${words} ${ideaAreaPhrase(place.area.label)}` : words,
    who_for: idea.why,
    category_key: key,
    reach: null,
    plan,
    ask: plan ? ideaAsk(plan) : words,
  };
}

/**
 * The model's answer as the page's ideas, and what was dropped by which rule: each a ready plan in a listed place, at
 * most LEAD_IDEAS_MAX, none twice.
 */
export function ideasRead(
  answer: LeadIdeasAnswer,
  p: IdeaPacket,
): { items: LeadIdeaDto[]; dropped: Partial<Record<IdeaDropped, number>> } {
  const items: LeadIdeaDto[] = [];
  const dropped: Partial<Record<IdeaDropped, number>> = {};
  const drop = (why: IdeaDropped) => {
    dropped[why] = (dropped[why] ?? 0) + 1;
  };
  const at = (i: LeadIdeaDto) => `${i.category_key}@${i.plan ? i.plan.area.label.toLowerCase() : ""}`;
  for (const idea of answer.ideas) {
    if (items.length === LEAD_IDEAS_MAX) break;
    const item = ideaOf(idea, p);
    if (typeof item === "string") drop(item);
    else if (items.some((o) => at(o) === at(item))) drop("twice");
    else items.push(item);
  }
  return { items, dropped };
}

/** The model's answer as the page's ideas alone. */
export function ideasFrom(answer: LeadIdeasAnswer, p: IdeaPacket): LeadIdeaDto[] {
  return ideasRead(answer, p).items;
}
