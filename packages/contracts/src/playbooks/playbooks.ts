/**
 * Playbooks: a standing rule that sends one approved template to newly
 * eligible people who said yes, under the workspace's autonomy mode.
 *
 * Everything a playbook may do is decided here, once, and executed by the
 * hourly sweep with the same predicates the People page and the broadcast
 * route use: who is on the list, who said yes, who already heard from this
 * playbook, who heard from any playbook this week. Broadcasts is "send this
 * once"; a playbook is "keep doing this".
 */
import type { ParamSpec } from "../templates/templates";
import { visitStartTime, type VisitDto } from "../calendar/calendar-people";
import type { ListRef } from "../people/lists";
import { localDate } from "./playbook-schedule";
import { DAY_MS } from "./playbook-time";
import { type PlaybookPolicyClass, type PlaybookState, type PlaybookTrigger, triggerOf } from "./playbook-triggers";
export * from "./playbook-triggers";
export * from "./playbook-follow-ups";
export * from "./playbook-reach";
export * from "./playbook-schedule";
export * from "./playbook-approval";

export interface PlaybookDto {
  id: string;
  name: string;
  trigger: PlaybookTrigger;
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
 * row the run read. Kept on the recipient row, as a visit's words are, so the send carries the link it was run for.
 */
export function proposalFactsFor(
  trigger: string,
  row: { deal: { proposal: { url: string } | null } | null } | null,
): { proposal_link: string } | null {
  const t = triggerOf(trigger);
  const url = row?.deal?.proposal?.url ?? null;
  return t && t.kind === "deal" && url ? { proposal_link: url } : null;
}

/**
 * The words a visit playbook's slots take for one person — when, and what
 * for — from the visit the run read. Resolved when the run is made and kept
 * on the recipient row, so the send says what the calendar said then.
 */
export function visitFactsFor(
  trigger: string,
  visit: Pick<VisitDto, "start" | "title" | "all_day"> | null,
  tz: string,
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
    visit_service: visit.title.trim() || "your appointment",
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
    return `on ${new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(new Date(visit.start))}`;
  } catch {
    return delta > 0 ? "soon" : "recently";
  }
}
