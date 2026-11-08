import "server-only";
import {
  AppError,
  SEQUENCE_TEST_WORDS as W,
  chainFirstSender,
  leadOpeningOf,
  leadOwnWordsOf,
  leadStepTestMail,
  parseParamSpecs,
  previewVersionsOf,
  reachOutExampleLead,
  stepTestMail,
} from "@chanlytics/contracts";
import {
  findLeadSlots,
  findLeadStepOpening,
  listLeadWords,
  listMessageVersionRows,
  listSequenceOverview,
} from "@chanlytics/db/campaigns";
import { findBusiness } from "../reach-outs/chain-acts";
import { listChains } from "../reach-outs/reach-outs";
import { deployment } from "../../shared/env";
import { callEdge, edgeConfigured } from "../../shared/edge";
import { log } from "../../shared/log";
import { requireUuid } from "../../shared/request-guards";
import type { RouteContext } from "../../shared/with-route";
import { stepOfSequence } from "./doors";

/** A test waits this long for the edge to say it went: one mail through the provider, whose own bound is ten seconds. */
const TEST_TIMEOUT_MS = 12_000;

type Sequence = { id: string; tenant_id: string; name: string; starts: string };

/**
 * The test mail of a lead's step (the lead-to-sequence canvas's Preview as a real lead): its words as the chain holds them,
 * filled for one lead in it by the send's own fill with the opening their email goes with (the one written for it, else
 * the one their listing says), or for an example business where none is named; a later step under the first's subject,
 * as it answers in its thread. A lead with words of their own (decision 0096) is tested with those, as the send sends
 * them. Refused in words for a call or a note, and an email with no words yet.
 */
async function leadMailOf(ctx: RouteContext, seq: Sequence, stepId: string, leadId: string | null) {
  const id = requireUuid(stepId, "step");
  const lid = leadId ? requireUuid(leadId, "lead") : null;
  const [chains, business, lead, opened, typed] = await Promise.all([
    listChains(ctx, seq.tenant_id),
    findBusiness(ctx, seq.tenant_id),
    lid ? findLeadSlots(ctx.supabase, seq.tenant_id, lid) : Promise.resolve(null),
    lid
      ? findLeadStepOpening(ctx.supabase, { tenantId: seq.tenant_id, stepId: id, leadId: lid })
      : Promise.resolve(null),
    lid ? listLeadWords(ctx.supabase, seq.tenant_id, lid) : Promise.resolve([]),
  ]);
  const chain = chains.find((c) => c.root_id === seq.id);
  const step = chain?.steps.find((s) => s.id === id);
  if (!chain || !step) throw new AppError("not_found", "Step not found.", 404);
  if (step.hand) throw new AppError("validation", W.noMessage, 422);
  if (leadId && !lead) throw new AppError("not_found", "Lead not found.", 404);
  const own = leadOwnWordsOf(typed);
  const firstStep = chain.steps.find((s) => s.n === 0);
  const words = own.get(step.id) ?? { subject: step.n === 0 ? (step.subject ?? "") : null, body: step.body };
  const mail = leadStepTestMail({
    sequence: seq.name,
    place: step.n + 1,
    business: business.name,
    address: business.address,
    words,
    thread: (firstStep ? own.get(firstStep.id)?.subject : null) ?? firstStep?.subject ?? null,
    lead: lead ?? reachOutExampleLead(),
    example: !lead,
    opening: opened ? leadOpeningOf(opened.written, opened.listing) : null,
    workspace: { businessName: business.name, yourName: chain.signed_by, bookingLink: business.bookingLink },
    // How it ends, as the send ends it (0077): the signature of the first mailbox the sequence writes from.
    signsWith: chain.signs_with,
    signature: chainFirstSender(chain)?.signature?.words ?? null,
    own: business.signature,
  });
  if ("why" in mail) throw new AppError("validation", mail.why, 422);
  return mail;
}

/**
 * The test mail of a customer's step: its message read as the step sends it now (its WhatsApp version and its own email
 * and text versions, by the message's name and language), filled for the example person, under the sequence's class.
 * Refused in words where it cannot be shown: a one-off (tested from Messages), a step with no message, a version the step
 * goes by and the message lacks.
 */
async function mailOf(ctx: RouteContext, seq: Sequence, stepId: string) {
  if (seq.starts !== "moment" && seq.starts !== "list") throw new AppError("validation", W.notCustomer, 422);
  const step = await stepOfSequence(ctx, seq, stepId);
  if (!step.template_id) throw new AppError("validation", W.noMessage, 422);
  const [rows, overview, business] = await Promise.all([
    listMessageVersionRows(ctx.supabase, seq.tenant_id, { id: step.template_id }),
    listSequenceOverview(ctx.supabase, seq.tenant_id, seq.id),
    findBusiness(ctx, seq.tenant_id),
  ]);
  const own = rows.find((r) => r.id === step.template_id) ?? rows[0];
  if (!own) throw new AppError("validation", W.noMessage, 422);
  const whatsapp = rows.find((r) => r.channel === "whatsapp") ?? null;
  const mail = stepTestMail({
    sequence: seq.name,
    place: step.place,
    business: business.name,
    address: business.address,
    bookingLink: business.bookingLink,
    channels: step.channels,
    params: parseParamSpecs(step.params),
    policyClass: overview[0]?.first?.policy_class ?? "",
    message: {
      whatsapp: whatsapp ? { body: whatsapp.body_preview, components: whatsapp.components } : null,
      versions: previewVersionsOf(rows, own.name, own.language),
      language: own.language,
      category: whatsapp?.category ?? own.category,
    },
  });
  if ("missing" in mail) throw new AppError("validation", mail.why, 422);
  return mail;
}

/**
 * POST sequences/:id/steps/:step/test: Send me a test. The step's message, filled for an example person, is mailed by the
 * edge to the member who pressed it at their own sign-in address (api/admin/email/test-to-self.ts), and to nobody else:
 * no customer's send door, nothing kept. Only where providers are live: a preview or a laptop mails nobody, and says so.
 * The edge refusing, or not answering, is "not sent", never a guess that it went.
 */
export async function sendStepTest(
  ctx: RouteContext,
  seq: Sequence,
  stepId: string,
  leadId: string | null = null,
): Promise<{ to: string }> {
  const mail = seq.starts === "leads" ? await leadMailOf(ctx, seq, stepId, leadId) : await mailOf(ctx, seq, stepId);
  if (!deployment.providersLive || !edgeConfigured()) throw new AppError("conflict", W.notLive, 409);
  const answer = await callEdge(
    "/api/admin/email/test-to-self",
    { tenant_id: seq.tenant_id, user_id: ctx.userId, subject: mail.subject, text: mail.text },
    { workspace: seq.tenant_id, user: ctx.userId, timeoutMs: TEST_TIMEOUT_MS },
  );
  const body = answer.body ?? {};
  if (answer.status === 200 && body.sent === true && typeof body.to === "string") return { to: body.to };
  if (answer.status === 200 && body.why === "no_address") throw new AppError("conflict", W.noAddress, 409);
  log.error("step_test_failed", { tenant_id: seq.tenant_id, status: answer.status, error: answer.body?.error });
  throw new AppError("upstream_email", W.notSent, 502);
}
