/**
 * A WhatsApp message's words changed in Messages and sent back to WhatsApp (the Messages redesign's step 3: one editor for
 * every channel, WhatsApp's words too). PUT templates/[id] { words: { body } }: checked as a new message is
 * (validateTemplateDraft), with the message's own name, language and category, which a change never touches, its footer
 * and its link button kept as they stand, and each value's example and name kept by its number. The edge files it
 * (templates-edit), and Meta reviews the words again: an approved message up to once a day and ten times in thirty days,
 * a refused or paused one as often as asked. A message written in WhatsApp's own tools with a heading or other buttons is
 * changed there, since what this editor writes would drop them.
 */
import { z } from "zod";
import {
  AppError,
  DbFailure,
  NUMBERED_SLOT,
  TEMPLATE_CATEGORIES,
  isOneOf,
  recordOrNull,
  templateComponents,
  textOrEmpty,
  validateTemplateDraft,
} from "@chanlytics/contracts";
import { findTemplateWords } from "@chanlytics/db/campaigns";
import { editTemplateWords } from "@/server/campaigns/meta-templates";
import { submitRefusal } from "@/server/campaigns/template-submit";
import type { RouteContext } from "@/server/shared/with-route";

/** The longest words WhatsApp takes in a message's body. */
const WORDS_MAX = 1024;

export const TemplateWords = z.object({ body: z.string().trim().min(1).max(WORDS_MAX) });

/** The statuses whose words Meta lets be changed. */
const CHANGEABLE = new Set(["approved", "rejected", "paused"]);

export const WORDS_SAID = {
  notWhatsApp: "Only a WhatsApp version is sent back to WhatsApp: an email or a text is saved as it is.",
  inReview: "WhatsApp is still looking at these words. Change them once it has answered.",
  notOurs:
    "This one has a heading or buttons written in WhatsApp's own tools: change it there, so nothing it holds is lost.",
  noCategory: "WhatsApp gave this one a kind this editor does not write. Change it in WhatsApp's own tools.",
} as const;

/** What stays of a message as its words change: its footer and its one link button, or that it holds more than those. */
function keptParts(
  components: unknown,
): { footer: string | null; button: { text: string; url: string } | null } | null {
  const parts = Array.isArray(components) ? components.map(recordOrNull) : [];
  let footer: string | null = null;
  let button: { text: string; url: string } | null = null;
  for (const part of parts) {
    const type = textOrEmpty(part?.type).toUpperCase();
    if (type === "BODY") continue;
    if (type === "FOOTER") footer = textOrEmpty(part?.text) || null;
    else if (type === "BUTTONS") {
      const buttons = Array.isArray(part?.buttons) ? part.buttons.map(recordOrNull) : [];
      const link = buttons.length === 1 && textOrEmpty(buttons[0]?.type).toUpperCase() === "URL" ? buttons[0] : null;
      if (!link) return null;
      button = { text: textOrEmpty(link.text), url: textOrEmpty(link.url) };
    } else return null;
  }
  return { footer, button };
}

/** Each value's name and example, by its number, as the row keeps them. */
function valuesOf(variables: unknown): Map<number, { label: string; example: string }> {
  const out = new Map<number, { label: string; example: string }>();
  for (const v of Array.isArray(variables) ? variables.map(recordOrNull) : []) {
    const position = Number(v?.position);
    if (Number.isInteger(position) && position > 0)
      out.set(position, { label: textOrEmpty(v?.label), example: textOrEmpty(v?.example) });
  }
  return out;
}

export async function sendWordsBack(
  ctx: RouteContext,
  tpl: { id: string; tenant_id: string; name: string; language: string },
  words: z.infer<typeof TemplateWords>,
) {
  const { data: held, error } = await findTemplateWords(ctx.supabase, tpl.tenant_id, tpl.id);
  if (error) throw new DbFailure(error, "template words");
  if (!held || held.channel !== "whatsapp") throw new AppError("validation", WORDS_SAID.notWhatsApp);
  if (!CHANGEABLE.has(held.meta_status)) throw new AppError("conflict", WORDS_SAID.inReview, 409);
  const kept = keptParts(held.components);
  if (!kept) throw new AppError("validation", WORDS_SAID.notOurs);
  const category = String(held.category ?? "");
  if (!isOneOf(TEMPLATE_CATEGORIES, category)) throw new AppError("validation", WORDS_SAID.noCategory);
  // Each value the new words name keeps the example and the name it had: the editor never renumbers them.
  const had = valuesOf(held.variables);
  const positions = [...new Set([...words.body.matchAll(NUMBERED_SLOT)].map((m) => Number(m[1])))].sort(
    (a, b) => a - b,
  );
  const examples = positions.map((n) => had.get(n)?.example || had.get(n)?.label || "Sam");
  const labels = positions.map((n) => had.get(n)?.label || `Value ${n}`);
  const check = validateTemplateDraft({
    name: held.name,
    language: held.language,
    category,
    body: words.body,
    footer: kept.footer,
    examples,
    button: kept.button,
  });
  if (!check.ok) throw new AppError("validation", check.error);
  const sent = await editTemplateWords(tpl.tenant_id as Parameters<typeof editTemplateWords>[0], ctx.userId, {
    id: held.id,
    name: held.name,
    language: held.language,
    components: templateComponents(check.value),
    body: check.value.body,
    examples: check.value.examples,
    labels,
  });
  if (!sent.ok) throw submitRefusal(sent);
  return { id: held.id, name: held.name, meta_status: sent.metaStatus, warnings: check.warnings };
}
