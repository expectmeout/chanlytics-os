/**
 * What the first run reads beyond Setup (moved from legacy/pages/first-run.jsx, decision 0015): the workspace this tab
 * holds (its name, its clock, how its customers buy), the settings read's brain and resolved numbers, and how customers
 * buy as the first run sends it through the workspace's own door.
 */
import {
  DEFAULT_TIMEZONE,
  isSellsBy,
  sellsBySaved,
  sellsByVM,
  type ReceptionistCardInputs,
} from "@chanlytics/contracts";
import { workspaceOverride, type Workspace } from "@/legacy-bridge/surface-data";
import type { SettingsSurface, WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
import { businessTabSave } from "../shell";
import type { SetupSurface } from "../surface";

/** The workspace this tab holds, from the list the shell already has: its name and clock. */
export const workspaceNow = (): Workspace | null => workspaceOverride.current();

/** The receptionist's brain as the settings read holds it, in the words the receptionist card reads. */
export type CardBrain = NonNullable<ReceptionistCardInputs["brain"]>;

/** The settings read's brain, as the card reads it; null until that read lands. */
export const brainOf = (config: WorkspaceSettings | null | undefined): CardBrain | null =>
  config && config.brain ? config.brain : null;

/** The workspace's alert addresses (the config's notifications.escalation_emails); none where the read has none. */
export function alertEmails(config: WorkspaceSettings | null | undefined): string[] {
  const n: unknown = config ? Reflect.get(config, "notifications") : null;
  const e: unknown = n && typeof n === "object" ? Reflect.get(n, "escalation_emails") : null;
  return Array.isArray(e) ? e.filter((x): x is string => typeof x === "string") : [];
}

// What the card reads beyond Setup: the brain and the resolved numbers from the settings read, once it has landed,
// and the workspace's name, clock and answer to how its customers buy from the list the shell already holds.
export function cardInputs(S: SetupSurface, read: SettingsSurface | undefined): ReceptionistCardInputs {
  const cfg = read && read.settings ? read.settings.config : null;
  const facts = read && read.facts ? read.facts.facts : null;
  const ws = workspaceNow();
  const value = (f: { value: string | null } | null | undefined): string | null => (f && f.value) || null;
  return {
    setup: S.dto,
    answering: S.vm.readiness.answering,
    brain: brainOf(cfg),
    numbers: facts
      ? { voiceLine: value(facts.voice_line), keptLine: value(facts.kept_line), handoff: value(facts.handoff_number) }
      : null,
    workspaceName: (ws && ws.name) || null,
    tz: (ws && ws.timezone) || DEFAULT_TIMEZONE,
    sellsBy: (ws && ws.sells_by) || null,
  };
}

/**
 * How customers buy, as the first run reads it: the answer stored (the workspace list's, as the first run reads its
 * workspace), and the answer shown, which is the stored one or, until one is said, the first (contracts sellsByVM, whose
 * words the choice draws).
 */
export function sellsByAnswer() {
  const stored = (workspaceNow() || { sells_by: null }).sells_by || null;
  const vm = sellsByVM(stored);
  return { stored, shown: vm.first, vm };
}

/**
 * An answer sent through the workspace's door, said as the Business tab says it (contracts sellsBySaved), with `done`
 * run once it is taken. Nothing is sent that is stored already, or while one is out: answers whether it sent.
 */
export function sendAnswer(answer: string, flash: (f: unknown) => void, done: (() => void) | null = null): boolean {
  const B = businessTabSave();
  const door = B && B.sellsBy;
  const a = sellsByAnswer();
  if (!door || answer === a.stored || door.pending()) return false;
  door.save({ answer, said: isSellsBy(answer) ? sellsBySaved(a.stored, answer) : null, done, flash });
  return true;
}
