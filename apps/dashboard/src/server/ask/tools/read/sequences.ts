import "server-only";
import {
  DAY_MS,
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
  sentAsDrafted,
  type ReachOutChainDto,
  type SequenceRowDto,
  type AppointmentWord,
  SEQUENCES_ROUTE,
} from "@chanlytics/contracts";
import { sequenceMakes, type SequenceMake } from "@chanlytics/db";
import { load } from "../../../readers";
import { reachOutChains } from "../../../readers/playbooks";
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

/**
 * The cold email sequences (Reach out, decision 0056) as Campaigns lists them (readers/playbooks.ts reachOutChains, GET
 * reach-outs' own read): each with its id, name, the search or list of leads it writes to, whether it runs, its emails and
 * their waits, its pace and who it is in it. Every one is a row an answer may cite, opened on its drawer.
 */
export async function readColdEmails(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, reachOutChains, undefined);
  noteRows(t.read, read.rows);
  return {
    route: SEQUENCES_ROUTE,
    cold_emails: read.data.chains.map((c) => ({
      root_id: c.root_id,
      name: c.name,
      writes_to: c.search ? { search_id: c.search.id, name: c.search.name } : null,
      state: c.state,
      emails: c.steps.length,
      gap_minutes: c.gap_minutes,
      owner_sends: c.owner_sends === true,
      ...(c.people ? { people: { waiting: c.people.waiting, writing: c.people.writing, done: c.people.done } } : {}),
    })),
  };
}

/** How far back `edited` reads, in days: one when left out, as the morning asks ("since yesterday"); a month at most. */
export const EDITED_DAYS = { default: 1, max: 30 } as const;
/** The cold emails one `edited` read says, newest first: enough to see a habit, never a history. */
const EDITED_CAP = 3;
/** The member's makes one `edited` read looks through, newest first. */
const EDITED_MAKES = 20;

/** One cold email the member made whose first email is theirs, as `edited` says it. */
interface EditedEmail {
  sequence_id: string;
  name: string;
  /** What it was for: the search it writes to. */
  for: string | null;
  state: ReachOutChainDto["state"];
  /** Ask's draft of the first email, or null where they wrote it themself. */
  drafted: { subject: string | null; body: string } | null;
  /** The first email as it stands: their words. */
  sent: { subject: string | null; body: string };
}

/**
 * The member's own cold emails whose first email is theirs (decision 0078 step 2): changed from what Ask drafted, or
 * written whole by them, newest first. Pure, over the member's makes (newest first) and the chains as Campaigns reads
 * them; one sent as Ask drafted it, a call's or a note's first step, and an email with no words are not theirs.
 */
export function editedOf(makes: readonly SequenceMake[], chains: readonly ReachOutChainDto[]): EditedEmail[] {
  const byId = new Map(chains.map((c) => [c.root_id, c]));
  return makes.flatMap((m) => {
    const c = byId.get(m.sequence_id);
    const first = c?.steps[0];
    if (!c || !first || first.hand || !first.body.trim()) return [];
    const sent = { subject: first.subject, body: first.body };
    const drafted = m.as_drafted?.steps[0] ?? null;
    if (drafted && sentAsDrafted(drafted, sent)) return [];
    return [{ sequence_id: c.root_id, name: c.name, for: c.search?.name ?? null, state: c.state, drafted, sent }];
  });
}

/**
 * The cold emails to leads the member made in the last days whose first email is theirs (decision 0078 step 2): what
 * Ask drafted beside what they sent, or what they wrote themself. Only the member's own makes are read: a teammate's
 * words are not theirs to quote. What they sent is marked as theirs on the turn, the one place a line about how they
 * write may quote from besides their question (act/remember.ts); nothing else a read returns is ever marked.
 */
export async function readEdited(t: ToolContext, input: { days?: number }): Promise<unknown> {
  const days = Math.min(Math.max(input.days ?? EDITED_DAYS.default, 1), EDITED_DAYS.max);
  const since = new Date(t.now.getTime() - days * DAY_MS).toISOString();
  const [makes, chains] = await Promise.all([
    sequenceMakes(t.ctx.supabase, { tenantId: t.tenantId, by: t.ctx.userId, since, limit: EDITED_MAKES }),
    load(t.rc, reachOutChains, undefined),
  ]);
  const edited = editedOf(makes, chains.data.chains).slice(0, EDITED_CAP);
  noteRows(
    t.read,
    chains.rows.filter((r) => edited.some((e) => e.sequence_id === r.id)),
  );
  t.theirs = [...(t.theirs ?? []), ...edited.flatMap((e) => [e.sent.subject ?? "", e.sent.body].filter(Boolean))];
  return {
    route: SEQUENCES_ROUTE,
    days,
    edited,
    ...(edited.length === 0
      ? { none: `No cold email you made in the last ${days === 1 ? "day" : `${days} days`} has words of your own.` }
      : {}),
  };
}
