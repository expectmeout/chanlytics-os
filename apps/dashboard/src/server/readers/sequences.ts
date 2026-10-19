import "server-only";
import {
  AppError,
  addressOf,
  historyCovers,
  historyIn,
  historySince,
  runDaysAt,
  sequenceWaitsNow,
  type SequenceBatchDto,
  type SequenceHistoryDto,
  type SequenceRepliesDto,
  type SequencePeopleDto,
  type SequenceReachDto,
  type SequenceRecordDto,
  type SequencesPageDto,
} from "@chanlytics/contracts";
import {
  leadRepliesOfBatches,
  leadsFedBy,
  oneOffMessageOf,
  sequenceHistoryOf,
  sequenceOfPart,
  sequenceOverview,
  sequencePeopleOf,
  sequenceStepsOf,
  firstStepFacts,
  lastRunSkipped,
} from "@chanlytics/db";
import { playbookCountKey, readingFor } from "@/lib/campaign-channels";
import { repliedConversationsOf } from "../campaigns/broadcasts";
import { load, stamp, type Reader, type ReaderContext } from "./index";
import * as readers from "./facts";
import { playbooks as playbooksReader } from "./playbooks";

/**
 * The Sequences page's reads (decision 0060), one reader each, which Ask's tools read too, so the number Ask says is the
 * number the page shows: the workspace's sequences, one sequence with its steps and who approves its batches, who is in
 * one, and what one sent. Each runs on the member's own session (00442's readers are under their row security), and
 * says the workspace's clock beside what it read.
 */

/** A sequence's row, cited where its record opens. */
const cited = (s: { id: string; name: string }) => ({
  kind: "playbook" as const,
  id: s.id,
  route: addressOf({ kind: "campaign", id: s.id }),
  label: s.name,
});

/** GET sequences: every sequence of the workspace, newest first, with what needs you in each. */
export const sequences: Reader<undefined, SequencesPageDto> = {
  name: "sequences",
  async read(rc) {
    const [rows, facts, word] = await Promise.all([
      sequenceOverview(rc.ctx.supabase, rc.tenantId),
      load(rc, readers.facts, undefined).then((r) => r.data),
      // The word its steps are said in, the workspace's own (readers/facts.ts): nothing else of its shape is said here.
      load(rc, readers.appointmentWord, undefined).then((r) => r.data),
    ]);
    // What waits for you, as the badge counts it: a batch whose day has passed is no one's to approve.
    const days = runDaysAt(facts.timezone, rc.now);
    return {
      data: { sequences: rows.map((r) => sequenceWaitsNow(r, days)), timezone: facts.timezone, word },
      rows: rows.map(cited),
      stamp: stamp(),
    };
  },
};

/**
 * What the record says of a sequence beside its row, by how it starts: what a sequence to leads writes to (Add leads), and
 * a one-off's one message (its flow's step). Neither for any other. Unreadable costs its line alone, never the record: what
 * a sequence to leads writes to is then its search, as before it was read, and a one-off names itself.
 */
async function startsWith(
  rc: ReaderContext,
  row: Pick<SequenceRecordDto["sequence"], "starts" | "first" | "date">,
): Promise<Pick<SequenceRecordDto, "fed_by" | "one_off">> {
  const db = rc.ctx.supabase;
  const search = row.starts === "leads" ? row.first?.search_id : null;
  if (search) return { fed_by: await leadsFedBy(db, rc.tenantId, search).catch(() => "search" as const) };
  if (row.starts === "date" && row.date)
    return { one_off: await oneOffMessageOf(db, rc.tenantId, row.date.batch_id).catch(() => null) };
  return {};
}

/**
 * GET sequences/:id: one sequence, its steps in their places, and the mode its batches are approved under; what a sequence
 * to leads writes to, and a one-off's message (startsWith). An id that is a part of one (a batch's: a run's address; a
 * step's) reads the sequence it belongs to, whose own id the answer names.
 */
export const sequence: Reader<{ id: string }, SequenceRecordDto> = {
  name: "sequence",
  async read(rc, { id: asked }) {
    const own = await sequenceOverview(rc.ctx.supabase, rc.tenantId, asked);
    const id = own.length > 0 ? asked : ((await sequenceOfPart(rc.ctx.supabase, rc.tenantId, asked)) ?? asked);
    const [rows, steps, facts, word, policies, first, lastRunOff] = await Promise.all([
      id === asked ? own : sequenceOverview(rc.ctx.supabase, rc.tenantId, id),
      sequenceStepsOf(rc.ctx.supabase, rc.tenantId, id),
      load(rc, readers.facts, undefined).then((r) => r.data),
      load(rc, readers.appointmentWord, undefined).then((r) => r.data),
      // Who approves: the first step's class's mode (a class with no row is ask). A matrix that could not be read costs
      // that one line, never the record.
      load(rc, readers.policies, undefined).then(
        (r) => r.data,
        () => null,
      ),
      // Its first step's (the sequence's own id) run facts: the day it last ran (when its next run goes), its cap, gap and
      // cadence (Start's Change opens with them). Unreadable costs those lines alone.
      firstStepFacts(rc.ctx.supabase, rc.tenantId, id).catch(() => undefined),
      // Why its last run did nothing, where it did (the record's notice says it, sequence-run-off.ts). Unreadable: unsaid.
      lastRunSkipped(rc.ctx.supabase, rc.tenantId, id).catch(() => undefined),
    ]);
    const [read] = rows;
    if (!read) throw new AppError("not_found", "Sequence not found.", 404);
    const row = sequenceWaitsNow(read, runDaysAt(facts.timezone, rc.now));
    const cls = row.first?.policy_class ?? null;
    const mode = cls && policies ? (policies.find((p) => p.class === cls)?.mode ?? "ask") : null;
    return {
      data: {
        sequence: row,
        steps,
        mode,
        timezone: facts.timezone,
        word,
        ...(first === undefined ? {} : { last_run_for: first?.last_run_for ?? null }),
        ...(first
          ? { settings: { cap_per_run: first.cap_per_run, gap_days: first.gap_days, cadence_days: first.cadence_days } }
          : {}),
        ...(lastRunOff === undefined ? {} : { last_run_off: lastRunOff }),
        ...(await startsWith(rc, row)),
      },
      rows: [cited(row)],
      stamp: stamp(),
    };
  },
};

/**
 * GET sequences/:id/reach: what Turn on asks with beside the record (contracts sequenceResumeAsk), for a sequence on a
 * moment or a list, whose first step is a campaign's card on GET playbooks: who its next run reaches, read off that read's
 * pools as the card reads it (its own count, its list's or its moment's, for the channels it goes by: lib
 * campaign-channels.ts), the most one run sends, and whether the workspace is paused for billing. Read as the question
 * opens, never with the record: the count is over everyone, as a run's is. A sequence with no such step is not found.
 */
export const sequenceReach: Reader<{ id: string }, SequenceReachDto> = {
  name: "sequenceReach",
  async read(rc, { id }) {
    const pb = (await load(rc, playbooksReader, undefined)).data;
    // A sequence's first step has the sequence's own id (00440).
    const step = pb.playbooks.find((p) => p.id === id);
    if (!step) throw new AppError("not_found", "This sequence does not start on a moment or a list.", 404);
    const reading = readingFor(pb.pools[playbookCountKey(step, pb.pools)], step.channels);
    return {
      data: {
        candidates: reading ? reading.candidates : null,
        cap_per_run: step.cap_per_run ?? null,
        paused: pb.ready?.paused === true,
      },
      rows: [cited(step)],
      stamp: stamp(),
    };
  },
};

/** GET sequences/:id/people: who is in it, by where they stand. */
export const sequencePeople: Reader<{ id: string; limit?: number }, SequencePeopleDto> = {
  name: "sequencePeople",
  async read(rc, { id, limit }) {
    const data = await sequencePeopleOf(rc.ctx.supabase, { tenantId: rc.tenantId, sequenceId: id, limit });
    return { data, rows: [], stamp: stamp() };
  },
};

/** GET sequences/:id/history: what it sent, a batch a row, newest first, before `before` where it is given. */
export const sequenceHistory: Reader<{ id: string; before?: string | null }, SequenceHistoryDto> = {
  name: "sequenceHistory",
  async read(rc, { id, before }) {
    const data = await sequenceHistoryOf(rc.ctx.supabase, { tenantId: rc.tenantId, sequenceId: id, before });
    return { data, rows: [], stamp: stamp() };
  },
};

/** How many of History's pages a period's replies read back through at most: "all" of a long-lived sequence stops here. */
const REPLIES_PAGES_MAX = 20;

/**
 * GET sequences/:id/replies: the conversations that answered a sequence over one of History's periods, for the Inbox to
 * list (contracts sequenceRepliesRoute). The batches are History's own, read back as far as the period asks (historyCovers,
 * as History reads them), and their replies are its days' own: a customer's by a run sheet's rule (repliedConversationsOf),
 * a lead's as History counts one (leadRepliesOfBatches).
 */
export const sequenceReplies: Reader<{ id: string; period: "30" | "90" | "all" }, SequenceRepliesDto> = {
  name: "sequenceReplies",
  async read(rc, { id, period }) {
    const db = rc.ctx.supabase;
    const [rows, facts] = await Promise.all([
      sequenceOverview(db, rc.tenantId, id),
      load(rc, readers.facts, undefined).then((r) => r.data),
    ]);
    const [row] = rows;
    if (!row) throw new AppError("not_found", "Sequence not found.", 404);
    const tz = facts.timezone;
    const since = historySince(period, tz, rc.now.getTime());
    const batches: SequenceBatchDto[] = [];
    let page = await sequenceHistoryOf(db, { tenantId: rc.tenantId, sequenceId: id });
    batches.push(...page.batches);
    for (let n = 1; n < REPLIES_PAGES_MAX && !historyCovers({ batches, more: page.more }, since, tz); n += 1) {
      const last = batches[batches.length - 1];
      if (!last) break;
      page = await sequenceHistoryOf(db, { tenantId: rc.tenantId, sequenceId: id, before: last.at });
      batches.push(...page.batches);
    }
    const ids = historyIn(batches, since, tz).map((b) => b.id);
    const [customers, leads] = await Promise.all([
      repliedConversationsOf(rc.ctx, rc.tenantId, ids),
      leadRepliesOfBatches(db, rc.tenantId, ids),
    ]);
    return {
      data: { sequence_id: row.id, name: row.name, period, conversation_ids: [...new Set([...customers, ...leads])] },
      rows: [cited(row)],
      stamp: stamp(),
    };
  },
};
