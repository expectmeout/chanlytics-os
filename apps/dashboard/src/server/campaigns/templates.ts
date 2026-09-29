import "server-only";
import { z } from "zod";
import {
  TEMPLATE_BODY_MAX,
  TEMPLATE_BUTTON_TEXT_MAX,
  TEMPLATE_FOOTER_MAX,
  defaultSlotKinds,
  languageLabel,
  parseTenantConfig,
  placeholdersOf,
  slotLabels,
  starterByKey,
  starterByName,
  starterText,
  templateBlocked,
  templateLanguage,
  templateLinkButton,
  templateParts,
  templateUntranslatable,
  validateTemplateDraft,
  MIN_MS,
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
        label: z.string().max(40),
        source: z.enum(["text", "first_name", "business_name", "booking_link"]),
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
function writeIn(language: string): string {
  const l = templateLanguage(language);
  if (!l) return `Write in ${languageLabel(language)}.`;
  return l.region ? `Write in ${l.label}: the words and spelling people use in ${l.region}.` : `Write in ${l.label}.`;
}

export function draftSystemPrompt(f: WorkspaceFacts, category: TemplateCategoryChoice, language: string): string {
  const services = f.services
    .slice(0, 12)
    .map((s) => s.name)
    .join(", ");
  return [
    `You write WhatsApp message templates for ${f.businessName}, a small business, in its own voice: warm, brief, specific, never salesy.`,
    services ? `Its services: ${services}.` : "",
    f.guardrails.length ? `Rules the business follows: ${f.guardrails.join(" ")}` : "",
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
    "Slots and their sources. Use {{1}} for the customer's first name when a greeting fits (source first_name). Use a slot with source business_name for the business's name, and booking_link for its booking link, when the message needs them. Any other slot is typed text (source text) with a sensible label.",
    "",
    "Answer with one JSON object and nothing else, no code fence:",
    '{"name": "short_snake_case_name", "body": "the message with {{1}} slots", "footer": "optional footer or null", "examples": ["one example per slot"], "variables": [{"position": 1, "label": "First name", "source": "first_name"}]}',
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
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
async function workspaceFor(
  ctx: RouteContext,
  tenantId: string,
): Promise<{ facts: WorkspaceFacts; bookingLink: string | null }> {
  const [{ name, timezone }, cfgRow] = await Promise.all([
    tenantFacts(ctx.supabase, tenantId),
    ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const parsed = parseTenantConfig(cfgRow.data?.config ?? null);
  return {
    facts: workspaceFacts(name, timezone, cfgRow.data?.config ?? null),
    bookingLink: parsed?.brain?.booking_link ?? null,
  };
}

/**
 * One turn with the assistant, counted against the workspace's budget like any
 * other: the text it answered, and what came back around it, so a malformed
 * answer is a diagnosis and not a guess. A refusal is said in the owner's words.
 */
async function askOnce(
  ctx: RouteContext,
  tenantId: string,
  system: string,
  user: string,
  what: "draft" | "translation",
): Promise<
  { ok: true; text: string; blockTypes: string[]; stopReason: string | null; streamError: string | null } | Refused
> {
  try {
    const r = await runRound(
      {
        tenantId,
        userId: ctx.userId,
        request: {
          model: DRAFT_MODEL,
          max_tokens: 900,
          system,
          messages: [{ role: "user", content: user }],
        },
        // Bounded as every call to the edge is: its own door stops at a minute (vercel.json).
        signal: AbortSignal.timeout(DRAFT_TIMEOUT_MS),
      },
      () => {},
    );
    const text = r.blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (r.streamError && !text)
      return { ok: false, reason: "refused", message: `The ${what} could not be written right now. Try again.` };
    return {
      ok: true,
      text,
      blockTypes: r.blocks.map((b) => b.type),
      stopReason: r.stopReason,
      streamError: r.streamError,
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
  tenantId: string,
  input: { brief: string; category: TemplateCategoryChoice; language: string },
): Promise<DraftOutcome> {
  const brief = input.brief.trim().slice(0, DRAFT_BRIEF_MAX);
  const { facts, bookingLink } = await workspaceFor(ctx, tenantId);
  const system =
    draftSystemPrompt(facts, input.category, input.language) +
    (bookingLink
      ? "\nThe business has a booking link, so a booking_link slot may be used."
      : "\nThe business has no booking link on file: do not use a booking_link slot.");

  const turn = await askOnce(ctx, tenantId, system, `Brief: ${brief}`, "draft");
  if (!turn.ok) return turn;
  const { text, blockTypes, stopReason, streamError } = turn;
  const json = extractJson(text);
  const d = DraftSchema.safeParse(json);
  if (!d.success) {
    // What actually came back, so a malformed draft is a diagnosis and not a guess.
    console.error(
      "draft_malformed",
      JSON.stringify({
        tenant_id: tenantId,
        blocks: blockTypes,
        stop: stopReason,
        stream_error: streamError,
        text: text.slice(0, 400),
        issues: json ? d.error.issues.slice(0, 3) : "no json",
      }),
    );
    return {
      ok: false,
      reason: "malformed",
      message: "The draft did not come out well-formed. Try again, or write it by hand.",
    };
  }
  const check = validateTemplateDraft({
    name: d.data.name,
    language: input.language,
    category: input.category,
    body: d.data.body,
    footer: d.data.footer ?? null,
    examples: d.data.examples,
  });
  if (!check.ok)
    return {
      ok: false,
      reason: "invalid",
      message: `The draft broke a WhatsApp rule (${check.error}). Try again, or write it by hand.`,
    };
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

/* ---------------------------- in another language ---------------------------- */

/**
 * What a template is written from when it is written again in another
 * language: the message, its footer and button, and each slot with what it is
 * and the example WhatsApp's reviewers read. `kinds` says what fills each slot,
 * because a first name, the business's name and a link are the same words in
 * every language -- only the rest is translated.
 */
export interface TranslateSource {
  name: string;
  category: TemplateCategoryChoice;
  language: string;
  body: string;
  footer: string | null;
  examples: string[];
  labels: string[];
  kinds: string[];
  button: { text: string; url: string } | null;
}

/** A row on file, by id; or a starter's own words from the library, in the language they are written in. */
export type SourceRef = { id: string } | { starter: string; from?: string | null };

export type SourceOutcome =
  { ok: true; source: TranslateSource } | { ok: false; code: "not_found" | "conflict" | "validation"; message: string };

/** Meta files a category in capitals, a template made here in lower case: either is the one choice. */
const categoryOf = (c: unknown): TemplateCategoryChoice | null =>
  /^marketing$/i.test(String(c ?? "")) ? "marketing" : /^utility$/i.test(String(c ?? "")) ? "utility" : null;

/**
 * What a template is written from, and whether it may be written in `language`
 * at all: a row on file that Chanlytics can carry whole (templateUntranslatable),
 * or a starter's words from the library. Never a language the message already
 * has, and never a language the library has written already -- that one is
 * added as it is, not translated. Refused here, before the assistant is paid for.
 */
export async function translationSource(
  ctx: RouteContext,
  tenantId: string,
  ref: SourceRef,
  language: string,
): Promise<SourceOutcome> {
  let source: TranslateSource;
  if ("starter" in ref) {
    const s = starterByKey(ref.starter);
    if (!s) return { ok: false, code: "not_found", message: "That starter is not in the library." };
    if (s.texts[language])
      return {
        ok: false,
        code: "validation",
        message: `The starter set has it written in ${languageLabel(language)} already: add it as it is.`,
      };
    const from = ref.from && s.texts[ref.from] ? ref.from : "en_US";
    const t = starterText(s, from);
    source = {
      name: s.name,
      category: s.category,
      language: from,
      body: t.body,
      footer: t.footer,
      examples: t.slots.map((x) => x.example),
      labels: t.slots.map((x) => x.label),
      kinds: t.slots.map((x) => x.kind),
      button: null,
    };
  } else {
    const { data, error } = await ctx.supabase
      .from("templates")
      .select("id, name, language, category, body_preview, variables, components")
      .eq("tenant_id", tenantId)
      .eq("id", ref.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, code: "not_found", message: "That template is not on file here." };
    const parts = templateParts(data.components);
    const why = templateUntranslatable({
      ...parts,
      blocked: templateBlocked({ components: data.components }),
      category: data.category,
    });
    const category = categoryOf(data.category);
    if (why || !category)
      return {
        ok: false,
        code: "validation",
        message: `Chanlytics can't write this one in another language: ${why ?? "WhatsApp gave it no category"}. Add its other languages in WhatsApp Manager.`,
      };
    const body = String(data.body_preview ?? "");
    if (!body.trim())
      return {
        ok: false,
        code: "validation",
        message: "Its words are not on file here yet. Check WhatsApp for changes, then write it in another language.",
      };
    // One entry per slot, by its number: the variables as the sync or the create
    // path filed them, a starter's library words where a row kept no example.
    const vars = (Array.isArray(data.variables) ? data.variables : []) as Array<{
      position?: unknown;
      example?: unknown;
    } | null>;
    const row = { name: data.name, language: data.language, variables: data.variables };
    const labels = slotLabels(row);
    const kinds = defaultSlotKinds(row);
    const lib = starterByName(data.name);
    const libExamples = lib ? starterText(lib, data.language).slots.map((x) => x.example) : [];
    const slots = placeholdersOf(body).map((_, i) => {
      const found = vars.findIndex((v) => v?.position === i + 1);
      const k = found >= 0 ? found : i;
      const given = vars[k]?.example;
      const example = typeof given === "string" && given.trim() ? given.trim() : (libExamples[i] ?? "");
      return { example, label: labels[k] ?? `Value ${i + 1}`, kind: kinds[k] ?? "text" };
    });
    source = {
      name: data.name,
      category,
      language: data.language,
      body,
      footer: parts.footer,
      examples: slots.map((x) => x.example),
      labels: slots.map((x) => x.label),
      kinds: slots.map((x) => x.kind),
      button: templateLinkButton(data.components),
    };
  }
  if (source.language === language)
    return { ok: false, code: "conflict", message: `It is written in ${languageLabel(language)} already.` };
  const { data: have, error: hErr } = await ctx.supabase
    .from("templates")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .eq("name", source.name)
    .eq("language", language)
    .maybeSingle();
  if (hErr) throw new Error(hErr.message);
  if (have) return { ok: false, code: "conflict", message: `It is on file in ${languageLabel(language)} already.` };
  return { ok: true, source };
}

export function translateSystemPrompt(f: WorkspaceFacts, src: TranslateSource, language: string): string {
  const to = templateLanguage(language);
  const into = to ? to.label : languageLabel(language);
  return [
    `You translate WhatsApp message templates for ${f.businessName}, a small business, keeping its own voice: warm, brief, specific, never salesy.`,
    `Translate the template below from ${languageLabel(src.language)} into ${into}.${to && to.region ? ` Use the words and spelling people use in ${to.region}.` : ""} Write it the way a person from there writes to a customer: natural, not word for word.`,
    "",
    "WhatsApp's reviewers read the translation as a new template, so:",
    "- Keep every numbered slot exactly as written, {{1}}, {{2}}, {{3}}, each once and meaning what it meant; keep them in the same order where the language allows. Do not start or end the message with a slot.",
    "- Keep the word STOP as it is: customers reply STOP to opt out, whatever language they write in.",
    `- The message stays under ${TEMPLATE_BODY_MAX} characters, the footer under ${TEMPLATE_FOOTER_MAX} and the button's words under ${TEMPLATE_BUTTON_TEXT_MAX}. No emoji the original does not have, no ALL CAPS, no more than one blank line in a row.`,
    src.category === "marketing"
      ? "- This is a MARKETING template: the footer still says how to opt out."
      : "- This is a UTILITY template: add no promotional words at all.",
    "- Translate the examples that are words; keep names, business names and links exactly as given.",
    "- Never add a price, a promise or a fact the original does not state.",
    "",
    "Answer with one JSON object and nothing else, no code fence:",
    '{"body": "the message with its {{1}} slots", "footer": "the footer, or null", "examples": ["one per slot, in order"], "button": "the button\'s words, or null"}',
  ].join("\n");
}

/** The template as the assistant is given it: what each slot is, with its example, so a slot is never guessed at. */
export function translationInput(src: TranslateSource): string {
  return JSON.stringify(
    {
      body: src.body,
      footer: src.footer,
      slots: src.labels.map((label, i) => ({ slot: `{{${i + 1}}}`, is: label, example: src.examples[i] ?? "" })),
      button: src.button ? src.button.text : null,
    },
    null,
    2,
  );
}

const TranslationSchema = z.object({
  body: z.string().min(1).max(4000),
  footer: z.string().max(400).nullable().optional(),
  examples: z.array(z.string().max(400)).max(10).default([]),
  button: z.string().max(200).nullable().optional(),
});

export interface TranslatedTemplate {
  name: string;
  body: string;
  footer: string | null;
  examples: string[];
  /** The slots as the source names them: the words a composer shows beside each, and what the sync reads back. */
  variables: { position: number; label: string }[];
  warnings: string[];
  category: TemplateCategoryChoice;
  language: string;
  /** The source's own button in the new words: the same address, never the booking link guessed at. */
  button: { text: string; url: string } | null;
  /** The language it was written from. */
  from: string;
}

export type TranslateOutcome =
  { ok: true; draft: TranslatedTemplate } | { ok: false; reason: "refused" | "malformed" | "invalid"; message: string };

/**
 * What came back, as a draft the owner can submit: the same name, the same
 * slots, the source's own examples for a name, a business name and a link, and
 * the check a submission passes. A translation that lost a slot is refused,
 * not submitted short: its values would land in the wrong places.
 */
export function translatedDraft(src: TranslateSource, language: string, raw: unknown): TranslateOutcome {
  const d = TranslationSchema.safeParse(raw);
  if (!d.success)
    return {
      ok: false,
      reason: "malformed",
      message: "The translation did not come out well-formed. Try again, or write it by hand.",
    };
  const slots = placeholdersOf(d.data.body);
  if (slots.length !== src.examples.length)
    return { ok: false, reason: "invalid", message: "The translation lost one of the message's values. Try again." };
  const examples = src.examples.map((e, i) => {
    const said = String(d.data.examples[i] ?? "").trim();
    return src.kinds[i] && src.kinds[i] !== "text" && e ? e : said || e;
  });
  const button = src.button
    ? {
        text:
          String(d.data.button ?? "")
            .replace(/\s+/g, " ")
            .trim() || src.button.text,
        url: src.button.url,
      }
    : null;
  const check = validateTemplateDraft({
    name: src.name,
    language,
    category: src.category,
    body: d.data.body,
    footer: d.data.footer ?? null,
    examples,
    button,
  });
  if (!check.ok)
    return {
      ok: false,
      reason: "invalid",
      message: `The translation broke a WhatsApp rule (${check.error}). Try again, or write it by hand.`,
    };
  const v = check.value;
  return {
    ok: true,
    draft: {
      name: v.name,
      body: v.body,
      footer: v.footer,
      examples: v.examples,
      variables: src.labels.map((label, i) => ({ position: i + 1, label })),
      warnings: check.warnings,
      category: v.category,
      language: v.language,
      button: v.button,
      from: src.language,
    },
  };
}

/**
 * A template written again in another language, by the assistant, from the
 * words WhatsApp already holds. A draft, never a submission: the owner reads it
 * and submits it, and WhatsApp reviews it as the new template it is.
 */
export async function translateTemplate(
  ctx: RouteContext,
  tenantId: string,
  input: { source: TranslateSource; language: string },
): Promise<TranslateOutcome> {
  const { facts } = await workspaceFor(ctx, tenantId);
  const turn = await askOnce(
    ctx,
    tenantId,
    translateSystemPrompt(facts, input.source, input.language),
    translationInput(input.source),
    "translation",
  );
  if (!turn.ok) return turn;
  const json = extractJson(turn.text);
  const out = translatedDraft(input.source, input.language, json);
  if (!out.ok && out.reason === "malformed") {
    console.error(
      "translation_malformed",
      JSON.stringify({
        tenant_id: tenantId,
        blocks: turn.blockTypes,
        stop: turn.stopReason,
        stream_error: turn.streamError,
        text: turn.text.slice(0, 400),
      }),
    );
  }
  return out;
}
