/**
 * What the first run reads beyond Setup (moved from legacy/pages/first-run.jsx, decision 0015): the workspace this tab
 * holds (its name and its clock), and the settings read's brain and resolved numbers.
 */
import { DEFAULT_TIMEZONE, type ReceptionistCardInputs } from "@chanlytics/contracts";
import { workspaceOverride, type Workspace } from "@/legacy-bridge/surface-data";
import type { SettingsSurface, WorkspaceSettings } from "@/legacy-bridge/surfaces/settings";
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
// and the workspace's name and clock from the list the shell already holds.
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
  };
}
