/**
 * A playbook changed in place (the moment spec §4.9 A5, decisions D8, D25, D26): the nine things a change may name and
 * the words a change says. The drawer's Pause and Resume, Ask's change card and PUT playbooks/:id's patch body name them
 * from here; core checkPlaybookPatch judges a change against the playbook as it stands; the change_playbook door writes
 * it with its line in the ledger. Since 00409 a change may name the campaign's words (`params`, the slot specs a run
 * fills), its last day (`until`) and the end of its trial (`trial_until`); null clears either date. English, as every
 * card is (Spanish cards are one later lane for all of them, D31).
 */
import { clockHour } from "../shared/clock";
import { paramSaid, type ParamSpec } from "../templates/templates";
import { PLAYBOOK_VETO_DELAY_WORDS, type PlaybookState } from "./playbook-triggers";

/** What a change may name, in the order a card says them. */
export const PLAYBOOK_PATCH_KEYS = [
  "state",
  "name",
  "run_hour",
  "cap_per_run",
  "gap_days",
  "cadence_days",
  "params",
  "until",
  "trial_until",
] as const;
export type PlaybookPatchKey = (typeof PLAYBOOK_PATCH_KEYS)[number];

/**
 * The keys a null clears (00409): the campaign's last day and its trial's end. The seven others are never empty, so a
 * null there names nothing; here it is the change, and an undo of a first end writes it back.
 */
export const PLAYBOOK_PATCH_CLEARS: readonly PlaybookPatchKey[] = ["until", "trial_until"];

/**
 * A change as it is asked or written: any of the nine, none required. A type, not an interface, so a change is the JSON
 * the door is handed as it stands. `until` is a day (YYYY-MM-DD, the business's), `trial_until` an instant (ISO); null
 * clears either.
 */
export type PlaybookPatch = {
  state?: PlaybookState;
  name?: string;
  run_hour?: number;
  cap_per_run?: number;
  gap_days?: number;
  cadence_days?: number;
  params?: ParamSpec[];
  until?: string | null;
  trial_until?: string | null;
};

/** The keys in a sentence, the last after `last`: "state, name, … until or trial_until". */
const keysSaid = (last: string): string =>
  `${PLAYBOOK_PATCH_KEYS.slice(0, -1).join(", ")} ${last} ${PLAYBOOK_PATCH_KEYS.at(-1) ?? ""}`;

/** The words of a change: a card's title and parts, and its refusals. */
export const PLAYBOOK_PATCH_WORDS = {
  title: (p: PlaybookPatch, name: string): string =>
    p.state === "paused" ? `Pause: ${name}` : p.state === "running" ? `Resume: ${name}` : `Change: ${name}`,
  name: (to: string): string => `Renamed “${to}”`,
  run_hour: (to: number, was: number): string =>
    `Runs at ${clockHour(to)} by your clock, where it ran at ${clockHour(was)}`,
  cap_per_run: (to: number, was: number): string => `Up to ${to} people a run, where it was ${was}`,
  gap_days: (to: number, was: number): string => `Reaches a person again after ${to} days, where it was ${was}`,
  cadence_days: (to: number, was: number): string => `Every ${to} days, where it was every ${was}`,
  /** Its words, each value as every card quotes one (templates paramSaid). */
  params: (to: readonly ParamSpec[]): string => `Its words changed: ${to.map(paramSaid).join(", ")}`,
  /** Its last day, said by the business's calendar (contracts campaignDayWords: "Nov 30"), or none. */
  until: (day: string | null): string => (day ? `Ends ${day}` : "Runs until it is paused, with no last day"),
  /** The day its trial ends (campaignDayWords), or none: what a trial does is said with it. */
  trial_until: (day: string | null): string =>
    day
      ? `On trial until ${day}: each run waits ${PLAYBOOK_VETO_DELAY_WORDS} for you to stop it`
      : "No longer on trial: its runs go as its class is set in Settings › Autonomy",
  /**
   * A trial set where its class's mode sends nothing by itself (ask, never): the trial changes nothing there, said with
   * what a run does under that mode (`does`), never that each run waits for a Stop.
   */
  trialInert: (day: string, cls: string, mode: string, does: string): string =>
    `On trial until ${day}, which changes nothing under “${cls}” (${mode}): ${does}`,
  paused: "Nothing more runs until it is resumed",
  /** D8: a pause leaves the run that waits; skipping it is a second card. */
  pausedWaits: (people: number): string =>
    `The run waiting for you (${people} ${people === 1 ? "person" : "people"}) stays waiting: approve or skip it under Coming up`,
  /** D7: a resume says its class's mode, in full. */
  resumed: (cls: string, mode: string, does: string): string => `Runs again under “${cls}” (${mode}): ${does}`,
  same: (name: string): string => `“${name}” already reads so: say so, and change nothing`,
  nothing: `Name what changes: ${keysSaid("or")}.`,
  state: "A campaign is running or paused.",
  nameMissing: "A name needs words.",
  nameLong: (max: number): string => `A name is at most ${max} characters.`,
  /** Only the month's offer runs every N days; every other playbook runs as people reach its moment. */
  cadenceOffer: (name: string): string =>
    `Only the month's offer runs on a cadence; “${name}” runs as people reach its moment.`,
  /** An end that is no day. */
  untilDay: "An end is a day, written YYYY-MM-DD.",
  /** An end before the business's today (`today` in campaignDayWords). */
  untilPast: (today: string): string => `An end is today or later: today is ${today} by your clock.`,
  /** A trial's end that is no instant with its zone. */
  trialWhen: "A trial ends at a date and a time with its zone, as 2026-10-18T14:00:00Z, or at null, which ends it now.",
  /** A trial's end that has already passed: a trial that ended is none. */
  trialPast: "A trial ends at a time still to come: name a later one, or null, which ends it now.",
  /**
   * What PUT playbooks/:id refuses a body that is none of its three in (a change, the channels alone, the whole
   * campaign): one sentence that names them, where zod said the first key of the nearest one it did not take.
   */
  putBody: `Send a change (any of ${keysSaid("and")}), the channels alone as a list (channels: whatsapp, sms or email), or the whole campaign with its trigger and template_id.`,
} as const;
