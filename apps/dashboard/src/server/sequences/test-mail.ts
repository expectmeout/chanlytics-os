import "server-only";
import {
  AppError,
  SEQUENCE_TEST_WORDS as W,
  coldEndingOf,
  chainFirstSender,
  leadStepTestMail,
  parseParamSpecs,
  previewVersionsOf,
  reachOutExampleLead,
  stepTestMail,
} from "@chanlytics/contracts";
import { leadSlotsOf, messageVersionRowsOf, sequenceOverview } from "@chanlytics/db";
import { businessOf, chainsOf } from "../campaigns/reach-outs";
import { deployment } from "../env";
import { callEdge, edgeConfigured } from "../edge";
import { log } from "../log";
import { requireUuid } from "../request-guards";
import type { RouteContext } from "../with-route";
import { stepOfSequence } from "./doors";

/** A test waits this long for the edge to say it went: one mail through the provider, whose own bound is ten seconds. */
const TEST_TIMEOUT_MS = 12_000;

type Sequence = { id: string; tenant_id: string; name: string; starts: string };

/**
 * The test mail of a lead's step (the lead-to-sequence canvas's Preview as a real lead): its words as the chain holds them,
 * filled for one lead in it by the send's own fill, or for an example business where none is named; a later step under
 * the first's subject, as it answers in its thread. Refused in words for a call or a note, and an email with no words yet.
 */
async function leadMailOf(ctx: RouteContext, seq: Sequence, stepId: string, leadId: string | null) {
  const id = requireUuid(stepId, "step");
  const [chains, business, lead] = await Promise.all([
    chainsOf(ctx, seq.tenant_id),
    businessOf(ctx, seq.tenant_id),
    leadId ? leadSlotsOf(ctx.supabase, seq.tenant_id, requireUuid(leadId, "lead")) : Promise.resolve(null),
  ]);
  const chain = chains.find((c) => c.root_id === seq.id);
  const step = chain?.steps.find((s) => s.id === id);
  if (!chain || !step) throw new AppError("not_found", "Step not found.", 404);
  if (step.hand) throw new AppError("validation", W.noMessage, 422);
  if (leadId && !lead) throw new AppError("not_found", "Lead not found.", 404);
  const mail = leadStepTestMail({
    sequence: seq.name,
    place: step.n + 1,
    business: business.name,
    address: business.address,
    words: { subject: step.n === 0 ? (step.subject ?? "") : null, body: step.body },
    thread: chain.steps.find((s) => s.n === 0)?.subject ?? null,
    lead: lead ?? reachOutExampleLead(),
    workspace: { businessName: business.name, yourName: chain.signed_by, bookingLink: business.bookingLink },
    // How it ends, as the send ends it (0077): from the first mailbox the sequence writes from.
    ending: coldEndingOf({
      signsWith: chain.signs_with ?? "name",
      signedBy: chain.signed_by,
      signature: chainFirstSender(chain)?.signature?.words ?? null,
      first: step.n === 0,
      body: step.body,
      address: business.address,
    }),
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
    messageVersionRowsOf(ctx.supabase, seq.tenant_id, { id: step.template_id }),
    sequenceOverview(ctx.supabase, seq.tenant_id, seq.id),
    businessOf(ctx, seq.tenant_id),
  ]);
  const own = rows.find((r) => r.id === step.template_id) ?? rows[0];
  if (!own) throw new AppError("validation", W.noMessage, 422);
  const whatsapp = rows.find((r) => r.channel === "whatsapp") ?? null;
  const mail = stepTestMail({
    sequence: seq.name,
    place: step.place,
    business: business.name,
    address: business.address,
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
  const r = await callEdge(
    "/api/admin/email/test-to-self",
    { tenant_id: seq.tenant_id, user_id: ctx.userId, subject: mail.subject, text: mail.text },
    { workspace: seq.tenant_id, user: ctx.userId, timeoutMs: TEST_TIMEOUT_MS },
  );
  const body = (r.body ?? {}) as { sent?: unknown; to?: unknown; why?: unknown };
  if (r.status === 200 && body.sent === true && typeof body.to === "string") return { to: body.to };
  if (r.status === 200 && body.why === "no_address") throw new AppError("conflict", W.noAddress, 409);
  log.error("step_test_failed", { tenant_id: seq.tenant_id, status: r.status, error: r.body?.error });
  throw new AppError("upstream_email", W.notSent, 502);
}
