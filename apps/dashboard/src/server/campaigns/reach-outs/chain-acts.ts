/** Reach outs: chain acts. */

import "server-only";
import {
  AppError,
  REACH_OUT_LANGUAGE,
  REACH_OUT_REFUSALS,
  coldEndingOf,
  reachOutSignatureOf,
  coldSignedOff,
  emailFoot,
  whyFrom,
  chainIssueWords,
  isReachOutRefusal,
  parseTenantConfig,
  reachOutEmailOf,
  validateReachOutChain,
  type ReachOutChainInput,
  type ReachOutChainReportDto,
  type ReachOutDecideDto,
  type ReachOutDecision,
  type ReachOutReachDto,
  type ReachOutRunDto,
  type ReachOutSaidDto,
  type ReachOutSaidOutcome,
  type ReachOutSavedDto,
  type ReachOutStartDto,
} from "@chanlytics/contracts";
import {
  decideSendDoor,
  findEmailWords,
  type ReachOutRunSend,
  type ReachOutStepRow,
  readReachOutChainReport,
  readReachOutReach,
  recheckReachOutRun,
  removeReachOutChain,
  saveReachOutChain,
  sendSaid,
} from "@chanlytics/db/campaigns";
import { emitEvent } from "@chanlytics/db/events";
import type { MailboxConnectionRow } from "@chanlytics/db/email";
import { mailboxSignatureOf } from "@chanlytics/channels/email";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import { recordDecision } from "@/server/shared/verbs";
import { runPlaybookNow, type RunPlaybookOutcome } from "@/server/campaigns/playbook-run";
import { serviceDb } from "@/server/shared/service-db";
import { getStoredConfig } from "@/server/workspace/config-row";
import { log } from "@/server/shared/log";
import { getTenantFacts } from "@/server/shared/tenant";

/** One email written by the model at the edge, whose door may take thirty seconds: a little over it. */
export const PREVIEW_TIMEOUT_MS = 35_000;

interface PgError {
  code?: string;
  message: string;
}

/**
 * A door's refusal, as the route answers it: the database raises contracts' own sentences, said as they are; the
 * status follows the code (P0002 not found, 22023 or 23514 not as it may be, 23505 or 23503 in the way of something).
 */
export function reachOutRefusal(pgError: PgError): Error {
  const sentence = isReachOutRefusal(pgError.message) ? pgError.message : null;
  switch (pgError.code) {
    case "P0002":
      return new AppError("not_found", sentence ?? REACH_OUT_REFUSALS.notFound, 404);
    case "22023":
    case "23514":
      return new AppError("validation", sentence ?? REACH_OUT_REFUSALS.unsaved, 422);
    case "23505":
    case "23503":
      return new AppError("conflict", sentence ?? REACH_OUT_REFUSALS.exists, 409);
    default:
      return new Error(pgError.message);
  }
}

type StepRow = ReachOutStepRow;

/** A chain's steps, root first, each after the one before (after_playbook_id). */
export function chainOf(root: StepRow, all: StepRow[]): StepRow[] {
  const out = [root];
  for (let i = 0; i < 10; i += 1) {
    const next = all.find((s) => s.after_playbook_id === out[out.length - 1].id);
    if (!next) break;
    out.push(next);
  }
  return out;
}

/** A chain's report (00211 reach_out_chain_report): its steps counted once, its last runs, whether it may go. */
export async function getChainReport(
  ctx: RouteContext,
  tenantId: string,
  rootId: string,
): Promise<ReachOutChainReportDto> {
  const { data, error } = await readReachOutChainReport(ctx.supabase, tenantId, rootId);
  if (error) throw reachOutRefusal(error);
  return dtoOf<ReachOutChainReportDto>(data);
}

/** A search's reach: who a chain over it would write to, and who it would not, and why. */
export async function getReach(ctx: RouteContext, tenantId: string, searchId: string): Promise<ReachOutReachDto> {
  const { data, error } = await readReachOutReach(ctx.supabase, tenantId, searchId);
  if (error) throw reachOutRefusal(error);
  return dtoOf<ReachOutReachDto>(data);
}

/** A door's jsonb answer, as the DTO its function builds (00211): the SQL is its shape, and its tests hold it. */
export const dtoOf = <T>(data: unknown): T => data as T;

/** The workspace's booking link, which {{booking link}} needs. */
async function bookingLinkOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  return (await findBusiness(ctx, tenantId)).bookingLink;
}

/**
 * The business an email names, the postal address its foot gives, and its booking link, as a send reads them: from the
 * workspace's one configuration (Business), its name from the workspace where the configuration names none. The run
 * sheet's email and the step's test mail both read it. `workspaceName` is the workspace's own name, which the edge's
 * send fills {{your business}} and the foot with (sender.ts).
 */
export async function findBusiness(
  ctx: RouteContext,
  tenantId: string,
): Promise<{
  name: string;
  workspaceName: string;
  address: string | null;
  bookingLink: string | null;
  /** Sign-off's signature with its phone (decision 0113), under the name of every email Chanlytics sends. */
  signature: string | null;
}> {
  const [facts, stored] = await Promise.all([
    getTenantFacts(ctx.supabase, tenantId),
    getStoredConfig(ctx.supabase, tenantId),
  ]);
  const config = parseTenantConfig(stored ?? null);
  const brain = config?.brain;
  return {
    name: brain?.business_name || facts.name || "your business",
    workspaceName: facts.name,
    address: brain?.profile?.address?.trim() || null,
    bookingLink: brain?.booking_link?.trim() || null,
    signature: reachOutSignatureOf(config),
  };
}

/** What Start did (R14): the edge's outcome with its reason, or that the edge could not be asked. */
function startOf(runPlaybookOutcome: RunPlaybookOutcome): ReachOutStartDto {
  if (runPlaybookOutcome.ok)
    return {
      outcome: runPlaybookOutcome.outcome,
      reason: runPlaybookOutcome.reason ?? runPlaybookOutcome.skipped ?? null,
      planned: runPlaybookOutcome.planned ?? 0,
      run_id: runPlaybookOutcome.runId ?? null,
    };
  const outcome =
    runPlaybookOutcome.reason === "preview"
      ? "preview"
      : runPlaybookOutcome.reason === "edge_unreachable"
        ? "unreached"
        : "failed";
  return { outcome, reason: outcome === "failed" ? runPlaybookOutcome.reason : null, planned: 0, run_id: null };
}

/**
 * A chain saved whole. Every word is validated here first (the database keeps only its CHECKs, R15); then the
 * service role's door, with the member's id and, for a new chain, the start's line in the ledger, in the door's own
 * write (00381); then, for a new chain, its first run asked for now through the run-now door every playbook uses
 * (R13), whose answer is said as it is (R14).
 */
export async function saveChain(
  ctx: RouteContext,
  member: Member,
  input: ReachOutChainInput,
  rootId: string | null,
  /** A draft's record (00459): an email still to write (no words yet) is kept as it is, and Start asks for it. */
  opts: { unwritten?: boolean } = {},
): Promise<ReachOutSavedDto> {
  const all = validateReachOutChain(input, { bookingLink: !!(await bookingLinkOf(ctx, member.tenantId)) });
  const blank = (i: number | null) => {
    const s = i === null ? null : input.steps[i];
    return !!s && !s.hand && !s.body.trim();
  };
  const issues = opts.unwritten ? all.filter((i) => !blank(i.step)) : all;
  if (issues.length > 0) {
    const sentence = issues.map((i) => ({ ...i, words: chainIssueWords(i) }));
    throw new AppError("validation", sentence[0].words, 422, { issues: sentence });
  }
  // An email carries no hand key at all: the door reads a step with one as a call or a note (00228).
  const steps = input.steps.map(({ hand, ...s }) => (hand ? { ...s, hand } : s));
  const { data: saved, error } = await saveReachOutChain(serviceDb(), {
    tenantId: member.tenantId,
    userId: ctx.userId,
    chain: { ...input, steps, root_id: rootId },
    // A new chain is started by this save: the decision rides with it. An edit records none, and its event is below.
    decision: rootId ? null : { payload: { name: input.name }, via: ctx.via ?? null, undoOf: ctx.undoOf ?? null },
  });
  if (error || !saved) throw reachOutRefusal(error ?? { message: "no chain" });
  if (saved.undo_dropped) log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "start_playbook" });
  if (rootId) {
    // A chain edited: a new one is start_playbook, below, and an edit left nothing on the ledger.
    await emitEvent(serviceDb(), member.tenantId, "playbook.changed", "playbook", saved.root_id, {
      name: input.name,
      by: ctx.userId,
      fields: ["steps"],
    });
    return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: saved.rechecked ?? 0, start: null };
  }
  const start = startOf(await runPlaybookNow(member.tenantId, saved.root_id, ctx.userId));
  return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: 0, start };
}

/**
 * A chain that never wrote, removed whole (R16); one that did is refused, in words, to be paused instead. A sequence to
 * leads' Discard comes here too (DELETE sequences/:id, 0072).
 */
export async function removeChain(
  ctx: RouteContext,
  tenantId: string,
  root: { id: string; name: string },
): Promise<{ removed: true; id: string; decision_id: string }> {
  const { error } = await removeReachOutChain(ctx.supabase, tenantId, root.id);
  if (error) throw reachOutRefusal(error);
  const decisionId = await recordDecision(ctx, tenantId, "playbook", root.id, "pause_playbook", {
    name: root.name,
    deleted: true,
  });
  return { removed: true, id: root.id, decision_id: decisionId };
}

/**
 * An owner's answer to one held (or planned) email: include, rewrite, skip, or not a fit, atomic (R18). A rewrite says
 * what should change where its owner did (00505); its opening is written by POST reach-out-sends/check
 * (server/campaigns/sequences/opening.ts).
 */
export async function decideSend(
  ctx: RouteContext,
  send: { id: string; tenant_id: string; broadcast_id: string },
  input: { decision: ReachOutDecision; change?: string },
): Promise<ReachOutDecideDto> {
  const { decision } = input;
  const result = await decideSendDoor(ctx.supabase, { sendId: send.id, decision, change: input.change || null });
  if (result.error) throw reachOutRefusal(result.error);
  // What a member decided of an email the check held, on the run it belongs to: an email went out, or did not, on
  // their word, and the ledger said neither.
  await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
    decision,
    by: ctx.userId,
  });
  return { send_id: send.id, decision };
}

/**
 * The owner's word on an email handed to them (00429): it went (Sent), or it did not (Skip). The door
 * (reach_out_send_said, checked again in SQL) records Sent whatever changed since the draft was handed, since the email
 * left their own inbox: the email, the send and the lead in one transaction, with what about its lead would refuse it
 * now (since), said beside it. Said once; a second word answers how it stands.
 */
export async function saySend(
  ctx: RouteContext,
  send: { id: string; tenant_id: string; broadcast_id: string },
  outcome: ReachOutSaidOutcome,
): Promise<ReachOutSaidDto> {
  const result = await sendSaid(ctx.supabase, { sendId: send.id, outcome, reason: null });
  if (result.error) throw reachOutRefusal(result.error);
  // A draft left out on its owner's word is a decision about an email of the run, as a held one's Skip is.
  if (result.data.said && outcome === "not_sent")
    await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
      decision: "skip",
      by: ctx.userId,
    });
  return {
    send_id: send.id,
    said: result.data.said,
    state: result.data.state,
    reason: result.data.reason ?? null,
    since: result.data.since ?? null,
    on_thread: !!result.data.conversation_id,
  };
}

/** Every hold of a run the check could not answer, back to be checked in one call (R18). */
export async function recheckRun(
  ctx: RouteContext,
  broadcastId: string,
): Promise<{ broadcast_id: string; rechecked: number }> {
  const { data, error } = await recheckReachOutRun(ctx.supabase, broadcastId);
  if (error) throw reachOutRefusal(error);
  const r = data as { rechecked?: number } | null;
  return { broadcast_id: broadcastId, rechecked: r?.rechecked ?? 0 };
}

export type SendRow = ReachOutRunSend;

/** The first checked business's email as it reads: the step's words with their values in and its opening written. */
export async function firstEmailOf(
  ctx: RouteContext,
  tenantId: string,
  params: {
    lead: SendRow | undefined;
    step: StepRow | null;
    first: boolean;
    signedBy: string | null;
    signsWith: string | null;
    mailboxes: readonly MailboxConnectionRow[];
  },
): Promise<ReachOutRunDto["first"]> {
  const { lead, step } = params;
  if (!lead || !step?.template_id) return null;
  const [words, business] = await Promise.all([
    findEmailWords(ctx.supabase, tenantId, step.template_id),
    findBusiness(ctx, tenantId),
  ]);
  if (!words) return null;
  const slots = { businessName: business.workspaceName, yourName: params.signedBy, bookingLink: business.bookingLink };
  // A company's addressee fills the person slots (00430), as the send fills them.
  const leadSlots = {
    business_name: lead.lead?.business_name ?? null,
    city: lead.lead?.city ?? null,
    kind: lead.lead?.kind ?? null,
    facts: lead.lead?.facts ?? null,
    source: lead.lead?.source ?? null,
  };
  // The one fill the sender and every preview take (contracts reachOutEmailOf): a first email's subject and its body, or
  // a later step's body alone.
  const email = reachOutEmailOf(
    { subject: params.first ? (words.subject ?? "") : null, body: words.body },
    leadSlots,
    slots,
    lead.opening,
  );
  if (!email.ok) return null;
  // How it ends, as the send ends it (0077, edge request.ts): the name under the words, or the signature of the mailbox
  // it leaves from where the sequence chose it; then the send's foot (30 Oct 2026: "As they read it" ended at the ask).
  const box = params.mailboxes.find((m) => m.id === lead.mailbox_id) ?? null;
  const ending = coldEndingOf({
    signsWith: params.signsWith === "mailbox" ? "mailbox" : "name",
    signedBy: params.signedBy,
    signature: box ? (mailboxSignatureOf(box)?.text ?? null) : null,
    own: business.signature,
    first: params.first,
    body: words.body,
    address: business.address,
  });
  return {
    business_name: lead.lead?.business_name ?? "",
    subject: email.subject,
    body: coldSignedOff(email.body, ending.signOff),
    opening: lead.opening,
    angle: lead.angle,
    signature: ending.signature,
    foot: coldFootOf(business.workspaceName, business.address, lead.lead?.source ?? null),
  };
}

/** The foot a cold email is sent with (contracts emailFoot, the send's own), or none while the business lacks a part. */
function coldFootOf(business: string | null, address: string | null, source: string | null): string | null {
  if (!business?.trim() || !address) return null;
  try {
    return emailFoot(
      business,
      address,
      { kind: "cold", why: whyFrom(source), unsubscribeUrl: null },
      REACH_OUT_LANGUAGE,
    );
  } catch {
    return null;
  }
}
