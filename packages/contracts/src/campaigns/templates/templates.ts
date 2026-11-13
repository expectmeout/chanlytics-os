/** Templates: templates. */

import type { TemplateStatus } from "../../shared/enums";
import { WHATSAPP_LANGUAGES } from "./languages";
import { NUMBERED_SLOT } from "../../shared/words";
import { isOneOf } from "../../shared/unknown";

/**
 * Where WhatsApp has a message's version, in the owner's words, once (D1-template-marks). A refusal read "Rejected" on the
 * Library's pill, "refused" in its standing line and the Inbox picker, and "rejected" on the bell, and the row tag lower-cased
 * the pill's. "Refused" is the word the sentences already said; the pill (tone.ts), the Library's per-channel standing
 * (campaign-message.ts), the Inbox picker's reasons (inbox-templates.ts), the Reports tile's names and the bell all read
 * this, lower-cased where they stand in a sentence.
 */
export const TEMPLATE_STATUS_WORDS: Record<TemplateStatus, string> = {
  approved: "Approved",
  pending: "In review",
  rejected: "Refused",
  paused: "Paused",
  disabled: "Disabled",
};

/**
 * The languages a template may be written in: every one WhatsApp takes
 * (templates/languages.ts). It was six, so a business writing to its customers
 * in French or Vietnamese was told to "pick a language from the list".
 */
export const TEMPLATE_LANGUAGES: readonly { id: string; label: string }[] = WHATSAPP_LANGUAGES;

export const TEMPLATE_CATEGORIES = ["marketing", "utility"] as const;

export type TemplateCategoryChoice = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_BODY_MAX = 1024;

export const TEMPLATE_FOOTER_MAX = 60;

export const TEMPLATE_EXAMPLE_MAX = 100;

/** The longest name a person gives one of a message's values ("First name"): the edge's ceiling and the door's (00343). */
export const TEMPLATE_LABEL_MAX = 40;

/** The longest name slugTemplateName makes, the edge's ceiling too (00343); read by nothing outside this module. */
const TEMPLATE_NAME_MAX = 60;

/** What a name that is not one Meta accepts is told (templateNameOk). */
export const TEMPLATE_NAME_WORDS = "The name needs letters, digits or underscores.";

/** What a WhatsApp body past what Meta takes is told (templateBodyTooLong): the draft's check, and Ask's message card. */
export const TEMPLATE_BODY_WORDS = `The message must be under ${TEMPLATE_BODY_MAX} characters.`;

/**
 * What a message of a name and language the workspace already holds is told: POST templates, POST templates/message and
 * Ask's message card, which refuses it before it is a card.
 */
export const TEMPLATE_SAME_NAME_WORDS = "A template with that name and language already exists. Pick another name.";

/** Meta's ceiling for the words on a button. */
export const TEMPLATE_BUTTON_TEXT_MAX = 25;

const NAME = /^[a-z0-9_]{1,512}$/;

export function templateNameOk(name: string): boolean {
  return NAME.test(name);
}

/** A name Meta accepts, from anything a person typed: lowercase, digits and underscores. */
export function slugTemplateName(raw: string): string {
  return String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, TEMPLATE_NAME_MAX)
    .replace(/_+$/g, "");
}

/**
 * A WhatsApp body as Meta reviews it: one kind of line break, nothing blank at either end, a tab a space and never more
 * than one blank line in a row (its review refuses more: mended here, since no owner means the difference).
 */
const bodyAsReviewed = (body: string | null | undefined): string =>
  String(body ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * Link shorteners, which WhatsApp's review refuses because they hide where a link goes: the well-known ones. The full
 * address always works, so refusing one costs its writer nothing.
 */
const LINK_SHORTENERS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
  "shorturl.at",
  "tiny.cc",
  "rb.gy",
  "t.ly",
  "lnkd.in",
  "v.gd",
  "bl.ink",
];
const SHORT_LINK = new RegExp(
  `(?:^|[\\s/.(])(?:${LINK_SHORTENERS.map((host) => host.replace(/\./g, "\\.")).join("|")})(?:/|\\b)`,
  "i",
);

/** The fewest words of its own a body needs for each value it takes (shapeRefusal). */
const WORDS_A_VALUE = 2;

/**
 * What WhatsApp's review refuses of a message's words whoever wrote them, refused here first, in the person's words, so
 * nothing is sent to be refused (Ruben, 12 Nov 2026: only words WhatsApp takes are submitted). Its own list (Meta's
 * template review page, read 12 Nov 2026): a value written any other way than {{1}}, values not numbered in order
 * (placeholdersSequential, the draft's own check), a value at the very start or end, too many values for the words around
 * them, and, by every provider's account, a shortened link. Meta publishes no number for "too many": the guides say about
 * three words a value, and this refuses the plain case (fewer than WORDS_A_VALUE of its own words a value), leaving the
 * rest to Meta's answer at the door. Null where the words pass. What a reader judges (a threat, a request for a card
 * number, goods WhatsApp does not allow) is the dashboard's check at its doors, not this one.
 */
function shapeRefusal(body: string, link: string | null): string | null {
  const plain = body.replace(NUMBERED_SLOT, " ");
  if (/[{}]/.test(plain))
    return "Write each value as {{1}} or {{2}}: two braces each side, and only its number inside.";
  if (/^\s*\{\{\d+\}\}/.test(body) || /\{\{\d+\}\}\s*$/.test(body))
    return "WhatsApp refuses a message that starts or ends with a value. Put words before the first one and after the last.";
  const values = placeholdersOf(body).length;
  const words = plain.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  if (values > 0 && words < values * WORDS_A_VALUE)
    return "WhatsApp refuses a message with this many values and so few words. Add a few words around them, or use fewer values.";
  if (SHORT_LINK.test(body) || (link !== null && SHORT_LINK.test(link)))
    return "WhatsApp refuses shortened links, since they hide where they go. Use the full address.";
  return null;
}

/** Whether a WhatsApp body is past what Meta takes (TEMPLATE_BODY_MAX), read as its review reads it: the one test of it. */
export function templateBodyTooLong(body: string): boolean {
  return bodyAsReviewed(body).length > TEMPLATE_BODY_MAX;
}

/** The numbered slots a body names, sorted and unique. */
export function placeholdersOf(body: string): number[] {
  const set = new Set<number>();
  for (const m of String(body ?? "").matchAll(NUMBERED_SLOT)) set.add(Number(m[1]));
  return [...set].sort((a, b) => a - b);
}

/** Meta wants {{1}}, {{2}}, … with no gaps and nothing else. */
export function placeholdersSequential(positions: number[]): boolean {
  return positions.every((n, i) => n === i + 1);
}

export interface TemplateDraftInput {
  name: string;
  language: string;
  category: string;
  body: string;
  footer?: string | null;
  /** One example per slot, in order — Meta's reviewers read these. */
  examples?: string[];
  /**
   * One button under the words, opening a fixed address — the business's own
   * booking link. STATIC on purpose: a button whose URL takes a value needs a
   * parameter at send time, and `sendTemplate` puts the body on the wire and
   * nothing else, so such a template is refused by Meta for every recipient
   * (templates/parts.ts templateBlocked). A fixed link needs no parameter, so
   * this one sends exactly as it is written.
   */
  button?: { text: string; url: string } | null;
}

export interface TemplateDraft {
  name: string;
  language: string;
  category: TemplateCategoryChoice;
  body: string;
  footer: string | null;
  examples: string[];
  button: { text: string; url: string } | null;
}

export type TemplateDraftCheck = { ok: true; value: TemplateDraft; warnings: string[] } | { ok: false; error: string };

/**
 * What Meta refuses at the wire, refused here in the person's words. The
 * warnings are things reviewers frown on but do not always reject.
 */
export function validateTemplateDraft(templateDraftInput: TemplateDraftInput): TemplateDraftCheck {
  const name = slugTemplateName(templateDraftInput.name);
  if (!name || !templateNameOk(name)) return { ok: false, error: TEMPLATE_NAME_WORDS };
  if (!TEMPLATE_LANGUAGES.some((l) => l.id === templateDraftInput.language))
    return { ok: false, error: "Pick a language from the list." };
  if (!isOneOf(TEMPLATE_CATEGORIES, templateDraftInput.category))
    return { ok: false, error: "A template is marketing or utility." };
  const body = bodyAsReviewed(templateDraftInput.body);
  if (!body) return { ok: false, error: "Write the message." };
  if (templateBodyTooLong(body)) return { ok: false, error: TEMPLATE_BODY_WORDS };
  const slots = placeholdersOf(body);
  if (!placeholdersSequential(slots))
    return { ok: false, error: "Number the values {{1}}, {{2}}, {{3}} in order, with no gaps." };
  const examples = (templateDraftInput.examples ?? []).map((e) => String(e ?? "").trim());
  if (examples.length !== slots.length)
    return {
      ok: false,
      error:
        slots.length === 0
          ? "This message takes no values, so it needs no examples."
          : `Give one example for each of the ${slots.length} value${slots.length === 1 ? "" : "s"} — WhatsApp's reviewers read them.`,
    };
  if (examples.some((e) => !e || e.length > TEMPLATE_EXAMPLE_MAX))
    return { ok: false, error: `Every example needs words, under ${TEMPLATE_EXAMPLE_MAX} characters.` };
  const footer = templateDraftInput.footer ? String(templateDraftInput.footer).trim() : "";
  if (footer.length > TEMPLATE_FOOTER_MAX)
    return { ok: false, error: `The footer must be under ${TEMPLATE_FOOTER_MAX} characters.` };
  if (/\{\{/.test(footer)) return { ok: false, error: "The footer cannot take a value." };
  let button: TemplateDraft["button"] = null;
  if (templateDraftInput.button) {
    const text = String(templateDraftInput.button.text ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const url = String(templateDraftInput.button.url ?? "").trim();
    if (!text) return { ok: false, error: "Give the button its words, or leave it out." };
    if (text.length > TEMPLATE_BUTTON_TEXT_MAX)
      return { ok: false, error: `A button's words must be under ${TEMPLATE_BUTTON_TEXT_MAX} characters.` };
    if (/\{\{/.test(text) || /\{\{/.test(url))
      return {
        ok: false,
        error:
          "A button cannot take a value: Chanlytics sends the message and nothing else, and WhatsApp would refuse every send.",
      };
    let parsed: URL | null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null; // Not an address.
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol))
      return { ok: false, error: "The button needs a web address to open, starting with https://." };
    button = { text, url };
  }
  const refused = shapeRefusal(body, button?.url ?? null);
  if (refused) return { ok: false, error: refused };
  const warnings: string[] = [];
  if (templateDraftInput.category === "marketing" && !/stop/i.test(body + " " + footer))
    warnings.push("A marketing message should say how to opt out, such as “Reply STOP to opt out”.");
  return {
    ok: true,
    value: {
      name,
      language: templateDraftInput.language,
      category: templateDraftInput.category,
      body,
      footer: footer || null,
      examples,
      button,
    },
    warnings,
  };
}

/** The components Meta's create call takes, from a checked draft. */
export function templateComponents(templateDraft: TemplateDraft): Array<Record<string, unknown>> {
  const body: Record<string, unknown> = { type: "BODY", text: templateDraft.body };
  if (templateDraft.examples.length) body.example = { body_text: [templateDraft.examples] };
  const out: Array<Record<string, unknown>> = [body];
  if (templateDraft.footer) out.push({ type: "FOOTER", text: templateDraft.footer });
  // Meta's order: BODY, FOOTER, BUTTONS. A static URL button carries no
  // parameter, so a template with one sends exactly as `sendTemplate` sends
  // every other: the body alone.
  if (templateDraft.button)
    out.push({
      type: "BUTTONS",
      buttons: [{ type: "URL", text: templateDraft.button.text, url: templateDraft.button.url }],
    });
  return out;
}
