import "server-only";
import {
  AppError,
  SEQUENCE_TEST_WORDS as W,
  parseParamSpecs,
  parseTenantConfig,
  previewVersionsOf,
  stepTestMail,
} from "@chanlytics/contracts";
import { messageVersionRowsOf, sequenceOverview } from "@chanlytics/db";
import { deployment } from "../env";
import { callEdge, edgeConfigured } from "../edge";
import { log } from "../log";
import { tenantFacts } from "../tenant";
import type { RouteContext } from "../with-route";
import { storedConfigOf } from "../workspace/config-row";
import { stepOfSequence } from "./doors";

/** A test waits this long for the edge to say it went: one mail through the provider, whose own bound is ten seconds. */
const TEST_TIMEOUT_MS = 12_000;

type Sequence = { id: string; tenant_id: string; name: string; starts: string };

/** The business a test names, and the postal address an email's foot gives, as a send reads them. */
async function businessOf(ctx: RouteContext, tenantId: string): Promise<{ name: string; address: string | null }> {
  const [facts, stored] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    storedConfigOf(ctx.supabase, tenantId),
  ]);
  const brain = parseTenantConfig(stored ?? null)?.brain;
  return {
    name: brain?.business_name || facts.name || "your business",
    address: brain?.profile?.address?.trim() || null,
  };
}

/**
 * The test mail of a customer's step: its message read as the step sends it now (its WhatsApp version and its own email
 * and text versions, by the message's name and language), filled for the example person, under the sequence's class.
 * Refused in words where it cannot be shown: a sequence to leads, a step with no message, a version the step goes by
 * and the message lacks.
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
export async function sendStepTest(ctx: RouteContext, seq: Sequence, stepId: string): Promise<{ to: string }> {
  const mail = await mailOf(ctx, seq, stepId);
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
