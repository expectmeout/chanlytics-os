/**
 * One search's strip, as a view model (moved from legacy/pages/leads-finder.jsx, decision 0015): what is true of its latest
 * round, in the owner's words (sections 8.4, 8.5, 8.8; P3, S12). Every open state and all nine endings, each saying what
 * happened, what was kept and what was counted, and offering one next step. Nothing here says a number nothing measured,
 * and nothing says a price: the owner's unit is leads (section 0.2). The nine ending sentences are contracts' own
 * (`leadEndingLine`), so no word is spelled twice.
 */
import {
  LEAD_QUESTION_WAIT_LINE,
  PEOPLE_STRIP_WORDS,
  leadEndingFound,
  leadEndingLine,
  leadNearWhere,
  peopleWho,
  planArea,
  planMinutes,
  planReachMiles,
  planWhere,
  planWho,
  type LeadPeoplePlan,
  type LeadSearchDto,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import type { StripAction, StripVM } from "./types";

/** The next steps that make a new round: a strip offers one of them, never two. */
export const LEAD_ROUND_MAKERS = [
  "more",
  "nearby",
  "look_further",
  "reach_further",
  "carry_on",
  "try_again",
  "answer_now",
];
/** The first 25 size the rest of a round (S6): contracts' LEAD_PROBE_PLACES. */
const LEAD_PROBE_SEEN = 25;

const ldLowerFirst = (s: string) =>
  s && s[1] && s[1] === s[1].toLowerCase() && s[1] !== s[1].toUpperCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;

/** What the plan leaves out, by key: "chain gyms" for Include, and for the sentence that says nothing matched. */
const ldLeftOut = (plan: LeadSearchPlan, key: string) => {
  const e =
    (plan.exclusions || []).filter((x) => x.key === key)[0] || (plan.criteria || []).filter((x) => x.key === key)[0];
  return e ? ldLowerFirst(e.text) : null;
};

/** A step that points somewhere else: the plan opens on the nearest area the round wrote (00145). */
const ldLookStep = (id: string) => id === "nearby" || id === "look_further";

/** The first area a round found past the search's reach (decision 0133), which Look up to 50 miles carries on from. */
const ldBeyond = (r: Round) => (r.nearby || []).find((a) => typeof a.beyond_m === "number") ?? null;

/** What a step's press opens: the left-out view, the plan on the nearest area, the plan with the reach past it, or the plan. */
const ldStepArg = (id: string, s: PlacesSearch, look: boolean): unknown => {
  const beyond = id === "reach_further" ? ldBeyond(s.round) : null;
  if (id === "excluded") return "excluded";
  if (look) return { ...s.plan, area: s.round.nearby[0] };
  return beyond ? { ...s.plan, reach_m: beyond.beyond_m } : s.plan;
};

type Round = NonNullable<LeadSearchDto["round"]>;
/** A places search with its round: what every reader below the people branch is handed. */
type PlacesSearch = LeadSearchDto & { round: Round; plan: LeadSearchPlan };

/**
 * What the search is counting to: what the owner asked for, never the first 25 the probe sizes the round with (Ruben, 14
 * Nov 2026: asked for 300, the strip said "0 of 25"), nor what a leg or a top-up still wants: their count runs across the
 * whole search (decision 0133), so 120 found before is 120 of 300, never of the 180 left. A renewal finds its count anew.
 */
const ldGoal = (r: Round, plan: LeadSearchPlan): number =>
  r.purpose === "probe" ? Math.max(r.target, plan.count) : r.purpose === "renew" ? r.target : plan.count;

/** How far past the reach the round found an area, in miles, where it found one (decision 0133). */
const ldFurther = (s: PlacesSearch): { further?: number } => {
  const beyond = ldBeyond(s.round);
  return beyond ? { further: planReachMiles({ area: s.plan.area, reach_m: beyond.beyond_m }) } : {};
};

/** What leadEndingLine needs, read off the search's latest round and its plan. */
const ldEndingFacts = (s: PlacesSearch, nearby: readonly string[], renewsOn: string | null) => {
  const r = s.round;
  const only = s.plan.exclusions.length === 1 && s.plan.exclusions[0] ? ldLowerFirst(s.plan.exclusions[0].text) : null;
  return {
    name: planWho(s.plan),
    area: planArea(s.plan.area),
    counted: r.counted,
    target: ldGoal(r, s.plan),
    emails: r.emails_checked,
    phones: r.with_phone,
    // A search the finder ran shows its finished leads alone (decision 0133): what it set aside is ours, never a pile or a
    // number of its ending. A list of the owner's own draws its own strip (lists.stripOf).
    excluded: 0,
    reachMiles: planReachMiles(s.plan),
    ...(renewsOn ? { renewsOn } : {}),
    ...ldFurther(s),
    checking: r.state === "checking",
    // A leg is the search's last round once it widened (decision 0133): what it found is in and near the card's area.
    ...(r.purpose === "widen" ? { widened: true } : {}),
    foundBefore: r.counted,
    // Where to look next: what the caller knows, else what the round itself wrote when it ran dry (00145).
    nearby: nearby.length ? [...nearby] : (r.nearby || []).map((a) => a.label),
    // What the source returned at all: every place this round judged, however it was classed.
    seen: r.qualified + r.review + r.excluded,
    leftOutBy: only,
  };
};

/**
 * A leg the day's searching could not hold (decision 0133, 00634): reserved from tomorrow's day, it starts by itself at
 * midnight in the workspace's zone. What it found so far, and Stop, which ends it and gives back what it held.
 */
const dayWaitStrip = (counted: number, goal: number, audience: string): StripVM => ({
  state: "ended",
  alert: false,
  title: `Found ${counted} of ${goal} ${audience} so far`,
  parts: ["today's searching is used up", "it carries on tomorrow by itself"],
  progress: goal > 0 ? Math.min(1, counted / goal) : null,
  actions: [{ id: "stop", label: "Stop" }],
});

/**
 * A round put off until the month's leads renew (decision 0133): what it will find and when, and Don't, which ends it
 * and gives back what it held. Nothing is searched or counted before.
 */
const waitingStrip = (r: Round, audience: string, renewsOn: string | null): StripVM => ({
  state: "ended",
  alert: false,
  title: `Finds the other ${r.target} ${audience} on ${renewsOn ?? "the day your leads renew"}`,
  parts: ["when your leads renew", "nothing is searched or counted before then"],
  progress: null,
  actions: [{ id: "not_on_renewal", label: "Don't" }],
});

/** A round that stopped to ask: the question in the accent, and the four answers to it. */
function questionStrip(
  plan: LeadSearchPlan,
  question: NonNullable<Round["question"]>,
  progress: number | null,
): StripVM {
  // Include lifts one of the plan's own exclusions. A key the plan does not hold as one -- gone, empty, or a requirement --
  // has nothing to lift, and a button that cannot work is not drawn: "Include what I left out" once stood here, lifted
  // nothing, and the door refused the unchanged plan. The no that changes the search is Change what I asked, which the
  // page opens under the question.
  const key = question.criterion_key;
  const lifted = key && (plan.exclusions || []).some((x) => x.key === key) ? ldLeftOut(plan, key) : null;
  return {
    state: "question",
    alert: true,
    title: question.sentence,
    parts: LEAD_QUESTION_WAIT_LINE ? [LEAD_QUESTION_WAIT_LINE] : [],
    progress,
    actions: [
      { id: "keep", label: "Yes, keep going", primary: true },
      ...(lifted ? [{ id: "include", label: `Include ${lifted}`, arg: key }] : []),
      { id: "change", label: "Change what I asked" },
      { id: "stop_here", label: "Stop here" },
    ],
  };
}

/** A round that ended: the sentence's own next step, then Sort by fit where the table is worth re-ordering. */
function endedStrip(s: PlacesSearch, nearby: readonly string[], renewsOn: string | null): StripVM {
  const r = s.round;
  const counted = r.counted;
  const line = leadEndingLine(r.ending || "paused", ldEndingFacts(s, nearby, renewsOn));
  const look = !!line.step && ldLookStep(line.step.id) && !!r.nearby && r.nearby.length > 0;
  const step: StripAction[] = line.step
    ? [
        {
          id: line.step.id,
          label: line.step.label,
          primary: line.step.id !== "excluded" && line.step.id !== "sort_fit",
          arg: ldStepArg(line.step.id, s, look),
          where: look ? `Look ${leadNearWhere(r.nearby.map((a) => a.label))}` : null,
        },
      ]
    : [];
  const sorts =
    counted > 0 &&
    (r.ending === "target_reached" || r.ending === "searched_everything" || r.ending === "reach_searched") &&
    (!line.step || line.step.id !== "sort_fit")
      ? [{ id: "sort_fit", label: "Sort by fit" }]
      : [];
  // No way into Needs review or Left out (decision 0133): a search shows its finished leads, and what it set aside is
  // the team's to read, in the Console.
  // Only an ending that delivered wears the check and the full bar: one the source could not start did too (29 Oct 2026).
  const found = leadEndingFound(r.ending || "paused", { counted });
  return {
    state: found ? "found" : "ended",
    alert: false,
    title: line.title,
    parts: line.parts,
    progress: found ? 1 : null,
    actions: [...step, ...sorts],
  };
}

/**
 * A people search's strip (00430): its run reads companies (each waiting on its address, then checked), so it says the
 * companies found so far and the addresses checked, then how it ended against the companies asked for, in its own
 * words. Its next step is Find more like these, the Find people sheet filled in with its plan: never a places door.
 */
const peopleStripOf = (s: LeadSearchDto, plan: LeadPeoplePlan): StripVM => {
  const r = s.round;
  const PW = PEOPLE_STRIP_WORDS;
  const who = peopleWho(plan);
  if (!r) return { state: "ended", alert: false, title: PW.none(who), parts: [], progress: null, actions: [] };
  const seen = r.qualified + r.review + r.excluded;
  const progress = r.target > 0 ? Math.min(1, r.counted / r.target) : null;
  if (r.state === "checking")
    return { state: "checking", alert: false, title: PW.checking(seen), parts: [], progress, actions: [] };
  if (r.state !== "ended")
    return {
      state: "running",
      alert: false,
      title: PW.running(who),
      parts: [PW.found(seen), PW.checked(r.emails_checked)],
      progress,
      actions: [{ id: "stop", label: PW.stop }],
    };
  // Its finished companies alone (decision 0133): no way into what the finder set aside.
  const found = !!r.ending && leadEndingFound(r.ending, { counted: r.counted });
  return {
    state: found ? "found" : "ended",
    alert: false,
    title: PW.ended(r.ending, r.counted, r.target),
    parts: [],
    progress: found ? 1 : null,
    actions: [{ id: "people_more", label: PW.more, primary: true, arg: plan }],
  };
};

const ldStripOf = (
  s: LeadSearchDto | null,
  now: Date,
  nearby: readonly string[],
  renewsOn: string | null,
): StripVM | null => {
  if (!s) return null;
  if (s.people) return peopleStripOf(s, s.people);
  if (!s.plan) return null;
  const r = s.round;
  const plan = s.plan;
  const who = planWho(plan);
  const where = planWhere(plan.area);
  if (!r)
    return {
      state: "ended",
      alert: false,
      title: `Nothing has run for ${who} yet`,
      parts: [],
      progress: null,
      actions: [],
    };
  const withRound: PlacesSearch = { ...s, plan, round: r };
  const counted = r.counted;
  const goal = ldGoal(r, plan);
  const progress = goal > 0 ? Math.min(1, counted / goal) : null;
  // Removing the untouched leads (POST lead-searches/[id]/undo) is the search menu's, named for what it removes and gives
  // back (contracts leadUndoable): an "Undo" here, beside "the 24 found are yours", read as deleting what was just paid for.
  if (r.state === "waiting_on_owner" && r.question) return questionStrip(plan, r.question, progress);
  if (r.state === "queued" && r.starts_at && Date.parse(r.starts_at) > now.getTime())
    return r.purpose === "widen" ? dayWaitStrip(counted, goal, who) : waitingStrip(r, who, renewsOn);
  if (r.state === "checking") {
    // After Stop the emails of what was already found are still checked, and the strip says so in the ending's own words,
    // with `checking` true (S12, 17).
    if (String(r.ending_pending) === "stopped") {
      const line = leadEndingLine("stopped", ldEndingFacts(withRound, nearby, renewsOn));
      return { state: "checking", alert: false, title: line.title, parts: line.parts, progress, actions: [] };
    }
    return {
      state: "checking",
      alert: false,
      title: `Checking the emails of the ${counted} found`,
      parts: [],
      progress,
      actions: [],
    };
  }
  if (r.state !== "ended") {
    const minutesLeft = Math.max(1, Math.round(planMinutes(plan) * (1 - (progress || 0))));
    const parts = [`${counted} of ${goal}`, `${r.emails_checked} emails checked`, `about ${minutesLeft} min left`];
    // The first 25 size the rest of the round (S6), so until they are in the estimate is an assumption and says so (P3).
    if (counted < LEAD_PROBE_SEEN) parts.push("estimates update after the first 25");
    // A leg reads the next area out (decision 0133): the strip names it, and says it comes after the card's area. Never
    // that the card's area is searched: a round also moves on from a term it asked no deeper, or one its reserve cut
    // short, and a screen says only what is known (docs/words.md).
    const leg = r.purpose === "widen" && r.area ? r.area : null;
    if (leg) parts.splice(1, 0, `after ${planArea(plan.area)}`);
    return {
      state: "running",
      alert: false,
      title: `Finding ${who} ${leg ? planWhere(leg) : where}`,
      parts,
      progress,
      count: { n: counted, of: goal },
      actions: [{ id: "stop", label: "Stop" }],
    };
  }
  // Every ending is said once, by contracts' leadEndingLine. The strip composes.
  return endedStrip(withRound, nearby, renewsOn);
};

/**
 * One search's strip, with `offered`: what a refresh found and the surface is holding back, because the owner is not
 * reading in the order found (E8). The strip says the count, and nothing re-sorts under them until it is pressed. While
 * the search runs the count is a quiet button; once it has ended, what it held back is what the owner came for, so
 * "Show N new" leads as the strip's one main button (29 Oct 2026: a finished search showed 2 of its 8 behind a "6 new"
 * read as a label).
 */
export const leadStrip = (
  s: LeadSearchDto | null,
  now: Date,
  extra?: { nearby?: string[]; offered?: number; month?: { renewsOn: string } | null } | null,
) => {
  const vm = ldStripOf(s, now, (extra && extra.nearby) || [], (extra && extra.month && extra.month.renewsOn) || null);
  if (!vm) return null;
  const n = (extra && extra.offered) || 0;
  if (n <= 0) return vm;
  if (vm.state !== "found" && vm.state !== "ended")
    return { ...vm, actions: [{ id: "take_offered", label: `${n} new` }, ...vm.actions] };
  return {
    ...vm,
    actions: [
      { id: "take_offered", label: `Show ${n} new`, primary: true },
      ...vm.actions.map((a) => ({ ...a, primary: false })),
    ],
  };
};
