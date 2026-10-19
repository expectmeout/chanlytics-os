/**
 * How a customer's sequence runs, opened by Start's Change (the Sequences loop review's item 7) and by the head's Who
 * approves: what happens before each batch (its own mode, decision 0064: ask, hold it for a stop, or send it; new words
 * always ask first), its hour, the most it sends each day, the days before the same person hears it again (a moment over a
 * group of people), the days between runs (the month's offer), and the day it stops. The kit's sheet: from the bottom on a
 * phone, a side pane on a desk. Saved through the campaign's own verb (`playbook_change`), only what changed, with its
 * receipt and its undo; the first step's settings reach every step after it (00453). A list's sequence says it goes once to
 * each person, which is no setting. Every word is contracts' (SCHEDULE_WORDS.settings, SEQUENCE_MODE_WORDS).
 */
import { useState } from "react";
import {
  PLAYBOOK_HOURS,
  SCHEDULE_WORDS,
  SEQUENCE_MODE_LABEL,
  evidenceWords,
  SEQUENCE_MODE_WORDS,
  SEQUENCE_NEW_WORDS_ASK,
  clockTime,
  scheduleSettingsOf,
  sequenceModesFor,
  type SequenceRecordDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { Select } from "../../kit/select/select";
import { Sheet } from "../../kit/sheet/sheet";
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { pressed } from "./verbs";

const HOW_IT_RUNS = SCHEDULE_WORDS.settings;

/** An hour as the sheet says it ("9:00 AM"), on the business's clock face. */
const hourWords = (h: number) => clockTime(Date.UTC(2026, 0, 1, h), "UTC");

const HOURS = Array.from({ length: PLAYBOOK_HOURS.max - PLAYBOOK_HOURS.min + 1 }, (_, i) => PLAYBOOK_HOURS.min + i);
const CAPS = [10, 25, 50, 100, 200, 500];
const GAPS = [30, 60, 90, 180, 365];
const EVERY = [7, 14, 30, 60, 90];

/** A choice's options, with the value it holds now where that is none of them (a setting Ask or a composer made). */
const optionsOf = (choices: readonly number[], now: number, label: (n: number) => string) =>
  [...new Set([...choices, now])].sort((a, b) => a - b).map((n) => ({ value: String(n), label: label(n) }));

interface Values {
  mode: string;
  run_hour: string;
  cap_per_run: string;
  gap_days: string;
  cadence_days: string;
  until: string;
}

/** What the sheet opens with: the record's, as its first step holds them. */
function openingValues(rec: SequenceRecordDto): Values {
  const s = rec.settings;
  return {
    mode: rec.sequence.mode ?? "ask",
    run_hour: String(rec.sequence.first?.run_hour ?? 10),
    cap_per_run: String(s?.cap_per_run ?? 25),
    gap_days: String(s?.gap_days ?? 90),
    cadence_days: String(s?.cadence_days ?? 30),
    until: rec.sequence.first?.until ?? "",
  };
}

/**
 * What changed, as the verb takes it: numbers as numbers, an end cleared as none, and the sequence's mode as
 * `sequence_mode`, the one key the change door reads it from (contracts playbookChangeSpec; a payload's `mode` is the
 * card's reading of how its runs go, which its undo's words say).
 */
function changeOf(was: Values, now: Values): Record<string, number | string | null> {
  const out: Record<string, number | string | null> = {};
  if (now.mode !== was.mode) out.sequence_mode = now.mode;
  for (const k of ["run_hour", "cap_per_run", "gap_days", "cadence_days"] as const)
    if (now[k] !== was[k]) out[k] = Number(now[k]);
  if (now.until !== was.until) out.until = now.until === "" ? null : now.until;
  return out;
}

interface SettingsSheetProps {
  open: boolean;
  rec: SequenceRecordDto;
  flash: (flash: LegacyFlash) => void;
  moved: () => void;
  onClose: () => void;
}

/** The sheet's fields: each a kit Select or a date, what the sequence's kind takes (contracts scheduleSettingsOf). */
function SettingsFields(p: { rec: SequenceRecordDto; v: Values; set: (k: keyof Values, value: string) => void }) {
  const { rec, v, set } = p;
  const takes = scheduleSettingsOf(rec.sequence);
  const chevron = <Icon name="chevron-down" size={12} />;
  return (
    <div className="sq-settings-form">
      <Field
        label={SEQUENCE_MODE_LABEL}
        // What its batches did, then the rule over any mode (decision 0064): the mode is set on what happened.
        hint={[evidenceWords(rec.evidence), SEQUENCE_NEW_WORDS_ASK].filter(Boolean).join(". ")}
        control={
          <Select
            value={v.mode}
            onValueChange={(x) => set("mode", x)}
            options={sequenceModesFor(rec.sequence.starts).map((m) => ({
              value: m,
              label: SEQUENCE_MODE_WORDS[m].choice,
            }))}
            chevron={chevron}
            data-testid="sq-settings-mode"
          />
        }
      />
      <Field
        label={HOW_IT_RUNS.hour}
        control={
          <Select
            value={v.run_hour}
            onValueChange={(x) => set("run_hour", x)}
            options={HOURS.map((h) => ({ value: String(h), label: hourWords(h) }))}
            chevron={chevron}
            data-testid="sq-settings-hour"
          />
        }
      />
      <Field
        label={HOW_IT_RUNS.cap}
        control={
          <Select
            value={v.cap_per_run}
            onValueChange={(x) => set("cap_per_run", x)}
            options={optionsOf(CAPS, Number(v.cap_per_run), HOW_IT_RUNS.people)}
            chevron={chevron}
            data-testid="sq-settings-cap"
          />
        }
      />
      {takes.gap ? (
        <Field
          label={HOW_IT_RUNS.gap}
          control={
            <Select
              value={v.gap_days}
              onValueChange={(x) => set("gap_days", x)}
              options={optionsOf(GAPS, Number(v.gap_days), HOW_IT_RUNS.days)}
              chevron={chevron}
              data-testid="sq-settings-gap"
            />
          }
        />
      ) : null}
      {takes.every ? (
        <Field
          label={HOW_IT_RUNS.every}
          control={
            <Select
              value={v.cadence_days}
              onValueChange={(x) => set("cadence_days", x)}
              options={optionsOf(EVERY, Number(v.cadence_days), HOW_IT_RUNS.days)}
              chevron={chevron}
              data-testid="sq-settings-every"
            />
          }
        />
      ) : null}
      <Field
        label={HOW_IT_RUNS.until}
        type="date"
        value={v.until}
        onValueChange={(x) => set("until", x)}
        hint={HOW_IT_RUNS.untilHint}
        data-testid="sq-settings-until"
      />
      {rec.sequence.starts === "list" ? <p className="sq-settings-note">{HOW_IT_RUNS.onceEach}</p> : null}
    </div>
  );
}

export function SettingsSheet({ open, rec, flash, moved, onClose }: SettingsSheetProps) {
  const row = rec.sequence;
  const [was] = useState(() => openingValues(rec));
  const [v, setV] = useState(was);
  const [busy, setBusy] = useState(false);
  const change = changeOf(was, v);
  const save = async () => {
    setBusy(true);
    const ok = await pressed("playbook_change", { playbook_id: row.id, name: row.name, ...change }, flash, moved);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={HOW_IT_RUNS.title}
      sub={row.name}
      close={{ label: HOW_IT_RUNS.cancel, glyph: <Icon name="x" size={13} /> }}
      backCloses
      testid="sq-settings"
      foot={
        <div className="sq-stepfoot">
          <Button onClick={onClose} data-testid="sq-settings-cancel">
            {HOW_IT_RUNS.cancel}
          </Button>
          <Button
            variant="primary"
            className="sq-stepfoot-end"
            onClick={() => void save()}
            disabled={busy || Object.keys(change).length === 0}
            aria-busy={busy}
            data-testid="sq-settings-save"
            {...gate("approve")}
          >
            {HOW_IT_RUNS.save}
          </Button>
        </div>
      }
    >
      <SettingsFields rec={rec} v={v} set={(k, value) => setV((x) => ({ ...x, [k]: value }))} />
    </Sheet>
  );
}
