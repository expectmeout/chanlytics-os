/**
 * The model's answer to the ideas' question (lead-ideas-ask.ts), read back into ready plans with the code's rules held
 * whatever the model wrote: an idea in no US place, of a kind that did not work or that the business is itself, of a
 * kind searched where it names, passed on, or twice over, is dropped and counted by its rule. A places idea is planned
 * by the planner Ask's tool uses (planLeadSearch), in a listed place's own area or any US city, state or ZIP it names; a
 * people idea by the people card's (planPeopleSearch), an industry the directory does not list left out of it. Pure, like
 * the question's module; zod reads the answer, so this stays on the server (decision 0024, the browser's entry).
 */
import { z } from "zod";
import type { LeadIdeaDto, LeadIdeaRole } from "./lead-dtos";
import { IDEA_PASSED_ENOUGH, IDEA_SIZES, LEAD_IDEAS_MAX, ideaKey, ideaWhere, type IdeaPacket } from "./lead-ideas";
import { IDEA_LENGTHS, ideaAreaPhrase } from "./lead-ideas-ask";
import { clipAtWord } from "../shared/words";
import { BUSINESS_LINE_MAX } from "./search/caps";
import {
  planLeadSearch,
  planPeopleSearch,
  ProposeLeadSearchSchema,
  ProposePeopleSearchSchema,
} from "./lead-plan-schema";
import { PEOPLE_COMPANY_SIZES, PEOPLE_SENIORITIES, type LeadPeoplePlan } from "./search/people-plan";
import { peopleIndustryOf } from "./search/people-industries";
import type { LeadSearchPlan } from "./search/plan";
import { LeadSearchPlanSchema } from "./search/plan-schema";

const cut = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
/**
 * An idea's line the owner reads, kept to a little past what the model was asked for (IDEA_LENGTHS) and cut after a whole
 * word with an ellipsis: a why sliced at 140 characters ended "…beyond Broo" (22 Oct 2026).
 */
const wordsCut = (max: number) => z.string().transform((s) => clipAtWord(s.replace(/\s+/g, " "), max));
const textList = z.array(z.string()).catch([]);

/** The model's answer, read leniently: what does not fit a plan is dropped by ideasRead, never the whole answer. */
export const LeadIdeasAnswerSchema = z.object({
  line: z
    .string()
    .trim()
    .min(3)
    .transform((s) => clipAtWord(s.replace(/\s+/g, " "), BUSINESS_LINE_MAX)),
  ideas: z
    .array(
      z.object({
        card: z.enum(["places", "people"]).catch("places"),
        role: z.enum(["proven", "new", "wider"]).catch("new"),
        words: wordsCut(IDEA_LENGTHS.words * 2),
        why: wordsCut(IDEA_LENGTHS.why + 30),
        who: cut(80),
        who_one: cut(60),
        category_key: cut(40),
        terms: textList,
        place: z.string().catch(""),
        city: z.string().catch(""),
        state: z.string().catch(""),
        zip: z.string().catch(""),
        states: textList,
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
        leave_out: textList,
        seniority: textList,
        industries: textList,
        company_sizes: textList,
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

/** A people plan as Ask is asked for it: "Find practice managers at dental groups at 100 companies in California". */
function ideaPeopleAsk(plan: LeadPeoplePlan): string {
  return `Find ${plan.name} at ${plan.count} companies ${ideaAreaPhrase(plan.area.label)}`;
}

/** A size this month allows: the one asked, else the middle one. */
const sizeOf = (asked: number, p: IdeaPacket): number =>
  p.sizes.includes(asked) ? asked : (p.sizes[1] ?? p.sizes[0] ?? IDEA_SIZES[0]);

/** One places idea's plan: through the planner Ask's tool uses, in the listed place's own area or the US place it names. */
function placesPlanOf(idea: IdeaAnswer, key: string, p: IdeaPacket): LeadSearchPlan | null {
  const listed = p.places.find((x) => x.id === idea.place) ?? null;
  const zip = /^\d{5}$/.test(idea.zip.trim()) ? idea.zip.trim() : null;
  const city = idea.city.trim().slice(0, 60) || null;
  const region = listed ? listed.area.state : idea.state.trim();
  if (!listed && !region && !zip) return null;
  const terms = idea.terms.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 60);
  const where = listed ? listed.area.label : [city, region].filter(Boolean).join(", ") || (zip ? `near ${zip}` : "");
  const input = ProposeLeadSearchSchema.safeParse({
    looking_for: "local_businesses",
    country: "US",
    count: sizeOf(idea.count, p),
    who: idea.who,
    who_one: idea.who_one,
    category_key: key,
    terms: (terms.length ? terms : [idea.who]).slice(0, 3),
    city: listed ? null : city,
    region: region || "US",
    zip: listed ? null : zip,
    contact: idea.contact,
    criteria: idea.criteria.filter((c) => c.text.trim().length >= 2).slice(0, 3),
    leave_out: idea.leave_out
      .map((w) => w.trim())
      .filter((w) => w.length >= 2 && w.length <= 40)
      .slice(0, 4)
      .map((w) => ({ words: w })),
    asked: `${capFirst(idea.words)} ${ideaAreaPhrase(where)}`.slice(0, 400),
  });
  if (!input.success) return null;
  const r = planLeadSearch(input.data);
  if (!r.ok) return null;
  const placed = LeadSearchPlanSchema.safeParse(listed ? { ...r.plan, area: listed.area } : r.plan);
  return placed.success ? placed.data : null;
}

/** One people idea's plan: through the people card's planner, its industries the directory's own names or none. */
function peoplePlanOf(idea: IdeaAnswer, p: IdeaPacket): LeadPeoplePlan | null {
  const titles = idea.terms.map((t) => t.trim()).filter((t) => t.length >= 2 && t.length <= 60);
  const states = idea.states.map((s) => s.trim()).filter(Boolean);
  const industries = [
    ...new Set(idea.industries.map((i) => peopleIndustryOf(i)).filter((i): i is NonNullable<typeof i> => !!i)),
  ];
  const input = ProposePeopleSearchSchema.safeParse({
    looking_for: "people_at_companies",
    country: "US",
    count: sizeOf(idea.count, p),
    who: idea.who,
    terms: (titles.length ? titles : [idea.who_one || idea.who]).slice(0, 5),
    region: states.length ? states.join(", ") : "US",
    asked: `${capFirst(idea.words)} ${states.length ? `in ${states.join(", ")}` : "anywhere in the US"}`.slice(0, 400),
    seniority: idea.seniority.filter((s) => (PEOPLE_SENIORITIES as readonly string[]).includes(s)),
    industries: industries.slice(0, 5),
    company_sizes: idea.company_sizes.filter((s) => (PEOPLE_COMPANY_SIZES as readonly string[]).includes(s)),
  });
  if (!input.success) return null;
  const r = planPeopleSearch(input.data);
  return r.ok ? r.plan : null;
}

/** Why an idea the model wrote was not kept: the rule it broke (ideasRead counts them). */
export type IdeaDropped =
  "no_words" | "own_kind" | "did_not_work" | "place_unlisted" | "place_taken" | "passed" | "no_plan" | "twice";

/** Whether a kind was already searched in the place a plan names, or ran dry there: never planned there again. */
const takenAt = (p: IdeaPacket, key: string, label: string): boolean => {
  const at = label.toLowerCase();
  return (
    p.places.some((x) => x.area.label.toLowerCase() === at && x.takenFor.includes(key)) ||
    p.kinds.some((k) => k.key === key && (k.places.includes(at) || k.dry.includes(at)))
  );
};

/** One idea read back, or the rule that refuses it whatever the model wrote. */
function ideaOf(idea: IdeaAnswer, p: IdeaPacket): LeadIdeaDto | IdeaDropped {
  if (idea.words.length < 3) return "no_words";
  const key = ideaKey(idea.category_key || idea.who);
  if (p.ownKind && key === p.ownKind) return "own_kind";
  if (p.kinds.some((k) => k.key === key && k.verdict === "did_not_work")) return "did_not_work";
  const people = idea.card === "people";
  if (!people && idea.place !== "other" && !p.places.some((x) => x.id === idea.place)) return "place_unlisted";
  const plan = people ? null : placesPlanOf(idea, key, p);
  const peoplePlan = people ? peoplePlanOf(idea, p) : null;
  const made = plan ?? peoplePlan;
  if (!made) return "no_plan";
  const label = made.area.label;
  if (takenAt(p, key, label)) return "place_taken";
  if (p.passed.some((x) => x.key === key && x.place === label.toLowerCase() && x.times >= IDEA_PASSED_ENOUGH))
    return "passed";
  const role: LeadIdeaRole = idea.role;
  return {
    words: `${capFirst(idea.words)} ${ideaAreaPhrase(label)}`,
    who_for: idea.why,
    category_key: key,
    reach: null,
    plan,
    people: peoplePlan,
    role,
    ask: plan ? ideaAsk(plan) : peoplePlan ? ideaPeopleAsk(peoplePlan) : capFirst(idea.words),
  };
}

/**
 * The model's answer as the page's ideas, and what was dropped by which rule: each a ready plan on one of the two cards,
 * at most LEAD_IDEAS_MAX, none twice.
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
  const at = (i: LeadIdeaDto) => `${i.category_key}@${(ideaWhere(i) ?? "").toLowerCase()}`;
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
