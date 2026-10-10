/**
 * A playbook changed in place (the moment spec §4.9 A5, decisions D8, D25, D26): the six things a change may name and the
 * words a change says. The drawer's Pause and Resume, Ask's change card and PUT playbooks/:id's patch body name them from
 * here; core checkPlaybookPatch judges a change against the playbook as it stands; the change_playbook door writes it
 * with its line in the ledger. English, as every card is (Spanish cards are one later lane for all of them, D31).
 */
import { clockHour } from "../shared/clock";
import type { PlaybookState } from "./playbook-triggers";

/** What a change may name, in the order a card says them. */
export const PLAYBOOK_PATCH_KEYS = ["state", "name", "run_hour", "cap_per_run", "gap_days", "cadence_days"] as const;
export type PlaybookPatchKey = (typeof PLAYBOOK_PATCH_KEYS)[number];

/** A change as it is asked or written: any of the six, none required. */
export interface PlaybookPatch {
  state?: PlaybookState;
  name?: string;
  run_hour?: number;
  cap_per_run?: number;
  gap_days?: number;
  cadence_days?: number;
}

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
  paused: "Nothing more runs until it is resumed",
  /** D8: a pause leaves the run that waits; skipping it is a second card. */
  pausedWaits: (people: number): string =>
    `The run waiting for you (${people} ${people === 1 ? "person" : "people"}) stays waiting: approve or skip it under Coming up`,
  /** D7: a resume says its class's mode, in full. */
  resumed: (cls: string, mode: string, does: string): string => `Runs again under “${cls}” (${mode}): ${does}`,
  same: (name: string): string => `“${name}” already reads so: say so, and change nothing`,
  nothing: "Name what changes: state, name, run_hour, cap_per_run, gap_days or cadence_days.",
  state: "A campaign is running or paused.",
  nameMissing: "A name needs words.",
  nameLong: (max: number): string => `A name is at most ${max} characters.`,
  /** Only the month's offer runs every N days; every other playbook runs as people reach its moment. */
  cadenceOffer: (name: string): string =>
    `Only the month's offer runs on a cadence; “${name}” runs as people reach its moment.`,
} as const;
