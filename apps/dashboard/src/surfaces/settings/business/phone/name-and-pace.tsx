// Chanlytics — Settings › Business › How it answers: the receptionist's name (How it talks) and how fast it speaks on
// calls (On calls), decision 0073, R7.
//
// The first run asks both in How it sounds; here each stays a row to change. Each is one key of the profile through the
// tab's one saver (`assistant_name`, `phone_pace`): the name is in the greeting and the prompt's first line from the next
// reply, and the pace goes with every call from the next one (the edge's inbound webhook, as Retell's agent_override,
// beside the voice). Every word is contracts' (ASSISTANT_NAME_WORDS, PHONE_PACE_WORDS).

import {
  ASSISTANT_NAME_WORDS,
  PHONE_PACES,
  PHONE_PACE_WORDS,
  PROFILE_LIMITS,
  phonePaceOf,
  phonePaceShown,
  type PhonePace,
} from "@chanlytics/contracts";
import { RecordCombobox } from "../../../kit/record/combobox";
import { RecordField } from "../../../kit/record/field";
import { gate, type LegacyFlash } from "../../../legacy-verbs";
import { BtRow } from "../gestures/row";
import type { Brain, Config, Saver } from "../save";

interface RowProps {
  brain: Brain;
  canEdit: boolean;
  flash: (f: LegacyFlash) => void;
  saver: Saver | null;
}

/** One key of the profile set, or taken away where the value is none; everything beside it kept. */
const withProfileKey =
  (key: "assistant_name" | "phone_pace", value: string | null) =>
  (c: Config): Config => {
    const brain = c.brain || {};
    const profile = { ...(brain.profile || {}) };
    if (value) profile[key] = value;
    else delete profile[key];
    return { ...c, brain: { ...brain, profile } };
  };

/** Its name: the one typed, else none (it says it is the automated assistant, as before). */
export const BtAssistantNameRow = ({ brain, canEdit, flash, saver }: RowProps) => {
  const W = ASSISTANT_NAME_WORDS;
  const stored = typeof brain.profile?.assistant_name === "string" ? brain.profile.assistant_name.trim() : "";
  const max = PROFILE_LIMITS.assistantName;
  const door = saver
    ? {
        save: (draft: string, done: () => void) => {
          const name = draft.replace(/\s+/g, " ").trim();
          saver.save({
            row: "assistant_name",
            patch: withProfileKey("assistant_name", name || null),
            said: W.saved(name || null),
            done,
            flash,
          });
        },
        pending: () => saver.pending("assistant_name"),
      }
    : null;
  return (
    <BtRow
      brain={brain}
      canEdit={canEdit && !!door}
      flash={flash}
      id="assistant_name"
      label={W.label}
      value={stored || null}
      empty={W.empty}
      gate={gate("settings", W.gate)}
      initial={stored}
      check={(d: string) => (d.trim().length > max ? W.tooLong(max) : null)}
      door={door}
      body={({ draft, set, problem, field }) => (
        <RecordField
          {...field}
          value={draft}
          onChange={set}
          problem={problem}
          hint={W.hint}
          placeholder={W.placeholder}
          autoComplete="off"
        />
      )}
    />
  );
};

/** The row's draft is the words a list may hold, wider than today's paces: a pace retired from the list still opens. */
const paceDraftOf = (pace: string): string => pace;

/** How fast it speaks on calls: the pace chosen, else natural (the line's own). */
export const BtPaceRow = ({ brain, canEdit, flash, saver }: RowProps) => {
  const W = PHONE_PACE_WORDS;
  const shown = phonePaceShown(brain.profile?.phone_pace);
  const door = saver
    ? {
        save: (draft: string, done: () => void) => {
          const pace = phonePaceOf(draft) ?? "natural";
          saver.save({
            row: "phone_pace",
            // Natural is no key: the line keeps its own pace, as before the row.
            patch: withProfileKey("phone_pace", pace === "natural" ? null : pace),
            said: W.saved(pace),
            done,
            flash,
          });
        },
        pending: () => saver.pending("phone_pace"),
      }
    : null;
  return (
    <BtRow
      brain={brain}
      canEdit={canEdit && !!door}
      flash={flash}
      id="phone_pace"
      label={W.label}
      value={W.options[shown]}
      gate={gate("settings", W.gate)}
      initial={paceDraftOf(shown)}
      storedAs={(d: string) => d}
      check={(d: string) => (phonePaceOf(d) ? null : W.unlisted)}
      door={door}
      body={({ draft, set, field }) => (
        <RecordCombobox
          id={field.id}
          label={W.label}
          value={draft}
          options={PHONE_PACES.map((p: PhonePace) => ({ value: p, label: W.options[p] }))}
          onChange={set}
          readOnly={field.readOnly || undefined}
          testid="rec-pace-pick"
        />
      )}
    />
  );
};
