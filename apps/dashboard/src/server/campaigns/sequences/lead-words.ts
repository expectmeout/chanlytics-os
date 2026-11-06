import "server-only";
/**
 * A lead's own words at one step (decision 0096): judged by the rules a step's own are held to, then saved through the
 * door (00545 sequence_lead_words_set), on the member's session, or put back with none. What it leaves standing is marked
 * as the check and the sender mark it (channels checkedWordsOf), so a checked email goes with these words without being
 * checked again, and a held one stays held. The event says who and for whom, never the words.
 */
import { checkedWordsOf } from "@chanlytics/channels";
import { AppError, leadWordsProblem, wordsNeedOpening, type LeadEmailText } from "@chanlytics/contracts";
import { emailWordsOf, emitEvent, leadSlotsOf, setLeadWords, type LeadWordsAnswer } from "@chanlytics/db";
import { businessOf, chainsOf, reachOutRefusal } from "../reach-outs";
import { requireUuid } from "../../shared/request-guards";
import { serviceDb } from "../../shared/service-db";
import type { RouteContext } from "../../shared/with-route";
import { stepOfSequence } from "./doors";

type Sequence = { id: string; tenant_id: string };

export async function saveLeadWords(
  ctx: RouteContext,
  seq: Sequence,
  stepId: string,
  input: { lead_id: string; words: LeadEmailText | null },
): Promise<LeadWordsAnswer> {
  const leadId = requireUuid(input.lead_id, "lead");
  const [step, chains, business, lead] = await Promise.all([
    stepOfSequence(ctx, seq, stepId),
    chainsOf(ctx, seq.tenant_id),
    businessOf(ctx, seq.tenant_id),
    leadSlotsOf(ctx.supabase, seq.tenant_id, leadId),
  ]);
  const chain = chains.find((c) => c.root_id === seq.id);
  const at = chain?.steps.find((s) => s.id === step.id);
  if (!chain || !at || at.hand || !step.template_id)
    throw new AppError("validation", "Only an email takes words.", 422);
  if (!lead) throw new AppError("not_found", "Lead not found.", 404);
  const first = at.n === 0;
  // A step after the first answers the one before: whatever came with it, it keeps no subject.
  const words = input.words ? { subject: first ? input.words.subject : null, body: input.words.body } : null;
  const workspace = { businessName: business.name, yourName: chain.signed_by, bookingLink: business.bookingLink };
  if (words) {
    const problem = leadWordsProblem({ words, first, lead, workspace });
    if (problem) throw new AppError("validation", problem, 422);
  }
  const standing = words ?? (await emailWordsOf(ctx.supabase, seq.tenant_id, step.template_id));
  if (!standing) throw new AppError("validation", "Only an email takes words.", 422);
  const r = await setLeadWords(ctx.supabase, {
    stepId: step.id,
    leadId,
    words,
    checkedWords: checkedWordsOf(standing, chain.signed_by, business.bookingLink !== null),
    needsLine: wordsNeedOpening(standing),
  });
  if (r.error) throw reachOutRefusal(r.error);
  await emitEvent(serviceDb(), seq.tenant_id, "reach_out.lead_words_changed", "lead", leadId, {
    step_id: step.id,
    kept: words !== null,
    by: ctx.userId,
  });
  return r.data;
}
