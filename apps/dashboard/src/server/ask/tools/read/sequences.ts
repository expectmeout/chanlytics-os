import "server-only";
import {
  PEOPLE_GROUP_WORDS,
  SEQUENCE_PEOPLE_GROUPS,
  UUID,
  clockStamp,
  needsCount,
  needsWords,
  noteRows,
  sequenceChannelsWords,
  sequenceGroupOf,
  sequenceHeadLine,
  sequenceNotice,
  sequenceRowLine,
  sequenceStartWords,
  sequenceStartsSentence,
  sequenceStateWords,
  sequenceStopsSentence,
  sequenceWaitWords,
  type SequenceRowDto,
  type AppointmentWord,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { sequence, sequenceHistory, sequencePeople, sequences } from "../../../readers/sequences";
import { str, unlessNotFound, type ToolContext } from "../context";

/**
 * Ask's reads of the sequences (decision 0060), over the Sequences page's own readers (readers/sequences.ts), so the
 * number Ask says is the number the page shows, in the page's own words (contracts sequence-words.ts).
 */

/** How many batches of a sequence's History one read says. */
const HISTORY_CAP = 5;

/** A sequence as its list row says it. */
function sequenceLine(row: SequenceRowDto, word: AppointmentWord, tz: string, nowMs: number) {
  const needs = needsCount(row.needs);
  return {
    sequence_id: row.id,
    name: row.name,
    group: sequenceGroupOf(row),
    starts: sequenceStartWords(row, word),
    state: sequenceStateWords(row),
    line: sequenceRowLine(row, tz, nowMs),
    steps: row.steps,
    channels: sequenceChannelsWords(row.channels),
    in_it: row.in_it,
    ...(needs > 0 ? { needs_you: needsWords(row.needs), needs_count: needs } : {}),
  };
}

/** Every sequence of the workspace, newest first, with what needs you in each (GET sequences' own read). */
export async function readSequences(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, sequences, undefined);
  noteRows(t.read, read.rows);
  const nowMs = t.now.getTime();
  const rows = read.data.sequences.map((r) => sequenceLine(r, read.data.word, t.timezone, nowMs));
  return {
    route: "campaigns",
    needs_you: rows.reduce((n, r) => n + (r.needs_count ?? 0), 0),
    sequences: rows,
  };
}

/**
 * One sequence as its record says it (GET sequences/:id, /people and /history's own reads): its head, what starts and
 * stops it, its steps in their places with each one's wait, channels and message, the one notice it shows, who is in it
 * by where they stand, and its last batches.
 */
export async function readSequence(t: ToolContext, input: { sequence_id: string }): Promise<unknown> {
  const id = str(input.sequence_id, 40);
  if (!UUID.test(id)) return { error: "sequence_id must be an id sequences with action list returned" };
  const record = await unlessNotFound(load(t.rc, sequence, { id }));
  if (!record) return { error: "no such sequence in this workspace" };
  const [people, history] = await Promise.all([
    load(t.rc, sequencePeople, { id }).then((r) => r.data),
    load(t.rc, sequenceHistory, { id, before: null }).then((r) => r.data),
  ]);
  noteRows(t.read, record.rows);
  const { sequence: row, steps, mode, word } = record.data;
  const nowMs = t.now.getTime();
  const notice = sequenceNotice(row, steps, t.timezone, nowMs);
  return {
    ...sequenceLine(row, word, t.timezone, nowMs),
    head: sequenceHeadLine(row, word, t.timezone, nowMs),
    starts_when: sequenceStartsSentence(row, word, t.timezone, nowMs),
    stops_when: sequenceStopsSentence(row, steps),
    mode,
    ...(notice ? { notice: notice.words } : {}),
    steps: steps.map((s) => ({
      step_id: s.id,
      place: s.place,
      ...(s.place > 1 ? { waits: sequenceWaitWords(s) } : {}),
      message: s.template_name,
      channels: sequenceChannelsWords(s.channels),
      sent_30_days: s.sent,
      replied_30_days: s.replied,
      ...(s.next_words ? { new_words_waiting: s.next_words.name, whatsapp_says: s.next_words.status } : {}),
    })),
    people: Object.fromEntries(
      SEQUENCE_PEOPLE_GROUPS.filter((g) => (people.counts[g] ?? 0) > 0).map((g) => [
        PEOPLE_GROUP_WORDS[g],
        people.counts[g],
      ]),
    ),
    history: history.batches.slice(0, HISTORY_CAP).map((b) => ({
      at: clockStamp(Date.parse(b.at), t.timezone, nowMs),
      state: b.state,
      people: b.people,
      sent: b.counts.sent ?? 0,
      replied: b.counts.replied ?? 0,
      ...(b.failure ? { failure: b.failure } : {}),
    })),
    older_history: history.more || history.batches.length > HISTORY_CAP,
  };
}
