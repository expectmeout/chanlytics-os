/** Template: translate. */

import "server-only";
import { z } from "zod";
import {
  defaultSlotKinds,
  keepsValues,
  languageLabel,
  placeholdersOf,
  slotLabels,
  starterByKey,
  starterByName,
  starterText,
  TEMPLATE_BODY_MAX,
  TEMPLATE_BUTTON_TEXT_MAX,
  TEMPLATE_FOOTER_MAX,
  templateBlocked,
  templateLanguage,
  templateLinkButton,
  templateParts,
  templateUntranslatable,
  validateTemplateDraft,
  type TemplateCategoryChoice,
  textOrEmpty,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/shared/with-route";
import type { WorkspaceFacts } from "@/server/ask/prompt/stable-system";
import { log } from "@/server/shared/log";
import { askOnce, extractJson, workspaceFor, writeIn } from "./draft";
import { SHORTER_ASK, WARMER_ASK } from "@/server/shared/model/tones";
import { findTemplateIn, findTemplateToTranslate } from "@chanlytics/db/campaigns";

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
  /^marketing$/i.test(textOrEmpty(c)) ? "marketing" : /^utility$/i.test(textOrEmpty(c)) ? "utility" : null;

/**
 * What a template is written from, and whether it may be written in `language`
 * at all: a row on file that Chanlytics can carry whole (templateUntranslatable),
 * or a starter's words from the library. Never a language the message already
 * has, and never a language the library has written already -- that one is
 * added as it is, not translated. Refused here, before the assistant is paid for.
 */
export async function getTranslationSource(
  ctx: RouteContext,
  tenantId: string,
  ref: SourceRef,
  language: string,
): Promise<SourceOutcome> {
  let source: TranslateSource;
  if ("starter" in ref) {
    const result = starterByKey(ref.starter);
    if (!result) return { ok: false, code: "not_found", message: "That starter is not in the library." };
    if (result.texts[language])
      return {
        ok: false,
        code: "validation",
        message: `The starter set has it written in ${languageLabel(language)} already: add it as it is.`,
      };
    const from = ref.from && result.texts[ref.from] ? ref.from : "en_US";
    const otherStarterText = starterText(result, from);
    source = {
      name: result.name,
      category: result.category,
      language: from,
      body: otherStarterText.body,
      footer: otherStarterText.footer,
      examples: otherStarterText.slots.map((x) => x.example),
      labels: otherStarterText.slots.map((x) => x.label),
      kinds: otherStarterText.slots.map((x) => x.kind),
      button: null,
    };
  } else {
    const { data, error } = await findTemplateToTranslate(ctx.supabase, tenantId, ref.id);
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, code: "not_found", message: "That template is not on file here." };
    const parts = templateParts(data.components);
    const reason = templateUntranslatable({
      ...parts,
      blocked: templateBlocked({ components: data.components }),
      category: data.category,
    });
    const category = categoryOf(data.category);
    if (reason || !category)
      return {
        ok: false,
        code: "validation",
        message: `Chanlytics can't write this one in another language: ${reason ?? "WhatsApp gave it no category"}. Add its other languages in WhatsApp Manager.`,
      };
    const body = textOrEmpty(data.body_preview);
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
  const { data: have, error: hErr } = await findTemplateIn(ctx.supabase, tenantId, source.name, language);
  if (hErr) throw new Error(hErr.message);
  if (have) return { ok: false, code: "conflict", message: `It is on file in ${languageLabel(language)} already.` };
  return { ok: true, source };
}

export function translateSystemPrompt(workspaceFacts: WorkspaceFacts, src: TranslateSource, language: string): string {
  const to = templateLanguage(language);
  const into = to ? to.label : languageLabel(language);
  return [
    `You translate WhatsApp message templates for ${workspaceFacts.businessName}, a small business, keeping its own voice: warm, brief, specific, never salesy.`,
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
  const parsed = TranslationSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "malformed",
      message: "The translation did not come out well-formed. Try again, or write it by hand.",
    };
  const slots = placeholdersOf(parsed.data.body);
  if (slots.length !== src.examples.length)
    return { ok: false, reason: "invalid", message: "The translation lost one of the message's values. Try again." };
  const examples = src.examples.map((e, i) => {
    const sentence = String(parsed.data.examples[i] ?? "").trim();
    return src.kinds[i] && src.kinds[i] !== "text" && e ? e : sentence || e;
  });
  const button = src.button
    ? {
        text: textOrEmpty(parsed.data.button).replace(/\s+/g, " ").trim() || src.button.text,
        url: src.button.url,
      }
    : null;
  const check = validateTemplateDraft({
    name: src.name,
    language,
    category: src.category,
    body: parsed.data.body,
    footer: parsed.data.footer ?? null,
    examples,
    button,
  });
  if (!check.ok)
    return {
      ok: false,
      reason: "invalid",
      message: `The translation broke a WhatsApp rule (${check.error}). Try again, or write it by hand.`,
    };
  const value = check.value;
  return {
    ok: true,
    draft: {
      name: value.name,
      body: value.body,
      footer: value.footer,
      examples: value.examples,
      variables: src.labels.map((label, i) => ({ position: i + 1, label })),
      warnings: check.warnings,
      category: value.category,
      language: value.language,
      button: value.button,
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
    log.error("translation_malformed", {
      tenant_id: tenantId,
      blocks: turn.blockTypes,
      stop: turn.stopReason,
      stream_error: turn.streamError,
      output: turn.text.slice(0, 400),
    });
  }
  return out;
}

/* ---------------------------- warmer, shorter ---------------------------- */

/** What a version's words are written again as: Ask's two changes where words are written (the Inbox composer's too). */
export const VERSION_TONES = ["warmer", "shorter"] as const;

type VersionTone = (typeof VERSION_TONES)[number];

/** How a rewrite is asked, in the Inbox composer's own words for the same two presses (new-conversation/person-draft.ts). */
const TONE_ASKED: Record<VersionTone, string> = {
  shorter: SHORTER_ASK,
  warmer: WARMER_ASK,
};

const RewriteSchema = z.object({ subject: z.string().nullable().optional(), body: z.string().min(1) });

type RewriteOutcome =
  | { ok: true; subject: string | null; body: string }
  | { ok: false; reason: "refused" | "malformed" | "invalid"; message: string };

/**
 * A version's words written again, warmer or shorter (Ask's changes where an email or a text version is written: the
 * Library's editor, and a sequence's step where its words are written in place): the same message in the business's
 * voice, every value it holds (`{{1}}`, `{{opening}}`) kept as it is, one for one, in the same language. Words handed back,
 * never saved: the editor holds them, its own check runs on them as on typed words, and its Save is the person's. A
 * rewrite that dropped or added a value, or came back malformed, is refused in words.
 */
export async function rewriteVersion(
  ctx: RouteContext,
  tenantId: string,
  input: { channel: "email" | "sms"; language: string; subject: string | null; body: string; tone: VersionTone },
): Promise<RewriteOutcome> {
  const { facts } = await workspaceFor(ctx, tenantId);
  const email = input.channel === "email";
  const system = [
    `You rewrite a message ${facts.businessName}, a small business, sends its customers, in its own voice: warm, brief, specific, never salesy.`,
    facts.guardrails.length ? `Rules the business follows: ${facts.guardrails.join(" ")}` : "",
    writeIn(input.language),
    "Keep its meaning, what it asks of the person, and every value written in double braces ({{1}}, {{first_name}}) exactly as it is: the same ones, none added, none dropped.",
    email ? "It is an email: a subject line and its words." : "It is a text message: plain words, no subject.",
    "Answer with one JSON object and nothing else, no code fence:",
    email ? '{"subject": "the subject", "body": "the words"}' : '{"body": "the words"}',
  ]
    .filter(Boolean)
    .join("\n");
  const user = [
    email && input.subject ? `Subject: ${input.subject}` : null,
    `Words:\n${input.body}`,
    TONE_ASKED[input.tone],
  ]
    .filter(Boolean)
    .join("\n\n");
  const turn = await askOnce(ctx, tenantId, system, user, "draft");
  if (!turn.ok) return turn;
  const out = rewrittenVersion(input, extractJson(turn.text));
  if (!out.ok && out.reason === "malformed")
    log.error("draft_malformed", {
      tenant_id: tenantId,
      blocks: turn.blockTypes,
      stop: turn.stopReason,
      stream_error: turn.streamError,
      output: turn.text.slice(0, 400),
    });
  return out;
}

/**
 * What a rewrite answered, judged (pure, as translatedDraft is): its words, an email's subject kept where none came back,
 * and every value the words held (`{{1}}`, `{{opening}}`) kept one for one, else refused in words.
 */
function rewrittenVersion(
  input: { channel: "email" | "sms"; subject: string | null; body: string },
  raw: unknown,
): RewriteOutcome {
  const parsed = RewriteSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: "malformed", message: "The words did not come back well-formed. Try again." };
  const email = input.channel === "email";
  const subject = email ? parsed.data.subject?.trim() || input.subject : null;
  const body = parsed.data.body.trim();
  if (!keepsValues({ subject: input.subject, body: input.body }, { subject, body }))
    return { ok: false, reason: "invalid", message: "The rewrite changed the message's values. Try again." };
  return { ok: true, subject, body };
}
