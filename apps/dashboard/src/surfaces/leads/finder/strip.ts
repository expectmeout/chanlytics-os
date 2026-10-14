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
  leadEndingLine,
  leadNearWhere,
  peopleWho,
  planArea,
  planMinutes,
  planWhere,
  planWho,
  type LeadPeoplePlan,
  type LeadSearchDto,
  type LeadSearchPlan,
} from "@chanlytics/contracts";
import type { StripAction, StripVM } from "./types";

/** The six next steps that make a new round: a strip offers one of them, never two. */
export const LEAD_ROUND_MAKERS = ["more", "nearby", "look_further", "carry_on", "try_again", "answer_now"];
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

type Round = NonNullable<LeadSearchDto["round"]>;
/** A places search with its round: what every reader below the people branch is handed. */
type PlacesSearch = LeadSearchDto & { round: Round; plan: LeadSearchPlan };

/** What leadEndingLine needs, read off the search's latest round and its plan. */
const ldEndingFacts = (s: PlacesSearch, nearby: readonly string[]) => {
  const r = s.round;
  const only = s.plan.exclusions.length === 1 && s.plan.exclusions[0] ? ldLowerFirst(s.plan.exclusions[0].text) : null;
  return {
    name: planWho(s.plan),
    area: planArea(s.plan.area),
    counted: r.counted,
    target: r.target,
    emails: r.emails_checked,
    phones: r.with_phone,
    excluded: r.excluded,
    checking: r.state === "checking",
    foundBefore: r.counted,
    // Where to look next: what the caller knows, else what the round itself wrote when it ran dry (00145).
    nearby: nearby.length ? [...nearby] : (r.nearby || []).map((a) => a.label),
    // What the source returned at all: every place this round judged, however it was classed.
    seen: r.qualified + r.review + r.excluded,
    leftOutBy: only,
  };
};

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

/** A round that ended: the sentence's own next step, then Sort by fit where the table is worth re-ordering, then the piles. */
function endedStrip(s: PlacesSearch, nearby: readonly string[]): StripVM {
  const r = s.round;
  const plan = s.plan;
  const counted = r.counted;
  const line = leadEndingLine(r.ending || "paused", ldEndingFacts(s, nearby));
  const look = !!line.step && ldLookStep(line.step.id) && !!r.nearby && r.nearby.length > 0;
  const step: StripAction[] = line.step
    ? [
        {
          id: line.step.id,
          label: line.step.label,
          primary: line.step.id !== "excluded" && line.step.id !== "sort_fit",
          arg: line.step.id === "excluded" ? "excluded" : look ? { ...plan, area: r.nearby[0] } : plan,
          where: look ? `Look ${leadNearWhere(r.nearby.map((a) => a.label))}` : null,
        },
      ]
    : [];
  const sorts =
    counted > 0 &&
    (r.ending === "target_reached" || r.ending === "searched_everything") &&
    (!line.step || line.step.id !== "sort_fit")
      ? [{ id: "sort_fit", label: "Sort by fit" }]
      : [];
  // The ending's numbers are the way into each pile: quiet links, never beside a primary step that already opens one.
  const piles = [
    ...(r.review > 0 ? [{ id: "review", label: `${r.review} need a look`, arg: "review", pile: true }] : []),
    ...(r.excluded > 0 ? [{ id: "excluded", label: `${r.excluded} left out`, arg: "excluded", pile: true }] : []),
  ].filter((a) => !line.step || line.step.id !== a.id);
  return {
    state: "ended",
    alert: false,
    title: line.title,
    parts: line.parts,
    progress: 1,
    actions: [...step, ...sorts, ...piles],
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
  const piles = [
    ...(r.review > 0 ? [{ id: "review", label: `${r.review} need a look`, arg: "review", pile: true }] : []),
    ...(r.excluded > 0 ? [{ id: "excluded", label: `${r.excluded} left out`, arg: "excluded", pile: true }] : []),
  ];
  return {
    state: "ended",
    alert: false,
    title: PW.ended(r.ending, r.counted, r.target),
    parts: [],
    progress: 1,
    actions: [{ id: "people_more", label: PW.more, primary: true, arg: plan }, ...piles],
  };
};

const ldStripOf = (s: LeadSearchDto | null, nearby: readonly string[]): StripVM | null => {
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
  const progress = r.target > 0 ? Math.min(1, counted / r.target) : null;
  // Removing the untouched leads (POST lead-searches/[id]/undo) is the search menu's, named for what it removes and gives
  // back (contracts leadUndoable): an "Undo" here, beside "the 24 found are yours", read as deleting what was just paid for.
  if (r.state === "waiting_on_owner" && r.question) return questionStrip(plan, r.question, progress);
  if (r.state === "checking") {
    // After Stop the emails of what was already found are still checked, and the strip says so in the ending's own words,
    // with `checking` true (S12, 17).
    if (String(r.ending_pending) === "stopped") {
      const line = leadEndingLine("stopped", ldEndingFacts(withRound, nearby));
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
    const parts = [`${counted} of ${r.target}`, `${r.emails_checked} emails checked`, `about ${minutesLeft} min left`];
    // The first 25 size the rest of the round (S6), so until they are in the estimate is an assumption and says so (P3).
    if (counted < LEAD_PROBE_SEEN) parts.push("estimates update after the first 25");
    return {
      state: "running",
      alert: false,
      title: `Finding ${who} ${where}`,
      parts,
      progress,
      actions: [{ id: "stop", label: "Stop" }],
    };
  }
  // Every ending is said once, by contracts' leadEndingLine. The strip composes.
  return endedStrip(withRound, nearby);
};

/**
 * One search's strip, with `offered`: what a refresh found and the surface is holding back, because the owner is not
 * reading in the order found (E8). The strip says the count, and nothing re-sorts under them until it is pressed.
 */
export const leadStrip = (
  s: LeadSearchDto | null,
  _now: Date,
  extra?: { nearby?: string[]; offered?: number } | null,
) => {
  const vm = ldStripOf(s, (extra && extra.nearby) || []);
  if (!vm) return null;
  const n = (extra && extra.offered) || 0;
  return n > 0 ? { ...vm, actions: [{ id: "take_offered", label: `${n} new` }, ...vm.actions] } : vm;
};
