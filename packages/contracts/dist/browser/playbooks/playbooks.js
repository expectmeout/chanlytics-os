import { visitStartTime } from "../calendar/calendar-people.js";
import { visitServiceOf } from "../calendar/visit/visit-service.js";
import { localDate } from "./playbook-schedule.js";
import { DAY_MS } from "./playbook-time.js";
import { triggerOf } from "./playbook-triggers.js";
import { dateFormat } from "../shared/time.js";
export {
  PLAYBOOK_TRIGGERS,
  MOMENT_TRIGGERS,
  PLAYBOOK_STATES,
  isPlaybookState,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_CAP_CHOICES,
  SENDING_HOURS_WORDS,
  sendsWaitWords,
  SENDING_NOW_WORDS,
  whenItGoes,
  PLAYBOOK_BREATH_MS,
  PLAYBOOK_VETO_DELAY_MS,
  PLAYBOOK_VETO_DELAY_WORDS,
  delayWords,
  vetoRunNotice,
  PLAYBOOK_NAME_MAX,
  CAMPAIGN_NOT_FOUND,
  REACH_OUT_IS_NOT_A_MOMENT,
  triggerOf,
  triggerOffered,
  momentOffered,
  momentReadsCalendar,
  MOMENTS_RETIRED,
  isWinBack,
  triggerWords,
  winBackWords,
  policyClassOffered
} from "./playbook-triggers.js";
export {
  FOLLOW_UP_NEEDS_DEALS,
  FOLLOW_UP_NEEDS_LINK,
  FOLLOW_UP_ONE,
  PLAYBOOK_TOUCH_WINDOW_MS,
  followUpNames,
  followUpIsFor,
  followUpKey,
  playbookRunStop,
  playbookStopBy,
  followUpRunAt,
  followUpStandOf,
  followUpWords
} from "./playbook-follow-ups.js";
export {
  eligibleForPlaybook,
  playbookRunReach,
  touchesAfterRun,
  theirVisitTest,
  visitMomentDay,
  visitOnDay,
  playbookReach,
  playbookReachDoor,
  playbookNoNumberWords,
  playbookPoolKey,
  PLAYBOOK_REACH_WORDS,
  PLAYBOOK_CLASS_LABEL
} from "./playbook-reach.js";
export {
  planRun,
  localDate,
  localHour,
  nextOpenMoment,
  runDueNow,
  inLastSendingHour,
  scheduleLine,
  runsWords,
  nextRunLabel
} from "./playbook-schedule.js";
export {
  poolWords,
  reachLines,
  runDayPassed,
  runApprovalRefusal,
  runDaysAt,
  toApprovalVM,
  waitingRunOffer
} from "./playbook-approval.js";
export function playbookListRef(p) {
  if (triggerOf(p.trigger)?.kind !== "saved") return null;
  if (p.list_key) return { kind: "builtin", id: p.list_key };
  if (p.list_id) return { kind: "saved", id: p.list_id };
  return null;
}
export const LIST_PLAYBOOK_CLASSES = ["campaign", "reengage"];
export function proposalFactsFor(trigger, row) {
  const t = triggerOf(trigger);
  const url = row?.deal?.proposal?.url ?? null;
  if (!(t && t.kind === "deal" && url)) return null;
  const id = row?.deal?.id;
  return id ? { proposal_link: url, deal_id: id } : { proposal_link: url };
}
export function visitFactsFor(trigger, visit, tz, names, sendAt) {
  const t = triggerOf(trigger);
  if (!t || t.kind !== "visit" || !visit) return null;
  return {
    visit_when: trigger === "visit_tomorrow" ? `${visitDayWord(visit, tz, sendAt, "tomorrow")} at ${visitStartTime(visit, tz)}` : visitDayWord(visit, tz, sendAt, "yesterday"),
    visit_service: visitServiceOf(visit.title, names) || "your appointment"
  };
}
export function visitDayWord(visit, tz, sendAt, assumed) {
  if (!sendAt) return assumed;
  const visitDay = localDate(tz, new Date(visit.start));
  const sendDay = localDate(tz, sendAt);
  const delta = Math.round((Date.parse(`${visitDay}T00:00:00Z`) - Date.parse(`${sendDay}T00:00:00Z`)) / DAY_MS);
  if (delta === 1) return "tomorrow";
  if (delta === 0) return "today";
  if (delta === -1) return "yesterday";
  try {
    return `on ${dateFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(visit.start))}`;
  } catch {
    return delta > 0 ? "soon" : "recently";
  }
}
