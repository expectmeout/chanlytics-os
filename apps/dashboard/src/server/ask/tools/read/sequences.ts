import "server-only";
import {
  PEOPLE_GROUP_WORDS,
  SEQUENCE_PEOPLE_GROUPS,
  UUID,
  clockStamp,
  evidenceWords,
  heldWhyOf,
  isReachOutHold,
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
  SEQUENCES_ROUTE,
} from "@chanlytics/contracts";
import { load } from "../../../readers";
import { sequence, sequenceHistory, sequencePeople, sequences } from "../../../readers/sequences";
import { notePerson, str, unlessNotFound, type ToolContext } from "../context";

/**
 * Ask's reads of the sequences (decision 0060), over the Sequences page's own readers (readers/sequences.ts), so the
 * number Ask says is the number the page shows, in the page's own words (contracts sequence-words.ts).
 */

/** How many batches of a sequence's History one read says. */
const HISTORY_CAP = 5;
/** How many of who waits on the owner, and of who is in a sequence, one read names: the counts say them all. */
const PEOPLE_CAP = 25;

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
    route: SEQUENCES_ROUTE,
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
  // Who is in it, by the contact_id the answer hands on: each one's profile opens.
  const inIt = people.rows
    .filter((r) => r.enrollment_id && r.group !== "left" && r.group !== "done")
    .slice(0, PEOPLE_CAP);
  for (const r of inIt) notePerson(t, r.contact_id, r.name ?? "");
  const { sequence: row, steps, word } = record.data;
  const nowMs = t.now.getTime();
  const notice = sequenceNotice(row, steps);
  return {
    ...sequenceLine(row, word, t.timezone, nowMs),
    head: sequenceHeadLine(row, word, t.timezone, nowMs),
    starts_when: sequenceStartsSentence(row, word, t.timezone, nowMs),
    stops_when: sequenceStopsSentence(row, steps),
    // Its own mode (decision 0064): how its batches are decided; null for a one-off. And what its batches did, as How it
    // runs says it under Before each batch (step 5): the evidence a mode is set on, never a suggestion of one.
    mode: row.mode,
    ...(record.data.evidence ? { batches_did: evidenceWords(record.data.evidence) } : {}),
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
    // Who waits on the owner, by id (the operator, 15 Oct 2026): an email the check held (propose_sequence action
    // decide) or one handed to them to send (action sent_by_hand); and who is in it, for action leave.
    waiting_on_you: people.rows
      .filter((r) => (r.group === "held" || r.group === "to_send") && r.send_id)
      .slice(0, PEOPLE_CAP)
      .map((r) => ({
        send_id: r.send_id,
        name: r.name,
        stands: PEOPLE_GROUP_WORDS[r.group],
        // A held email's why in the words its row says (contracts heldWhyOf): its stored detail carries the check's kind.
        ...(r.group === "held" && isReachOutHold(r.why)
          ? { why: heldWhyOf(r.why, r.hold_detail) }
          : r.why || r.hold_detail
            ? { why: r.hold_detail ?? r.why }
            : {}),
      })),
    // Who wrote back and waits for an answer (00455), answered in their thread: the Inbox's, never a sequence's.
    wrote_back: people.rows
      .filter((r) => r.group === "replied")
      .slice(0, PEOPLE_CAP)
      .map((r) => ({
        name: r.name,
        ...(r.reply?.intent ? { read_as: r.reply.intent } : {}),
        ...(r.reply?.summary ? { said: r.reply.summary } : {}),
        ...(r.reply?.conversation_id ? { conversation_id: r.reply.conversation_id } : {}),
      })),
    in_it: inIt.map((r) => ({
      name: r.name,
      stands: PEOPLE_GROUP_WORDS[r.group],
      ...(r.contact_id ? { contact_id: r.contact_id } : {}),
      ...(r.lead_id ? { lead_id: r.lead_id } : {}),
    })),
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
