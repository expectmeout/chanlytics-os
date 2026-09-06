import "server-only";
import { z } from "zod";
import {
  TEMPLATE_BODY_MAX,
  TEMPLATE_FOOTER_MAX,
  parseTenantConfig,
  validateTemplateDraft,
  type TemplateCategoryChoice,
  type TemplateDraft,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { tenantFacts } from "@/server/tenant";
import { workspaceFacts, type WorkspaceFacts } from "@/server/ask/prompt";
import { runRound } from "@/server/ask/round";
import { GatewayRefused } from "@/server/ask/gateway";

/**
 * A template drafted with the assistant.
 *
 * The person says what they want to tell customers; the model writes it in
 * the business's own voice, inside WhatsApp's rules, and returns the fields
 * the composer shows — never a submission. The same validator the submit
 * route uses checks the draft, so a draft that would be refused is fixed
 * before the person ever sees it.
 */
export const DRAFT_MODEL = "claude-sonnet-5";
const DRAFT_BRIEF_MAX = 600;

const DraftSchema = z.object({
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(TEMPLATE_BODY_MAX),
  footer: z.string().max(TEMPLATE_FOOTER_MAX).nullable().optional(),
  examples: z.array(z.string().min(1).max(100)).max(10).default([]),
  variables: z.array(z.object({ position: z.number().int().min(1).max(10), label: z.string().max(40), source: z.enum(["text", "first_name", "business_name", "booking_link"]) })).max(10).default([]),
});
export type DraftedTemplate = z.infer<typeof DraftSchema> & { warnings: string[]; category: TemplateCategoryChoice; language: string };

export function draftSystemPrompt(f: WorkspaceFacts, category: TemplateCategoryChoice, language: string): string {
  const lang = language.startsWith("es") ? "Spanish" : language.startsWith("pt") ? "Portuguese" : "English";
  const services = f.services.slice(0, 12).map((s) => s.name).join(", ");
  return [
    `You write WhatsApp message templates for ${f.businessName}, a small business, in its own voice: warm, brief, specific, never salesy.`,
    services ? `Its services: ${services}.` : "",
    f.guardrails.length ? `Rules the business follows: ${f.guardrails.join(" ")}` : "",
    `Write in ${lang}.`,
    "",
    "WhatsApp's rules for a template, which reviewers enforce:",
    "- Values go in numbered slots written exactly {{1}}, {{2}}, {{3}}, in order, with no gaps. Do not start or end the message with a slot.",
    "- Give one realistic example per slot, in order.",
    `- The message is under ${TEMPLATE_BODY_MAX} characters; an optional footer under ${TEMPLATE_FOOTER_MAX}. No emoji spam, no ALL CAPS, no more than one blank line in a row.`,
    category === "marketing"
      ? "- This is a MARKETING template: an offer, news or an invitation. The footer must say how to opt out: “Reply STOP to opt out” (or its equivalent in the language)."
      : "- This is a UTILITY template: a notice about the customer's own booking or account, with no promotional words at all.",
    "- Never quote or promise a price unless the brief states the exact words; never promise an appointment.",
    "",
    "Slots and their sources. Use {{1}} for the customer's first name when a greeting fits (source first_name). Use a slot with source business_name for the business's name, and booking_link for its booking link, when the message needs them. Any other slot is typed text (source text) with a sensible label.",
    "",
    "Answer with one JSON object and nothing else, no code fence:",
    '{"name": "short_snake_case_name", "body": "the message with {{1}} slots", "footer": "optional footer or null", "examples": ["one example per slot"], "variables": [{"position": 1, "label": "First name", "source": "first_name"}]}',
  ].filter(Boolean).join("\n");
}

function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

export type DraftOutcome = { ok: true; draft: DraftedTemplate } | { ok: false; reason: "refused" | "malformed" | "invalid"; message: string };

export async function draftTemplate(
  ctx: RouteContext,
  tenantId: string,
  input: { brief: string; category: TemplateCategoryChoice; language: string },
): Promise<DraftOutcome> {
  const brief = input.brief.trim().slice(0, DRAFT_BRIEF_MAX);
  const [{ name, timezone }, cfgRow] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const facts = workspaceFacts(name, timezone, cfgRow.data?.config ?? null);
  const parsed = parseTenantConfig(cfgRow.data?.config ?? null);
  const bookingLink = parsed?.brain?.booking_link ?? null;
  const system = draftSystemPrompt(facts, input.category, input.language) + (bookingLink ? "\nThe business has a booking link, so a booking_link slot may be used." : "\nThe business has no booking link on file: do not use a booking_link slot.");

  let text = "";
  try {
    const r = await runRound(
      {
        tenantId,
        userId: ctx.userId,
        request: {
          model: DRAFT_MODEL,
          max_tokens: 700,
          system,
          messages: [{ role: "user", content: `Brief: ${brief}` }],
        },
      },
      () => {},
    );
    text = r.blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    if (r.streamError && !text) return { ok: false, reason: "refused", message: "The draft could not be written right now. Try again." };
  } catch (e) {
    if (e instanceof GatewayRefused) return { ok: false, reason: "refused", message: "The assistant is not available right now. Try again in a moment." };
    throw e;
  }
  const json = extractJson(text);
  const d = DraftSchema.safeParse(json);
  if (!d.success) return { ok: false, reason: "malformed", message: "The draft did not come out well-formed. Try again, or write it by hand." };
  const check = validateTemplateDraft({ name: d.data.name, language: input.language, category: input.category, body: d.data.body, footer: d.data.footer ?? null, examples: d.data.examples });
  if (!check.ok) return { ok: false, reason: "invalid", message: `The draft broke a WhatsApp rule (${check.error}). Try again, or write it by hand.` };
  const v: TemplateDraft = check.value;
  return {
    ok: true,
    draft: {
      name: v.name,
      body: v.body,
      footer: v.footer,
      examples: v.examples,
      variables: d.data.variables.filter((x) => x.position <= v.examples.length),
      warnings: check.warnings,
      category: input.category,
      language: input.language,
    },
  };
}
