import { plural } from "../shared/words.js";
import { appointmentWords } from "./appointment-word.js";
export const JOURNEY_STAGE_IDS = ["first_contact", "before", "after", "proposal", "quiet"];
const HOLDS = {
  first_contact: ["new_week", "phoned_only"],
  before: ["visit_tomorrow"],
  after: ["visited"],
  proposal: ["proposal_waiting"],
  quiet: ["quiet_30", "lapsed"]
};
export function journeyStageOf(trigger) {
  return JOURNEY_STAGE_IDS.find((id) => HOLDS[id].includes(trigger)) ?? null;
}
export function journeyOf(s) {
  const W = appointmentWords(s.word);
  const unmet = s.calendarOn ? null : "calendar";
  const winBack = s.calendarOn ? "lapsed" : "quiet_30";
  const every = { day: "Every", at: "day" };
  const stages = [
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
      off: null
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
      off: { hint: "tomorrow", when: every, why: W.offTomorrow }
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
      off: { hint: "yesterday", when: { day: "The day", at: "after" }, why: W.offYesterday }
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
        why: (n) => `Off \xB7 ${plural(n, "proposal")} waiting`
      }
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
        why: (n) => `Off \xB7 ${plural(n, "person", "people")} ${n === 1 ? "has" : "have"} gone quiet`
      }
    }
  ];
  return stages.filter((x) => x.id !== "proposal" || s.hasDeals || s.held.has("proposal"));
}
