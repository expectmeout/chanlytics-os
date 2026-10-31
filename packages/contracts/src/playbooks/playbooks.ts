/**
 * Playbooks: a standing rule that sends one message, on the channels it holds, to
 * newly eligible people who said yes, under the workspace's autonomy mode.
 *
 * Everything a playbook may do is decided here, once, and executed by the
 * hourly sweep with the same predicates the People page and the broadcast
 * route use: who is on the list, who said yes, who already heard from this
 * playbook, who heard from any playbook this week. Broadcasts is "send this
 * once"; a playbook is "keep doing this".
 */
import type { ParamSpec } from "../templates/templates";
import { visitStartTime, type VisitDto } from "../calendar/calendar-people";
import { freedTimeWords } from "../calendar/visit/freed-time";
import { visitServiceOf } from "../calendar/visit/visit-service";
import type { ListRef } from "../people/lists/list-token";
import { localDate } from "./playbook-schedule";
import { DAY_MS } from "./playbook-time";
import { type PlaybookPolicyClass, type PlaybookState, type PlaybookTrigger, triggerOf } from "./playbook-triggers";
import { dateFormat } from "../shared/time";
import type { SequenceMode } from "../sequences/sequence";
export {
  PLAYBOOK_TRIGGERS,
  MOMENT_TRIGGERS,
  PLAYBOOK_STATES,
  isPlaybookState,
  PLAYBOOK_DEFAULTS,
  FREED_TIME_DEFAULTS,
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
  SEND_ONCE_STOP_MS,
  SEND_ONCE_STOP_WORDS,
  delayWords,
  readyRunNotice,
  vetoRunNotice,
  skippedRunNotice,
  freedTimeTakenNotice,
  PLAYBOOK_NAME_MAX,
  CAMPAIGN_NOT_FOUND,
  REACH_OUT_IS_NOT_A_MOMENT,
  triggerOf,
  triggerOffered,
  VISIT_TRIGGERS,
  momentOffered,
  momentReadsCalendar,
  MOMENTS_RETIRED,
  isWinBack,
  triggerWords,
  winBackWords,
  policyClassOffered,
} from "./playbook-triggers";
export type {
  PlaybookTrigger,
  PlaybookTriggerKind,
  PlaybookPolicyClass,
  PlaybookState,
  WhenItGoesReceipt,
} from "./playbook-triggers";
export {
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
  followUpWords,
} from "./playbook-follow-ups";
export type { FollowUpFactsDto, FollowUpStand } from "./playbook-follow-ups";
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
  PLAYBOOK_CLASS_LABEL,
} from "./playbook-reach";
export type { Touches, RunReach, PlaybookReach, RunPlaybook } from "./playbook-reach";
export {
  planRun,
  localDate,
  localHour,
  nextOpenMoment,
  runDueNow,
  inLastSendingHour,
  scheduleLine,
  runsWords,
  nextRunLabel,
} from "./playbook-schedule";
export type { RunPlan } from "./playbook-schedule";
export {
  FREED_TIME_PASSED_WORDS,
  poolWords,
  reachLines,
  runDayPassed,
  runApprovalRefusal,
  runDaysAt,
  toApprovalVM,
  waitingRunOffer,
} from "./playbook-approval";
export type { WaitingRunOffer } from "./playbook-approval";
export type { ApprovalVM } from "./playbook-approval";

export interface PlaybookDto {
  id: string;
  name: string;
  trigger: PlaybookTrigger;
  /** The channels it may go by (step 3; reach-for.ts): WhatsApp alone for one made before, as the column defaults. */
  channels?: string[];
  /** The list of the workspace's own a saved_list playbook runs on; null for every other trigger, and for one whose list was deleted. */
  list_id: string | null;
  /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. One or the other, never both. */
  list_key?: string | null;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  policy_class: PlaybookPolicyClass;
  state: PlaybookState;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  last_run_for: string | null;
  last_run_at: string | null;
  created_at: string;
  /** Its last day (00416), YYYY-MM-DD by the business's clock, or null; absent from a server before it. */
  until?: string | null;
  /** Its sequence's mode (decision 0064): how its batches are decided. Absent from a server before 00462. */
  mode?: SequenceMode | null;
  /**
   * When a person last let a batch of its words go (00462): null while its words are new, and its next batch then waits
   * for an OK whatever the mode (contracts batchModeOf). Absent from a server before 00462.
   */
  words_ok_at?: string | null;
}

/**
 * The list a playbook runs on, as a reference (lists.ts): a saved_list playbook's People list by its id, or one of the
 * workspace's own; null for every other trigger, and for one whose list is gone.
 */
export function playbookListRef(p: {
  trigger: string;
  list_id?: string | null;
  list_key?: string | null;
}): ListRef | null {
  if (triggerOf(p.trigger)?.kind !== "saved") return null;
  if (p.list_key) return { kind: "builtin", id: p.list_key };
  if (p.list_id) return { kind: "saved", id: p.list_id };
  return null;
}

/** The classes a playbook on a list may run under, the first its own: an offer, or a win-back. */
export const LIST_PLAYBOOK_CLASSES = ["campaign", "reengage"] as const;

/**
 * The words a follow-up's slot takes for one person: the link of the proposal their deal waits on (0006), from the
 * row the run read, and that deal's id beside it (0029), so the run's touch keeps which proposal it was about (contracts
 * followUpKey). Kept on the recipient row, as a visit's words are, so the send carries the link it was run for.
 */
export function proposalFactsFor(
  trigger: string,
  row: { deal: { id?: string | null; proposal: { url: string } | null } | null } | null,
): { proposal_link: string; deal_id?: string } | null {
  const t = triggerOf(trigger);
  const url = row?.deal?.proposal?.url ?? null;
  if (!(t && t.kind === "deal" && url)) return null;
  const id = row?.deal?.id;
  return id ? { proposal_link: url, deal_id: id } : { proposal_link: url };
}

/**
 * The words every send of a freed time's batch keeps (0081): the time as it reads at the moment the batch goes, the
 * appointment that freed it, and the span, so the send says what the batch offered and Reports reads who took it.
 */
export function freedTimeFactsFor(
  freed: { from: string; start: number; end: number },
  tz: string,
  sendAt: Date,
): { freed_when: string; appointment: string; offered_start: string; offered_end: string } {
  return {
    freed_when: freedTimeWords(freed.start, tz, sendAt),
    appointment: freed.from,
    offered_start: new Date(freed.start).toISOString(),
    offered_end: new Date(freed.end).toISOString(),
  };
}

/** Why a freed time's message must say the freed time (0081): without it, "want it?" asks of nothing. */
export const FREED_TIME_NEEDS_WHEN =
  "Filling a cancellation says the freed time: pick a message with a slot for it, and fill that slot with the freed time.";

/**
 * The words a visit playbook's slots take for one person — when, and what
 * for — from the visit the run read. Resolved when the run is made and kept
 * on the recipient row, so the send says what the calendar said then.
 *
 * The service is the title's service alone (calendar-people.ts visitServiceOf): an event's title names the person it is
 * for ("Balayage · Maria Lopez"), and a message must never carry a name, theirs or anyone's. A title with nothing left
 * once the person's name is out says "your appointment".
 */
export function visitFactsFor(
  trigger: string,
  visit: Pick<VisitDto, "start" | "title" | "all_day"> | null,
  tz: string,
  /** The names the person is saved under (their given name, their WhatsApp name): what comes out of the title. Required: no caller may carry a title whole. */
  names: readonly (string | null | undefined)[],
  /** When the words will be read: the send's moment. Absent, they are read now, as the run assumes. */
  sendAt?: Date,
): { visit_when: string; visit_service: string } | null {
  const t = triggerOf(trigger);
  if (!t || t.kind !== "visit" || !visit) return null;
  return {
    visit_when:
      trigger === "visit_tomorrow"
        ? `${visitDayWord(visit, tz, sendAt, "tomorrow")} at ${visitStartTime(visit, tz)}`
        : visitDayWord(visit, tz, sendAt, "yesterday"),
    visit_service: visitServiceOf(visit.title, names) || "your appointment",
  };
}

/**
 * "tomorrow", "today", "yesterday", or the day's name: the visit's day as it
 * stands from the moment the words are read. A run asked for at eleven at
 * night goes at nine the next morning, and "tomorrow at 2:00 PM" said then is
 * the wrong day; the send's moment is what the words must be relative to.
 */
export function visitDayWord(
  visit: Pick<VisitDto, "start">,
  tz: string,
  sendAt: Date | undefined,
  assumed: string,
): string {
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
