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
  type SequenceRecordDto,
  type SequencesPageDto,
} from "@chanlytics/contracts";
import {
  leadRepliesOfBatches,
  sequenceHistoryOf,
  sequenceOfPart,
  sequenceOverview,
  sequencePeopleOf,
  sequenceStepsOf,
} from "@chanlytics/db";
import { repliedConversationsOf } from "../campaigns/broadcasts";
import { load, stamp, type Reader } from "./index";
import * as readers from "./facts";

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
    const [rows, facts, shape] = await Promise.all([
      sequenceOverview(rc.ctx.supabase, rc.tenantId),
      load(rc, readers.facts, undefined).then((r) => r.data),
      load(rc, readers.businessShape, undefined).then((r) => r.data),
    ]);
    // What waits for you, as the badge counts it: a batch whose day has passed is no one's to approve.
    const days = runDaysAt(facts.timezone, rc.now);
    return {
      data: { sequences: rows.map((r) => sequenceWaitsNow(r, days)), timezone: facts.timezone, word: shape.word },
      rows: rows.map(cited),
      stamp: stamp(),
    };
  },
};

/**
 * GET sequences/:id: one sequence, its steps in their places, and the mode its batches are approved under. An id that is
 * a part of one (a batch's: a run's address; a step's) reads the sequence it belongs to, whose own id the answer names.
 */
export const sequence: Reader<{ id: string }, SequenceRecordDto> = {
  name: "sequence",
  async read(rc, { id: asked }) {
    const own = await sequenceOverview(rc.ctx.supabase, rc.tenantId, asked);
    const id = own.length > 0 ? asked : ((await sequenceOfPart(rc.ctx.supabase, rc.tenantId, asked)) ?? asked);
    const [rows, steps, facts, shape, policies] = await Promise.all([
      id === asked ? own : sequenceOverview(rc.ctx.supabase, rc.tenantId, id),
      sequenceStepsOf(rc.ctx.supabase, rc.tenantId, id),
      load(rc, readers.facts, undefined).then((r) => r.data),
      load(rc, readers.businessShape, undefined).then((r) => r.data),
      // Who approves: the first step's class's mode (a class with no row is ask). A matrix that could not be read costs
      // that one line, never the record.
      load(rc, readers.policies, undefined).then(
        (r) => r.data,
        () => null,
      ),
    ]);
    const [read] = rows;
    if (!read) throw new AppError("not_found", "Sequence not found.", 404);
    const row = sequenceWaitsNow(read, runDaysAt(facts.timezone, rc.now));
    const cls = row.first?.policy_class ?? null;
    const mode = cls && policies ? (policies.find((p) => p.class === cls)?.mode ?? "ask") : null;
    return {
      data: { sequence: row, steps, mode, timezone: facts.timezone, word: shape.word },
      rows: [cited(row)],
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
