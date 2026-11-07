/**
 * What a moment playbook's runs earned, as the database counts it (playbook_totals, 00374): one entry per moment
 * playbook that has run, by its id, in storage's casing. The dashboard reads it into a card's totals (server
 * campaigns/playbooks.ts toPlaybookTotals) behind isPlaybookTotalsDto, never a cast, and GET playbooks answers the same
 * bytes it answered when it summed every run itself. A playbook that never ran is absent.
 */
import { isCount, recordOrNull } from "@chanlytics/contracts";

/** One run on a card's history, newest first: the day it ran for, and what it earned. */
interface PlaybookHistoryRunDto {
  id: string;
  run_for: string | null;
  state: string;
  scheduled_for: string;
  recipient_count: number;
  sent: number;
  /** Its people skipped or failed: a run's "held", the glossary's Held (a run's people). */
  held: number;
  delivered: number;
  replied: number;
}

/** One moment playbook's totals over every run it made, its newest run, the run that waits, and its newest few. */
interface PlaybookTotalsRowDto {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  last_run: { id: string; state: string; run_for: string | null; recipient_count: number };
  waiting: { id: string; recipient_count: number; name: string; run_for: string | null; trigger: string | null } | null;
  history: PlaybookHistoryRunDto[];
}

/** playbook_totals' answer: each moment playbook that has run, by its id. */
export type PlaybookTotalsDto = Record<string, PlaybookTotalsRowDto>;

const isText = (v: unknown): v is string => typeof v === "string";
const isTextOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

function isHistoryRun(value: unknown): value is PlaybookHistoryRunDto {
  const record = recordOrNull(value);
  return (
    !!record &&
    isText(record.id) &&
    isTextOrNull(record.run_for) &&
    isText(record.state) &&
    isText(record.scheduled_for) &&
    isCount(record.recipient_count) &&
    isCount(record.sent) &&
    isCount(record.held) &&
    isCount(record.delivered) &&
    isCount(record.replied)
  );
}

function isLastRun(v: unknown): v is PlaybookTotalsRowDto["last_run"] {
  const r = recordOrNull(v);
  return !!r && isText(r.id) && isText(r.state) && isTextOrNull(r.run_for) && isCount(r.recipient_count);
}

function isWaiting(value: unknown): value is NonNullable<PlaybookTotalsRowDto["waiting"]> {
  const record = recordOrNull(value);
  return (
    !!record &&
    isText(record.id) &&
    isCount(record.recipient_count) &&
    isText(record.name) &&
    isTextOrNull(record.run_for) &&
    isTextOrNull(record.trigger)
  );
}

function isTotalsRow(value: unknown): value is PlaybookTotalsRowDto {
  const record = recordOrNull(value);
  return (
    !!record &&
    isCount(record.runs) &&
    isCount(record.sent) &&
    isCount(record.delivered) &&
    isCount(record.replied) &&
    isCount(record.held) &&
    isLastRun(record.last_run) &&
    (record.waiting === null || isWaiting(record.waiting)) &&
    Array.isArray(record.history) &&
    record.history.every(isHistoryRun)
  );
}

/** Whether the database answered playbook_totals: totals by playbook id, each whole (an empty object: none has run). */
export function isPlaybookTotalsDto(answer: unknown): answer is PlaybookTotalsDto {
  const byId = recordOrNull(answer);
  return !!byId && Object.values(byId).every(isTotalsRow);
}
