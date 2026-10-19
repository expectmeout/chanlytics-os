import { appointmentWords } from "../journey/appointment-word.js";
import { MIN_MS } from "../shared/time.js";
import { plural } from "../shared/words.js";
import { waitEndsWords } from "../waits/wait-rules.js";
export const PLAYBOOK_TRIGGERS = [
  { id: "quiet_30", label: "Win-back", list: "quiet", cls: "reengage", kind: "list", hint: "Nothing heard in 30 days" },
  {
    id: "new_week",
    label: "Welcome",
    list: "new_week",
    cls: "campaign",
    kind: "list",
    hint: "First contact in the last 7 days"
  },
  {
    id: "phoned_only",
    label: "Save our number",
    list: "phoned_only",
    cls: "reengage",
    kind: "list",
    hint: "Only ever phoned, never texted"
  },
  {
    id: "everyone_monthly",
    label: "The month's offer",
    list: null,
    cls: "campaign",
    kind: "cadence",
    hint: "Everyone who said yes, on a cadence"
  },
  {
    id: "visit_tomorrow",
    label: "Appointment reminder",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day before an appointment on the calendar"
  },
  // Under the Booking row since 2 Oct 2026, as the reminder is: its message asks how the appointment went and offers
  // nothing, so it reaches a yes to texts. The labels here are the default word's (contracts appointmentWords, D42); a
  // page and a new campaign's name say the workspace's own (triggerWords), and a name already stored keeps its words
  // until its owner renames it (D43). The id never changes.
  {
    id: "visited",
    label: "After the appointment",
    list: null,
    cls: "booking",
    kind: "visit",
    hint: "The day after an appointment, when nothing is booked next"
  },
  // People's Lapsed list, by visits rather than silence (00155). Since 2 Oct 2026 it IS the win-back where a calendar is
  // connected, and the quiet one is the win-back where none is: one moment, read the one way the workspace can
  // (momentOffered), so both are called Win-back and their hints say which.
  {
    id: "lapsed",
    label: "Win-back",
    list: "lapsed",
    cls: "reengage",
    kind: "list",
    hint: "No appointment in 45 days, and nothing booked"
  },
  // Any list (decision 0009): one of People's (list_key, 00168) or one of the workspace's own (list_id, 00155), kept by
  // hand or by a rule; the card says which. The id stays: playbooks made before any list could be named keep running.
  {
    id: "saved_list",
    label: "On a list",
    list: null,
    cls: "campaign",
    kind: "saved",
    hint: "Everyone on a list: one of People's, or one you keep"
  },
  // A proposal out that has waited past the workspace's pace with nothing back (0006): one nudge per proposal, with
  // its link, under its own class, in every workspace. Conversational: it answers the person's own request.
  {
    id: "proposal_waiting",
    label: "Proposal follow-up",
    list: null,
    cls: "follow_up",
    kind: "deal",
    hint: "A proposal waiting with nothing back"
  },
  // Reach out (Part 3): a chain's first email, over a lead search, and a step days after the one before it. Made by
  // the reach-out sheet (Part 4), never offered among the moments (triggerOffered).
  {
    id: "lead_first",
    label: "Businesses a search found",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "The first email of a reach-out"
  },
  {
    id: "after_step",
    label: "After the step before",
    list: null,
    cls: "outreach",
    kind: "reach_out",
    hint: "A nudge, days after the step before"
  }
];
export const MOMENT_TRIGGERS = PLAYBOOK_TRIGGERS.filter(
  (t) => t.kind !== "reach_out"
);
export const PLAYBOOK_STATES = ["running", "paused"];
export function isPlaybookState(v) {
  return PLAYBOOK_STATES.some((s) => s === v);
}
export const PLAYBOOK_DEFAULTS = { runHour: 10, capPerRun: 25, gapDays: 90, cadenceDays: 30 };
export const PLAYBOOK_HOURS = { min: 9, max: 20 };
export const PLAYBOOK_LIMITS = {
  run_hour: { min: PLAYBOOK_HOURS.min, max: PLAYBOOK_HOURS.max, what: "The hour" },
  cap_per_run: { min: 1, max: 500, what: "The cap" },
  gap_days: { min: 7, max: 365, what: "The gap" },
  cadence_days: { min: 1, max: 90, what: "The cadence" }
};
export const PLAYBOOK_CAP_CHOICES = [5, 10, 25, 50, 100, 250, 500];
export const SENDING_HOURS_WORDS = {
  min: PLAYBOOK_HOURS.min,
  max: PLAYBOOK_HOURS.max,
  first: `${PLAYBOOK_HOURS.min}:00`,
  range: `${PLAYBOOK_HOURS.min}:00\u2013${PLAYBOOK_HOURS.max}:59`,
  between: `between ${PLAYBOOK_HOURS.min}:00 and ${PLAYBOOK_HOURS.max}:59`
};
export const sendsWaitWords = (hours = SENDING_HOURS_WORDS) => `sends wait for ${hours.range}`;
export const SENDING_NOW_WORDS = "sending now";
export function whenItGoes(receipt, when, nowMs) {
  const at = receipt?.scheduled_for ? Date.parse(receipt.scheduled_for) : NaN;
  if (Number.isNaN(at)) return SENDING_NOW_WORDS;
  if (receipt?.moved_from)
    return `scheduled for ${when(at)} \u2014 messages go out ${SENDING_HOURS_WORDS.between} by your clock`;
  if (receipt?.pressed_now && at > nowMs) {
    const goes = waitEndsWords("one_off", when(at));
    return `${goes.charAt(0).toLowerCase()}${goes.slice(1)}`;
  }
  return at - nowMs > MIN_MS ? `scheduled for ${when(at)}` : SENDING_NOW_WORDS;
}
export { PLAYBOOK_BREATH_MS } from "./playbook-time.js";
export const PLAYBOOK_VETO_DELAY_MS = 30 * MIN_MS;
export const SEND_ONCE_STOP_MS = 10 * MIN_MS;
export function delayWords(ms) {
  const minutes = Math.round(ms / MIN_MS);
  if (minutes < 60 || minutes % 60) return plural(minutes, "minute");
  return minutes === 60 ? "an hour" : plural(minutes / 60, "hour");
}
export const PLAYBOOK_VETO_DELAY_WORDS = delayWords(PLAYBOOK_VETO_DELAY_MS);
export const SEND_ONCE_STOP_WORDS = delayWords(SEND_ONCE_STOP_MS);
export function readyRunNotice(name, people) {
  return {
    subject: `Campaign \u201C${name}\u201D is ready: ${plural(people, "person", "people")}`,
    body: `${plural(people, "person has", "people have")} become eligible for \u201C${name}\u201D. Approve or skip it from your Inbox or Today. ${waitEndsWords("batch_ask")}.`
  };
}
export function vetoRunNotice(name, people, when) {
  const who = plural(people, "person", "people");
  return {
    subject: `Campaign \u201C${name}\u201D sends ${when}: ${who}`,
    body: `${who} will be sent \u201C${name}\u201D. ${waitEndsWords("batch_hold", when)}, from Today or its run.`
  };
}
export function skippedRunNotice(name, people) {
  return {
    subject: `\u201C${name}\u201D didn\u2019t go: nobody approved it`,
    body: `${plural(people, "person", "people")} waited for your OK until the day ended, and nothing was sent. They are in line for its next batch. To stop being asked each time, change \u201CBefore each batch\u201D in its How it runs.`
  };
}
export const PLAYBOOK_NAME_MAX = 80;
export const CAMPAIGN_NOT_FOUND = "Campaign not found.";
export const REACH_OUT_IS_NOT_A_MOMENT = "A reach-out is made on its own sheet, from a search's leads, not among the moments.";
export function triggerOf(id) {
  return PLAYBOOK_TRIGGERS.find((t) => t.id === id) ?? null;
}
export const VISIT_TRIGGERS = PLAYBOOK_TRIGGERS.filter((t) => t.kind === "visit").map((t) => t.id);
export function triggerOffered(t) {
  return t.kind !== "reach_out";
}
export const MOMENTS_RETIRED = {
  new_week: "Your receptionist answers a first contact itself, and asks there for the yes to offers that a welcome would need.",
  phoned_only: "The call's text does this during the call: the booking link and your WhatsApp, sent when a caller asks for them."
};
const WIN_BACKS = ["quiet_30", "lapsed"];
export function isWinBack(id) {
  return WIN_BACKS.includes(id);
}
export function triggerWords(t, word) {
  const W = appointmentWords(word);
  if (t.id === "visit_tomorrow") return { label: W.before.name, hint: W.before.hint };
  if (t.id === "visited") return { label: W.after.caps, hint: W.after.hint };
  if (t.id === "lapsed") return { label: t.label, hint: W.lapsedHint };
  return { label: t.label, hint: t.hint };
}
export function winBackWords(word) {
  const W = appointmentWords(word);
  const silence = (triggerOf("quiet_30")?.hint ?? "").toLowerCase();
  return {
    quiet_30: `A calendar is connected here, so the win-back goes ${W.byMany}: ${W.lapsedHint.toLowerCase()}. Start that one.`,
    lapsed: `The win-back ${W.byMany} needs your calendar, and none is connected. Start the one that goes by silence: ${silence}.`
  };
}
export function momentReadsCalendar(t) {
  return isWinBack(t.id) || t.kind === "visit";
}
export function momentOffered(t, o) {
  if (!triggerOffered(t)) return false;
  if (t.id in MOMENTS_RETIRED) return false;
  if (!momentReadsCalendar(t)) return true;
  return t.id === "quiet_30" ? !o.calendarOn : o.calendarOn;
}
export function policyClassOffered(cls) {
  if (cls === "outreach") return true;
  const runs = PLAYBOOK_TRIGGERS.filter((t) => t.cls === cls);
  return runs.length === 0 || runs.some((t) => triggerOffered(t));
}
