import { clockHour } from "../shared/clock.js";
import { paramSaid } from "../templates/templates.js";
import { PLAYBOOK_VETO_DELAY_WORDS } from "./playbook-triggers.js";
export const PLAYBOOK_PATCH_KEYS = [
  "state",
  "name",
  "run_hour",
  "cap_per_run",
  "gap_days",
  "cadence_days",
  "params",
  "until",
  "trial_until"
];
export const PLAYBOOK_PATCH_CLEARS = ["until", "trial_until"];
const keysSaid = (last) => `${PLAYBOOK_PATCH_KEYS.slice(0, -1).join(", ")} ${last} ${PLAYBOOK_PATCH_KEYS.at(-1) ?? ""}`;
export const PLAYBOOK_PATCH_WORDS = {
  title: (p, name) => p.state === "paused" ? `Pause: ${name}` : p.state === "running" ? `Resume: ${name}` : `Change: ${name}`,
  name: (to) => `Renamed \u201C${to}\u201D`,
  run_hour: (to, was) => `Runs at ${clockHour(to)} by your clock, where it ran at ${clockHour(was)}`,
  cap_per_run: (to, was) => `Up to ${to} people a run, where it was ${was}`,
  gap_days: (to, was) => `Reaches a person again after ${to} days, where it was ${was}`,
  cadence_days: (to, was) => `Every ${to} days, where it was every ${was}`,
  /** Its words, each value as every card quotes one (templates paramSaid). */
  params: (to) => `Its words changed: ${to.map(paramSaid).join(", ")}`,
  /** Its last day, said by the business's calendar (contracts campaignDayWords: "Nov 30"), or none. */
  until: (day) => day ? `Ends ${day}` : "Runs until it is paused, with no last day",
  /** The day its trial ends (campaignDayWords), or none: what a trial does is said with it. */
  trial_until: (day) => day ? `On trial until ${day}: each run waits ${PLAYBOOK_VETO_DELAY_WORDS} for you to stop it` : "No longer on trial: its runs go as its class is set in Settings \u203A Autonomy",
  /**
   * A trial set where its class's mode sends nothing by itself (ask, never): the trial changes nothing there, said with
   * what a run does under that mode (`does`), never that each run waits for a Stop.
   */
  trialInert: (day, cls, mode, does) => `On trial until ${day}, which changes nothing under \u201C${cls}\u201D (${mode}): ${does}`,
  paused: "Nothing more runs until it is resumed",
  /** D8: a pause leaves the run that waits; skipping it is a second card. */
  pausedWaits: (people) => `The run waiting for you (${people} ${people === 1 ? "person" : "people"}) stays waiting: approve or skip it under Coming up`,
  /** D7: a resume says its class's mode, in full. */
  resumed: (cls, mode, does) => `Runs again under \u201C${cls}\u201D (${mode}): ${does}`,
  same: (name) => `\u201C${name}\u201D already reads so: say so, and change nothing`,
  nothing: `Name what changes: ${keysSaid("or")}.`,
  state: "A campaign is running or paused.",
  nameMissing: "A name needs words.",
  nameLong: (max) => `A name is at most ${max} characters.`,
  /** Only the month's offer runs every N days; every other playbook runs as people reach its moment. */
  cadenceOffer: (name) => `Only the month's offer runs on a cadence; \u201C${name}\u201D runs as people reach its moment.`,
  /** An end that is no day. */
  untilDay: "An end is a day, written YYYY-MM-DD.",
  /** An end before the business's today (`today` in campaignDayWords). */
  untilPast: (today) => `An end is today or later: today is ${today} by your clock.`,
  /** A trial's end that is no instant with its zone. */
  trialWhen: "A trial ends at a date and a time with its zone, as 2026-10-18T14:00:00Z, or at null, which ends it now.",
  /** A trial's end that has already passed: a trial that ended is none. */
  trialPast: "A trial ends at a time still to come: name a later one, or null, which ends it now.",
  /**
   * What PUT playbooks/:id refuses a body that is none of its three in (a change, the channels alone, the whole
   * campaign): one sentence that names them, where zod said the first key of the nearest one it did not take.
   */
  putBody: `Send a change (any of ${keysSaid("and")}), the channels alone as a list (channels: whatsapp, sms or email), or the whole campaign with its trigger and template_id.`
};
