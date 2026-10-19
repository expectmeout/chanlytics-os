import { clockHour } from "../shared/clock.js";
import { paramSaid } from "../templates/templates.js";
import { SEQUENCE_MODE_WORDS } from "../sequences/sequence.js";
export const PLAYBOOK_PATCH_KEYS = [
  "state",
  "name",
  "run_hour",
  "cap_per_run",
  "gap_days",
  "cadence_days",
  "params",
  "until",
  "mode"
];
export const PLAYBOOK_PATCH_CLEARS = ["until"];
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
  /** Its sequence's mode (decision 0064), as How it runs says it: "Before each batch: Ask me, where it was Send it". */
  mode: (to, was) => `Before each batch: ${SEQUENCE_MODE_WORDS[to].choice}, where it was ${SEQUENCE_MODE_WORDS[was].choice}`,
  /** A mode that is none of the three (decision 0064). */
  modeWhich: "Before each batch is ask (Ask me), veto (Hold it for a stop) or auto (Send it).",
  /** A mode a sequence to leads does not take: cold email never goes on its own. */
  modeLeads: "A sequence to leads waits for your OK or holds each batch: it never sends on its own.",
  /** A mode a one-off does not take: pressing Send decided it. */
  modeOneOff: "A one-off goes as it was sent: it has no mode.",
  paused: "Nothing more runs until it is resumed",
  /** D8: a pause leaves the run that waits; skipping it is a second card. */
  pausedWaits: (people) => `The run waiting for you (${people} ${people === 1 ? "person" : "people"}) stays waiting: approve or skip it under Coming up`,
  /** D7: a resume says what its batches do, by its sequence's mode (decision 0064), in full. */
  resumed: (does) => `Runs again: ${does}`,
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
  /**
   * What PUT playbooks/:id refuses a body that is none of its three in (a change, the channels alone, the whole
   * campaign): one sentence that names them, where zod said the first key of the nearest one it did not take.
   */
  putBody: `Send a change (any of ${keysSaid("and")}), the channels alone as a list (channels: whatsapp, sms or email), or the whole campaign with its trigger and template_id.`
};
