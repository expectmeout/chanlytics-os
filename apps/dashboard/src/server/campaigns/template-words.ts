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
import { countLiveRunsOfTemplate, findTemplateWords } from "@chanlytics/db/campaigns";
import { editTemplateWords, recordFixWords } from "@/server/campaigns/meta-templates";
import { submitRefusal } from "@/server/campaigns/template-submit";
import {
  WHATSAPP_NO_COPY,
  refuseSecondChange,
  refuseTwinWords,
  type ReviewWords,
} from "@/server/campaigns/whatsapp-refusals";
import type { RouteContext } from "@/server/shared/with-route";
import type { TenantId } from "@chanlytics/contracts";

/** The longest words WhatsApp takes in a message's body. */
const WORDS_MAX = 1024;

export const TemplateWords = z.object({ body: z.string().trim().min(1).max(WORDS_MAX) });

/** The statuses whose words Meta lets be changed. */
const CHANGEABLE = new Set(["approved", "rejected", "paused"]);

export const WORDS_SAID = {
  notWhatsApp: "Only a WhatsApp version is sent back to WhatsApp: an email or a text is saved as it is.",
  /** A row WhatsApp holds no copy of (never sent there: no id of Meta's), which only New can write. */
  notAtWhatsApp: WHATSAPP_NO_COPY,
  inReview: "WhatsApp is still looking at these words. Change them once it has answered.",
  /** A send going out with these words now, which WhatsApp's look would stop part-way, as a delete is refused for it. */
  sending: "A send is going out with these words now. Change them once it has gone.",
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

/**
 * Ask's new words for a message WhatsApp refused, kept on the ledger as they are written (`template.fix_written`), so its
 * editor opens on them again with no second wait (the live demo, 12 Nov 2026: Ask wrote them again, ~15 seconds, on every
 * open). Only for the workspace's own WhatsApp version that WhatsApp refused, for the refusal it carries now. Best effort,
 * as an event is: the words are the editor's either way.
 */
export async function keepFixWords(
  ctx: RouteContext,
  tenantId: TenantId,
  fixing: { template_id: string; reason: string },
  words: string,
): Promise<void> {
  const { data: held, error } = await findTemplateWords(ctx.supabase, tenantId, fixing.template_id);
  if (error) throw new DbFailure(error, "template words");
  if (!held || held.channel !== "whatsapp" || held.meta_status !== "rejected") return;
  await recordFixWords(tenantId, held.id, { words, reason: fixing.reason, by: ctx.userId });
}

/**
 * Every refusal of WhatsApp's new words before anything is sent, in the person's words, and what they are sent as: this
 * door's own, and Ask's card's (ask/tools/act/message-change.ts), so a card never promises what this refuses.
 */
export async function checkWordsBack(
  ctx: RouteContext,
  tpl: { id: string; tenant_id: TenantId },
  words: z.infer<typeof TemplateWords>,
) {
  const { data: held, error } = await findTemplateWords(ctx.supabase, tpl.tenant_id, tpl.id);
  if (error) throw new DbFailure(error, "template words");
  if (!held || held.channel !== "whatsapp") throw new AppError("validation", WORDS_SAID.notWhatsApp);
  if (!held.meta_id) throw new AppError("conflict", WORDS_SAID.notAtWhatsApp, 409);
  if (!CHANGEABLE.has(held.meta_status)) throw new AppError("conflict", WORDS_SAID.inReview, 409);
  // While WhatsApp looks, the words are no longer approved, and a send under way fails its WhatsApp people: refused, as
  // a delete is (template-row.ts). A running sequence holds its WhatsApp sends until the new words are approved, which the
  // editor says before Send.
  const { count, error: liveErr } = await countLiveRunsOfTemplate(ctx.supabase, tpl.tenant_id, held);
  if (liveErr) throw new DbFailure(liveErr, "sends of a template");
  if (count) throw new AppError("conflict", WORDS_SAID.sending, 409);
  await refuseSecondChange(ctx, tpl.tenant_id, held, Date.now());
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
  await refuseTwinWords(ctx, tpl.tenant_id, { id: held.id, body: check.value.body, footer: check.value.footer });
  return { held, check: check.value, warnings: check.warnings, labels };
}

/** `review`: a reader's look at the words once every rule passed, before they are sent (whatsapp-refusals.ts ReviewWords). */
export async function sendWordsBack(
  ctx: RouteContext,
  tpl: { id: string; tenant_id: TenantId; name: string; language: string },
  words: z.infer<typeof TemplateWords>,
  review?: ReviewWords,
) {
  const { held, check, warnings, labels } = await checkWordsBack(ctx, tpl, words);
  await review?.(ctx, tpl.tenant_id, check);
  const sent = await editTemplateWords(tpl.tenant_id as Parameters<typeof editTemplateWords>[0], ctx.userId, {
    id: held.id,
    name: held.name,
    language: held.language,
    components: templateComponents(check),
    body: check.body,
    examples: check.examples,
    labels,
    // Approved words a change replaces are kept on the ledger, so a refusal of the new ones can go back to them.
    before: held.meta_status === "approved" ? (held.body_preview ?? null) : null,
  });
  if (!sent.ok) throw submitRefusal(sent);
  return { id: held.id, name: held.name, meta_status: sent.metaStatus, warnings };
}
