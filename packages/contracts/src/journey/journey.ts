/**
 * The journey (J2; decisions 44 to 46 of the spec of 9 Oct 2026): the moments a workspace's customers pass through, in
 * the order they pass, made from how the business works and never stored yet. First contact (the receptionist's), the day
 * before an appointment, the day after, a proposal waiting where deals are on, then quiet or lapsed: a proposal is out
 * before a customer goes quiet, so it stands before Quiet (D45). A stage that holds a campaign is drawn whatever the
 * shape, so a follow-up made while deals were on still says it runs nothing here. Without a calendar the two
 * appointment moments cannot be counted (`unmet`): Campaigns says they need one, never a zero (D44).
 *
 * Ids are free of the word (`before`, not `visit`, D46): they become addresses (`campaigns/in:before`), and an address
 * must not change when a workspace changes what it calls an appointment. Every number on a stage is its pool, never a
 * funnel: nothing is stored per person. What Turn on and an off line in Coming up say is the stage's own (`off`), so no
 * page or tile keys a sentence by a closed list of ids.
 */
import { plural } from "../shared/words";
import { appointmentWords, type AppointmentWord } from "./appointment-word";

export const JOURNEY_STAGE_IDS = ["first_contact", "before", "after", "proposal", "quiet"] as const;

export type JourneyStageId = (typeof JOURNEY_STAGE_IDS)[number];

/** The kit's glyphs a stage's node draws (a subset of Campaigns' LifecycleGlyph). */
export type JourneyGlyph = "chat" | "bell" | "check" | "deal" | "refresh";

export interface JourneyStage {
  id: JourneyStageId;
  /** The receptionist's (no campaign of its own leads it), or a moment campaigns run on. */
  kind: "receptionist" | "moment";
  caps: string;
  /** What its card is called while no campaign stands on it. */
  name: string;
  glyph: JourneyGlyph;
  /** What its figure counts: "this week", "people", "yesterday", "waiting". */
  unit: string;
  /** The moment a new campaign on it starts from: the win-back the workspace can read for Quiet; null for First contact. */
  trigger: string | null;
  /** The triggers whose campaigns stand on it: both win-backs on Quiet, the retired welcome and number-saver on First contact. */
  holds: readonly string[];
  /** The pool its figure is counted from: "new_week" for First contact, else its trigger. */
  poolKey: string;
  /** Why it cannot be counted here: the appointment moments without a calendar. Null where it can. */
  unmet: "calendar" | null;
  /** It holds one campaign at most (the follow-up, 00167): its Turn on leaves once one stands on it. */
  one: boolean;
  /** What Turn on says it reaches ("· 3 tomorrow") and what an off line in Coming up says; null for First contact. */
  off: { hint: string; when: { day: string; at: string }; why: (n: number) => string } | null;
}

/** Which stage each trigger's campaigns stand on: a list's, the month's offer and a reach-out's steps stand on none. */
const HOLDS: Record<JourneyStageId, readonly string[]> = {
  first_contact: ["new_week", "phoned_only"],
  before: ["visit_tomorrow"],
  after: ["visited"],
  proposal: ["proposal_waiting"],
  quiet: ["quiet_30", "lapsed"],
};

/** The stage a campaign's trigger stands on, or null for one that stands on none. */
export function journeyStageOf(trigger: string): JourneyStageId | null {
  return JOURNEY_STAGE_IDS.find((id) => HOLDS[id].includes(trigger)) ?? null;
}

/**
 * The stages, in order, for a workspace's shape: `calendarOn` a calendar connected (its feed readable now or not),
 * `dealsOn` some customers get a proposal first, `word` what it calls an appointment, `held` the stages a campaign stands
 * on. Pure and total.
 */
export function journeyOf(s: {
  calendarOn: boolean;
  dealsOn: boolean;
  word: AppointmentWord;
  held: ReadonlySet<JourneyStageId>;
}): JourneyStage[] {
  const W = appointmentWords(s.word);
  const unmet = s.calendarOn ? null : ("calendar" as const);
  const winBack = s.calendarOn ? "lapsed" : "quiet_30";
  const every = { day: "Every", at: "day" };
  const stages: JourneyStage[] = [
    {
      id: "first_contact",
      kind: "receptionist",
      caps: "First contact",
      name: "Your receptionist",
      glyph: "chat",
      unit: "this week",
      trigger: null,
      holds: HOLDS.first_contact,
      poolKey: "new_week",
      unmet: null,
      one: false,
      off: null,
    },
    {
      id: "before",
      kind: "moment",
      caps: W.before.caps,
      name: W.before.name,
      glyph: "bell",
      unit: "people",
      trigger: "visit_tomorrow",
      holds: HOLDS.before,
      poolKey: "visit_tomorrow",
      unmet,
      one: false,
      off: { hint: "tomorrow", when: every, why: W.offTomorrow },
    },
    {
      id: "after",
      kind: "moment",
      caps: W.after.caps,
      name: "How did it go",
      glyph: "check",
      unit: "yesterday",
      trigger: "visited",
      holds: HOLDS.after,
      poolKey: "visited",
      unmet,
      one: false,
      off: { hint: "yesterday", when: { day: "The day", at: "after" }, why: W.offYesterday },
    },
    {
      id: "proposal",
      kind: "moment",
      caps: "Proposal waiting",
      name: "Proposal follow-up",
      glyph: "deal",
      unit: "waiting",
      trigger: "proposal_waiting",
      holds: HOLDS.proposal,
      poolKey: "proposal_waiting",
      unmet: null,
      one: true,
      off: {
        hint: "waiting",
        when: { day: "When one", at: "waits" },
        why: (n) => `Off · ${plural(n, "proposal")} waiting`,
      },
    },
    {
      id: "quiet",
      kind: "moment",
      caps: "Quiet or lapsed",
      name: "Win-back",
      glyph: "refresh",
      unit: "people",
      trigger: winBack,
      holds: HOLDS.quiet,
      poolKey: winBack,
      unmet: null,
      one: false,
      off: {
        hint: "quiet",
        when: every,
        why: (n) => `Off · ${plural(n, "person", "people")} ${n === 1 ? "has" : "have"} gone quiet`,
      },
    },
  ];
  return stages.filter((x) => x.id !== "proposal" || s.dealsOn || s.held.has("proposal"));
}
