/** Template: draft. */

import "server-only";
import { z } from "zod";
import {
  languageLabel,
  MIN_MS,
  MODEL_ROUTES,
  parseTenantConfig,
  TEMPLATE_BODY_MAX,
  TEMPLATE_FOOTER_MAX,
  TEMPLATE_LABEL_MAX,
  templateLanguage,
  thinkingOffOf,
  validateTemplateDraft,
  type TemplateCategoryChoice,
  type TemplateDraft,
} from "@chanlytics/contracts";
import { reviewLinkOf } from "@chanlytics/db/campaigns";
import type { RouteContext } from "@/server/shared/with-route";
import { getTenantFacts } from "@/server/shared/tenant";
import { getStoredConfig } from "@/server/workspace/config-row";
import { workspaceFacts, type WorkspaceFacts } from "@/server/ask/prompt/stable-system";
import { runRound } from "@/server/ask/round";
import { GatewayRefused } from "@/server/shared/model/gateway";
import { log } from "@/server/shared/log";
import type { TenantId } from "@chanlytics/contracts";

/**
 * A template drafted with the assistant.
 *
 * The person says what they want to tell customers; the model writes it in
 * the business's own voice, inside WhatsApp's rules, and returns the fields
 * the composer shows — never a submission. The same validator the submit
 * route uses checks the draft, so a draft that would be refused is fixed
 * before the person ever sees it.
 */
export const DRAFT_MODEL = MODEL_ROUTES.template_draft.model;

/**
 * The drafter's thinking, off: a model that thinks by default spends it inside the 900 tokens and can run out before
 * the draft (the 30 Oct 2026 replay: 3 drafts in 12, "not well-formed"). Named in the request, since the drafter asks as
 * Ask's round; a fallback that does not take it is sent none (channels ai/anthropic.ts).
 */
const DRAFT_THINKING = thinkingOffOf(DRAFT_MODEL);

/** How long a template draft or translation may take: the edge's model door stops at a minute (vercel.json). */
const DRAFT_TIMEOUT_MS = MIN_MS;

const DRAFT_BRIEF_MAX = 600;

const DraftSchema = z.object({
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(TEMPLATE_BODY_MAX),
  footer: z.string().max(TEMPLATE_FOOTER_MAX).nullable().optional(),
  examples: z.array(z.string().min(1).max(100)).max(10).default([]),
  variables: z
    .array(
      z.object({
        position: z.number().int().min(1).max(10),
        label: z.string().max(TEMPLATE_LABEL_MAX),
        source: z.enum(["text", "first_name", "business_name", "booking_link", "review_link"]),
      }),
    )
    .max(10)
    .default([]),
});

export type DraftedTemplate = z.infer<typeof DraftSchema> & {
  warnings: string[];
  category: TemplateCategoryChoice;
  language: string;
};

/**
 * The language to write in, as the model should read it: "Portuguese (Brazil)",
 * with the place's own words asked for. It was English, Spanish or Portuguese
 * and nothing else -- a French draft came back in English.
 */
export function writeIn(language: string): string {
  const l = templateLanguage(language);
  if (!l) return `Write in ${languageLabel(language)}.`;
  return l.region ? `Write in ${l.label}: the words and spelling people use in ${l.region}.` : `Write in ${l.label}.`;
}

export function draftSystemPrompt(
  workspaceFacts: WorkspaceFacts,
  category: TemplateCategoryChoice,
  language: string,
): string {
  const services = workspaceFacts.services
    .slice(0, 12)
    .map((s) => s.name)
    .join(", ");
  return [
    `You write WhatsApp message templates for ${workspaceFacts.businessName}, a small business, in its own voice: warm, brief, specific, never salesy.`,
    services ? `Its services: ${services}.` : "",
    workspaceFacts.guardrails.length ? `Rules the business follows: ${workspaceFacts.guardrails.join(" ")}` : "",
    writeIn(language),
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
    "Slots and their sources. Use {{1}} for the customer's first name when a greeting fits (source first_name). Use a slot with source business_name for the business's name, booking_link for its booking link, and review_link, labelled “Review link”, for the link where a customer leaves it a review on Google, when the message needs them. Any other slot is typed text (source text) with a sensible label.",
    "",
    "Answer with one JSON object and nothing else, no code fence:",
    '{"name": "short_snake_case_name", "body": "the message with {{1}} slots", "footer": "optional footer or null", "examples": ["one example per slot"], "variables": [{"position": 1, "label": "First name", "source": "first_name"}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

export function extractJson(text: string): unknown {
  const items = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(items);
  } catch {
    /* fall through */
  }
  const start = items.indexOf("{");
  const end = items.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(items.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

export type DraftOutcome =
  { ok: true; draft: DraftedTemplate } | { ok: false; reason: "refused" | "malformed" | "invalid"; message: string };

type Refused = { ok: false; reason: "refused"; message: string };

/** The workspace as the model is told it: its name, services and rules, and its booking link. */
export async function workspaceFor(
  ctx: RouteContext,
  tenantId: TenantId,
): Promise<{ facts: WorkspaceFacts; bookingLink: string | null }> {
  // A configuration that could not be read is none, as it always was: the model is told the name and the zone.
  const [{ name, timezone }, config] = await Promise.all([
    getTenantFacts(ctx.supabase, tenantId),
    getStoredConfig(ctx.supabase, tenantId).catch(() => null),
  ]);
  const parsed = parseTenantConfig(config);
  return {
    // The request's clock: the facts are true now (a note says what it is told today; these prompts name no note).
    facts: workspaceFacts(name, timezone, config, new Date()),
    bookingLink: parsed?.brain?.booking_link ?? null,
  };
}

/**
 * Whether a draft may hold a review_link slot, in the model's words: only where the Google listing keeps a link (db
 * reviewLinkOf), which the send fills it from and refuses without. A link that could not be read is none here: the
 * draft then leaves the slot out, which costs nothing.
 */
async function reviewLinkRule(ctx: RouteContext, tenantId: TenantId): Promise<string> {
  const link = await reviewLinkOf(ctx.supabase, tenantId).catch(() => null);
  return link
    ? "\nThe business's Google listing keeps a review link, so a review_link slot may be used."
    : "\nThe business has no Google review link on file: do not use a review_link slot.";
}

/**
 * One turn with the assistant, counted against the workspace's budget like any
 * other: the text it answered, and what came back around it, so a malformed
 * answer is a diagnosis and not a guess. A refusal is said in the owner's words.
 */
export async function askOnce(
  ctx: RouteContext,
  tenantId: TenantId,
  system: string,
  user: string,
  kind: "draft" | "translation",
): Promise<
  { ok: true; text: string; blockTypes: string[]; stopReason: string | null; streamError: string | null } | Refused
> {
  try {
    const item = await runRound(
      {
        tenantId,
        userId: ctx.userId,
        request: {
          model: DRAFT_MODEL,
          max_tokens: 900,
          system,
          messages: [{ role: "user", content: user }],
          ...(DRAFT_THINKING ? { thinking: DRAFT_THINKING } : {}),
        },
        // Bounded as every call to the edge is: its own door stops at a minute (vercel.json).
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      },
      () => {},
      () => {},
    );
    const text = item.blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (item.streamError && !text)
      return { ok: false, reason: "refused", message: `The ${kind} could not be written right now. Try again.` };
    return {
      ok: true,
      text,
      blockTypes: item.blocks.map((b) => b.type),
      stopReason: item.stopReason,
      streamError: item.streamError,
    };
  } catch (e) {
    if (e instanceof GatewayRefused)
      return {
        ok: false,
        reason: "refused",
        message: "The assistant is not available right now. Try again in a moment.",
      };
    throw e;
  }
}

export async function draftTemplate(
  ctx: RouteContext,
  tenantId: TenantId,
  input: { brief: string; category: TemplateCategoryChoice; language: string },
): Promise<DraftOutcome> {
  const brief = input.brief.trim().slice(0, DRAFT_BRIEF_MAX);
  const [{ facts, bookingLink }, reviewRule] = await Promise.all([
    workspaceFor(ctx, tenantId),
    reviewLinkRule(ctx, tenantId),
  ]);
  const system =
    draftSystemPrompt(facts, input.category, input.language) +
    (bookingLink
      ? "\nThe business has a booking link, so a booking_link slot may be used."
      : "\nThe business has no booking link on file: do not use a booking_link slot.") +
    reviewRule;

  const turn = await askOnce(ctx, tenantId, system, `Brief: ${brief}`, "draft");
  if (!turn.ok) return turn;
  const { text, blockTypes, stopReason, streamError } = turn;
  const json = extractJson(text);
  const parsed = DraftSchema.safeParse(json);
  if (!parsed.success) {
    // What actually came back, so a malformed draft is a diagnosis and not a guess.
    log.error("draft_malformed", {
      tenant_id: tenantId,
      blocks: blockTypes,
      stop: stopReason,
      stream_error: streamError,
      output: text.slice(0, 400),
      issues: json ? parsed.error.issues.slice(0, 3) : "no json",
    });
    return {
      ok: false,
      reason: "malformed",
      message: "The draft did not come out well-formed. Try again, or write it by hand.",
    };
  }
  const check = validateTemplateDraft({
    name: parsed.data.name,
    language: input.language,
    category: input.category,
    body: parsed.data.body,
    footer: parsed.data.footer ?? null,
    examples: parsed.data.examples,
  });
  if (!check.ok)
    return {
      ok: false,
      reason: "invalid",
      message: `The draft broke a WhatsApp rule (${check.error}). Try again, or write it by hand.`,
    };
  const templateDraft: TemplateDraft = check.value;
  return {
    ok: true,
    draft: {
      name: templateDraft.name,
      body: templateDraft.body,
      footer: templateDraft.footer,
      examples: templateDraft.examples,
      variables: parsed.data.variables.filter((x) => x.position <= templateDraft.examples.length),
      warnings: check.warnings,
      category: input.category,
      language: input.language,
    },
  };
}
