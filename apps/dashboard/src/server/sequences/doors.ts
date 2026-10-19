import "server-only";
import {
  AppError,
  SEQUENCE_FLOW_WORDS,
  takesFollowUps,
  validateReachOutWords,
  wordsIssueWords,
  type ParamSpec,
} from "@chanlytics/contracts";
import { templateValues } from "@chanlytics/core";
import {
  discardSequence,
  makeSequence,
  moveToSequence,
  removeSequenceStep,
  saveSequenceStep,
  sequenceOverview,
  sequenceStepsOf,
  setSequenceStepWords,
  takeOutOfSequence,
  putBackInSequence,
  type DoorResult,
  type Json,
  type SequenceDoorAnswer,
} from "@chanlytics/db";
import { checkPlaybookInput } from "@/server/campaigns/playbooks";
import { visitTwinRefusal } from "@/server/campaigns/playbook-row";
import { requireUuid } from "@/server/request-guards";
import { templateValuePorts } from "@/server/ports/campaign-ports";
import { dbRefusal, type RouteContext } from "@/server/with-route";
import {
  LEAD_FIRST_BODY,
  type LeaveBody,
  type MoveBody,
  type NewSequenceBody,
  type NewStepBody,
  type StepChangeBody,
  type StepWordsBody,
} from "./bodies";

/**
 * A sequence's doors (decision 0060, 00442), as the routes under sequences press them: a new sequence made whole and one
 * that never sent let go, a customer's step after the first added, changed or taken away, a step given another message,
 * and people taken out. A step's values are judged
 * against its message here (core templateValues, the one judgement a playbook's values meet); each door judges the
 * member and writes its decision in its own transaction, and its refusal is said in its own words.
 */

type Sequence = { id: string; tenant_id: string };

/**
 * A door's answer, or its refusal said: a check the body could not see (a step past the twentieth) is the person's to
 * mend; anything a door names is said as dbRefusal says it.
 */
function doorAnswer(r: DoorResult<SequenceDoorAnswer>): SequenceDoorAnswer {
  if (!r.error) return r.data;
  if (r.error.code === "23514") throw new AppError("validation", "That step cannot be kept as it is.", 422);
  throw dbRefusal(r.error);
}

const decided = (ctx: RouteContext, decision: { [key: string]: Json }) => ({
  decision,
  via: ctx.via ?? null,
  undoOf: ctx.undoOf ?? null,
});

/**
 * The values a step's message takes, judged as a playbook's are (core templateValues): as many as its slots, each typed
 * words or a value a run can fill. A step after the first knows no visit and no proposal of the person it reaches.
 */
async function valuesOf(
  ctx: RouteContext,
  tenantId: string,
  templateId: string,
  params: unknown,
): Promise<ParamSpec[]> {
  const ports = templateValuePorts(ctx, tenantId);
  const { specs } = await templateValues(ports, { templateId, params: params ?? [], visits: false, proposal: false });
  return specs;
}

/** A step of this sequence, as its reader says it, or 404: a step of another sequence is not one of this. */
export async function stepOfSequence(ctx: RouteContext, seq: Sequence, stepId: string) {
  const id = requireUuid(stepId, "step");
  const step = (await sequenceStepsOf(ctx.supabase, seq.tenant_id, seq.id)).find((s) => s.id === id);
  if (!step) throw new AppError("not_found", "Step not found.", 404);
  return step;
}

/** A step of this sequence after its first: the first is the sequence, changed where the sequence is. */
async function laterStepOf(ctx: RouteContext, seq: Sequence, stepId: string) {
  const step = await stepOfSequence(ctx, seq, stepId);
  if (step.id === seq.id) throw new AppError("validation", "The first step is the sequence: change it there.", 422);
  return step;
}

/**
 * A new customer's sequence made whole (S4, New): its first step judged as every campaign's is (checkPlaybookInput, the
 * check POST playbooks makes: its moment offered here, its message, values, class, hour and channels), each step after it
 * against its message, then all of it written in one transaction with its decision, kept as a draft or started.
 */
export async function makeSequenceNow(ctx: RouteContext, tenantId: string, input: NewSequenceBody) {
  if (input.first.starts === "leads") return makeLeadSequenceNow(ctx, tenantId, input);
  const v = await checkPlaybookInput(ctx, tenantId, input.first, null);
  // Started on a visit moment another sequence already runs on: refused (a draft is kept; its start meets this again).
  const twin = input.start ? await visitTwinRefusal(ctx, tenantId, { trigger: v.trigger }) : null;
  if (twin) throw new AppError("conflict", twin, 409);
  const then = await Promise.all(
    input.then.map(async (t) => ({
      after_days: t.after_days,
      template_id: t.template_id,
      params: await valuesOf(ctx, tenantId, t.template_id, t.params),
      only_if: t.only_if ?? [],
      ...(t.name ? { name: t.name } : {}),
    })),
  );
  return doorAnswer(
    await makeSequence(ctx.supabase, {
      tenantId,
      first: {
        name: v.name,
        trigger: v.trigger,
        list_id: v.list_id,
        list_key: v.list_key,
        template_id: v.template_id,
        params: v.params,
        policy_class: v.policy_class,
        run_hour: v.run_hour,
        cap_per_run: v.cap_per_run,
        gap_days: v.gap_days,
        cadence_days: v.cadence_days,
        channels: v.channels,
      },
      then,
      start: input.start,
      ...decided(ctx, { name: v.name, trigger: v.trigger, steps: then.length + 1 }),
    }),
  );
}

/**
 * A sequence to leads made by name (00459, one creator): a copy of another, Ask's words, or one email still to write, on
 * its list, a draft until Start. Words given are checked as every email is (contracts validateReachOutWords), an empty
 * one left to write; the door judges the member, the list, the copy and the search, and writes its decision.
 */
async function makeLeadSequenceNow(ctx: RouteContext, tenantId: string, input: NewSequenceBody) {
  const parsed = LEAD_FIRST_BODY.safeParse(input.first);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0]?.message ?? "Name it.", 422);
  const first = parsed.data;
  const steps = (first.steps ?? []).map(({ id: _id, hand, ...s }) => (hand ? { ...s, hand } : s));
  steps.forEach((s, i) => {
    if ("hand" in s || !s.body.trim()) return;
    const [issue] = validateReachOutWords({ subject: s.subject, body: s.body }, i === 0);
    if (issue) throw new AppError("validation", wordsIssueWords(issue), 422);
  });
  return doorAnswer(
    await makeSequence(ctx.supabase, {
      tenantId,
      first: { ...first, ...(steps.length > 0 ? { steps } : {}) },
      then: [],
      start: input.start,
      ...decided(ctx, { name: first.name, copied: first.from ?? null }),
    }),
  );
}

/** A lead out of the sequence it stands in and into this one, while nothing was sent to it (00459 sequence_move). */
export async function moveToSequenceNow(ctx: RouteContext, seq: Sequence, input: MoveBody) {
  const r = await moveToSequence(ctx.supabase, {
    tenantId: seq.tenant_id,
    leadId: input.lead_id,
    toRoot: seq.id,
    decision: { lead_id: input.lead_id },
    via: ctx.via ?? null,
  });
  if (r.error) throw dbRefusal(r.error);
  return { ...r.data, sequence_id: r.data.from };
}

/** A sequence that never sent taken away whole: a draft let go. One that sent is refused in its own words (409). */
export async function discardSequenceNow(ctx: RouteContext, seq: Sequence) {
  const r = await discardSequence(ctx.supabase, { tenantId: seq.tenant_id, sequenceId: seq.id, ...decided(ctx, {}) });
  if (r.error?.code === "P0001") throw dbRefusal(r.error, { code: "conflict", status: 409 });
  return doorAnswer(r);
}

/** A step after the last (D6), where the sequence takes one (contracts takesFollowUps: never after a reminder). */
export async function addSequenceStep(ctx: RouteContext, seq: Sequence, input: NewStepBody) {
  const [row] = await sequenceOverview(ctx.supabase, seq.tenant_id, seq.id);
  // A customer's sequence that takes none is a reminder; any other kind is the door's own to refuse, in its words.
  const customers = row?.starts === "moment" || row?.starts === "list";
  if (row && customers && !takesFollowUps(row))
    throw new AppError("validation", SEQUENCE_FLOW_WORDS.noFollowUpOnReminder, 422);
  const params = await valuesOf(ctx, seq.tenant_id, input.template_id, input.params);
  const step = {
    after_days: input.after_days,
    template_id: input.template_id,
    params,
    ...(input.only_if ? { only_if: input.only_if } : {}),
    ...(input.channels ? { channels: input.channels } : {}),
    ...(input.name ? { name: input.name } : {}),
  };
  return doorAnswer(
    await saveSequenceStep(ctx.supabase, {
      tenantId: seq.tenant_id,
      sequenceId: seq.id,
      step,
      ...decided(ctx, { fields: Object.keys(input) }),
    }),
  );
}

/** A step after the first, changed in place; new values are judged against the message it sends. */
export async function changeSequenceStep(ctx: RouteContext, seq: Sequence, stepId: string, input: StepChangeBody) {
  const step = await laterStepOf(ctx, seq, stepId);
  const params =
    input.params === undefined ? undefined : await valuesOf(ctx, seq.tenant_id, step.template_id ?? "", input.params);
  const change = {
    id: step.id,
    ...(input.after_days !== undefined ? { after_days: input.after_days } : {}),
    ...(input.only_if ? { only_if: input.only_if } : {}),
    ...(input.channels ? { channels: input.channels } : {}),
    ...(input.name ? { name: input.name } : {}),
    ...(params ? { params } : {}),
  };
  return doorAnswer(
    await saveSequenceStep(ctx.supabase, {
      tenantId: seq.tenant_id,
      sequenceId: seq.id,
      step: change,
      ...decided(ctx, { fields: Object.keys(input) }),
    }),
  );
}

/** A step after the first taken away, with the steps after it; a first step never (it is the sequence). */
export async function dropSequenceStep(ctx: RouteContext, seq: Sequence, stepId: string) {
  const step = await laterStepOf(ctx, seq, stepId);
  return doorAnswer(
    await removeSequenceStep(ctx.supabase, { tenantId: seq.tenant_id, stepId: step.id, ...decided(ctx, {}) }),
  );
}

/** A step's message changed, with the values it takes: at once, or waiting for WhatsApp (`waits`). */
export async function changeSequenceWords(ctx: RouteContext, seq: Sequence, stepId: string, input: StepWordsBody) {
  const step = await stepOfSequence(ctx, seq, stepId);
  const params = await valuesOf(ctx, seq.tenant_id, input.template_id, input.params);
  return doorAnswer(
    await setSequenceStepWords(ctx.supabase, {
      tenantId: seq.tenant_id,
      stepId: step.id,
      templateId: input.template_id,
      params,
      ...decided(ctx, {}),
    }),
  );
}

/**
 * A leave undone: the people it took out put back, where still out for its reason, with their next step. It names the
 * leave it undoes as every undo does (the x-undo-of header the verb walk sends); without one there is nothing to put back.
 */
export async function returnToSequenceNow(ctx: RouteContext, seq: Sequence) {
  if (!ctx.undoOf) throw new AppError("validation", "Say which leave to undo.", 400);
  return doorAnswer(
    await putBackInSequence(ctx.supabase, { tenantId: seq.tenant_id, sequenceId: seq.id, ...decided(ctx, {}) }),
  );
}

/** People taken out of the sequence: a send of theirs not yet gone is skipped with them. */
export async function leaveSequenceNow(ctx: RouteContext, seq: Sequence, input: LeaveBody) {
  return doorAnswer(
    await takeOutOfSequence(ctx.supabase, {
      tenantId: seq.tenant_id,
      sequenceId: seq.id,
      enrollmentIds: input.enrollment_ids,
      leadIds: input.lead_ids,
      ...decided(ctx, {}),
    }),
  );
}
