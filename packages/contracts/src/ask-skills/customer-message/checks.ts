/**
 * What code holds the customer message writer's words to before any card shows them (skill.ts says each rule to the
 * writer; this is where it is kept, never on the prompt alone): the values the card asked for, WhatsApp's review, the
 * opt-out line an offer ends on, a text's one part, an email's subject, and nothing the first draft did not hold, no
 * price (contracts priceBreach, against the draft's own figures, as the person drafts are checked), no money word, no
 * number, no link typed in. Every issue is a reason to keep the draft: the card then says what it says today.
 */
import { namesMoney, priceBreach, priceFigures } from "../../config/policy";
import { EMAIL_BODY_MAX, EMAIL_SUBJECT_MAX, smsSegments, smsStopLine } from "../../templates/message-versions";
import { placeholdersOf, templateBodyTooLong } from "../../templates/templates";
import { CRAFT_CHANNELS, textAsSent, textPartsAllowed } from "./brief";
import type { CraftChannel, CraftVersions, MessageBrief } from "./brief";

/** What can be wrong with the writer's words, one code each. */
export type CraftIssueCode =
  | "missing"
  | "values"
  | "braces"
  | "value_at_edge"
  | "values_side_by_side"
  | "too_long"
  | "subject"
  | "opt_out"
  | "promotes"
  | "new_price"
  | "new_money"
  | "new_number"
  | "typed_contact"
  | "blank_lines"
  | "text_parts"
  | "stop_written"
  | "shouting";

export interface CraftIssue {
  channel: CraftChannel;
  code: CraftIssueCode;
  /** What is wrong, for the log and the eval. */
  words: string;
}

const CRAFT_SLOT = /\{\{(\d+)\}\}/g;
const craftWithoutSlots = (s: string): string => s.replace(CRAFT_SLOT, " ");
/** Every number written in figures, outside the values. */
const craftFigures = (s: string): string[] => craftWithoutSlots(s).match(/\d+(?:[.,:]\d+)*/g) ?? [];
/** A freebie said in words: "free" (not "feel free", "free to"), "gratis", "gratuito". */
const CRAFT_FREE = /\b(?<!feel )free\b(?! to\b)|\bgratis\b|\bgratuit[oa]s?\b/i;
/** A link, an email address or a phone number typed in: each reaches a message only through a value. */
const CRAFT_CONTACT = /https?:\/\/|\bwww\.|[\w.+-]+@[\w-]+\.[a-z]{2,}|\+?\d[\d ().-]{7,}\d/i;
/** A word of four capitals or more: shouting, unless it is STOP or the business's own. */
const CRAFT_CAPS = /(?<![\p{L}\d])[\p{Lu}]{4,}(?![\p{L}\d])/gu;
const CRAFT_PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** An email's own way out, which the sender's foot already says: an unsubscribe in words, or STOP (in capitals only). */
const CRAFT_UNSUBSCRIBE = /\bunsubscribe\b|\bdar(?:te|se) de baja\b/i;
const CRAFT_STOP = /\bSTOP\b/;

/** The versions' words one after another, for what the whole message may say. */
function craftAllWords(v: CraftVersions): string {
  return [v.whatsapp?.body, v.email?.subject, v.email?.body, v.sms?.body].filter(Boolean).join("\n");
}

/** The words of one version: an email's subject and body together. */
function craftWordsOf(v: CraftVersions, c: CraftChannel): string {
  if (c === "email") return v.email ? `${v.email.subject}\n${v.email.body}` : "";
  return v[c]?.body ?? "";
}

/** What any version may not say beyond the draft: a price, money, a freebie, a number, a contact typed in, shouting. */
function craftBeyondDraft(c: CraftChannel, text: string, draft: string, b: MessageBrief): CraftIssue[] {
  const out: CraftIssue[] = [];
  const at = (code: CraftIssueCode, words: string) => out.push({ channel: c, code, words });
  if (priceBreach(text, new Set(priceFigures(draft)))) at("new_price", "a price or a share the draft does not hold");
  if ((namesMoney(text) && !namesMoney(draft)) || (CRAFT_FREE.test(text) && !CRAFT_FREE.test(draft)))
    at("new_money", "a discount, a free thing or a payment term the draft does not hold");
  const known = new Set(craftFigures(draft));
  const extra = craftFigures(text).filter((n) => !known.has(n));
  if (extra.length) at("new_number", `numbers the draft does not hold: ${[...new Set(extra)].join(", ")}`);
  if (CRAFT_CONTACT.test(craftWithoutSlots(text)))
    at("typed_contact", "a link, an email address or a phone number typed in");
  const own = new Set([...b.business.name.split(/\s+/), ...(draft.match(CRAFT_CAPS) ?? []), "STOP"]);
  const loud = (text.match(CRAFT_CAPS) ?? []).filter((w) => !own.has(w));
  if (loud.length) at("shouting", `capitals for emphasis: ${[...new Set(loud)].join(", ")}`);
  return out;
}

/** WhatsApp's own: every value, never at an edge or side by side, its length, its blank lines, its opt-out line. */
function craftWhatsappIssues(body: string, b: MessageBrief): CraftIssue[] {
  const out: CraftIssue[] = [];
  const at = (code: CraftIssueCode, words: string) => out.push({ channel: "whatsapp", code, words });
  const want = b.message.values.map((v) => v.position).sort((x, y) => x - y);
  const got = placeholdersOf(body);
  if (got.join(",") !== want.join(","))
    at(
      "values",
      `values ${got.map((n) => `{{${n}}}`).join(" ") || "none"}, asked ${want.map((n) => `{{${n}}}`).join(" ") || "none"}`,
    );
  if (/^\s*\{\{\d+\}\}|\{\{\d+\}\}\s*$/.test(body)) at("value_at_edge", "a value at the very start or end");
  if (/\}\}\s*\{\{/.test(body)) at("values_side_by_side", "two values side by side");
  if (templateBodyTooLong(body)) at("too_long", "over WhatsApp's 1,024 characters");
  if (/\n[^\S\n]*\n[^\S\n]*\n/.test(body)) at("blank_lines", "more than one blank line in a row");
  const stop = smsStopLine(b.message.language);
  const last = body.trim().split("\n").at(-1)?.trim().replace(/\.$/, "") ?? "";
  if (b.message.category === "marketing" && last !== stop) at("opt_out", `an offer's last line is not "${stop}"`);
  return out;
}

/** An email's own: a subject of its length with no emoji, a body of its length, and no way out of its own. */
function craftEmailIssues(e: { subject: string; body: string }): CraftIssue[] {
  const out: CraftIssue[] = [];
  const at = (code: CraftIssueCode, words: string) => out.push({ channel: "email", code, words });
  if (!e.subject || e.subject.length > EMAIL_SUBJECT_MAX || CRAFT_PICTOGRAPH.test(e.subject))
    at("subject", `a subject under ${EMAIL_SUBJECT_MAX} characters, with no emoji`);
  if (e.body.length > EMAIL_BODY_MAX) at("too_long", `over ${EMAIL_BODY_MAX} characters`);
  if (/\n[^\S\n]*\n[^\S\n]*\n/.test(e.body)) at("blank_lines", "more than one blank line in a row");
  if (CRAFT_UNSUBSCRIBE.test(e.body) || CRAFT_STOP.test(e.body))
    at("stop_written", "a way out of its own: the sender's foot says it");
  return out;
}

/** A text's own: the parts it takes, its values filled and the STOP line in, and no STOP of its own. */
function craftTextIssues(body: string, b: MessageBrief): CraftIssue[] {
  const out: CraftIssue[] = [];
  const at = (code: CraftIssueCode, words: string) => out.push({ channel: "sms", code, words });
  const parts = smsSegments(textAsSent(body, b)).segments;
  const allowed = textPartsAllowed(b.message.language);
  if (parts > allowed) at("text_parts", `${parts} parts with its values and the STOP line; at most ${allowed}`);
  if (CRAFT_STOP.test(body)) at("stop_written", "STOP written in: the sender adds it");
  return out;
}

/**
 * Everything wrong with what the writer wrote, by channel, in the card's order: a version the draft has and the writer
 * left empty, values other than the card's (WhatsApp's every one; the others none it does not have), braces that are
 * not a value, each channel's own rules, and, for every version, anything beyond the draft. A utility message that names
 * a price or money promotes, whatever the draft said. Empty when the words may go on the card.
 */
export function messageCraftIssues(
  v: CraftVersions,
  b: MessageBrief,
  missing: readonly CraftChannel[] = [],
): CraftIssue[] {
  const out: CraftIssue[] = missing.map((c) => ({ channel: c, code: "missing" as const, words: "left empty" }));
  const draft = craftAllWords(b.message.draft);
  const n = b.message.values.length;
  for (const c of CRAFT_CHANNELS) {
    const text = craftWordsOf(v, c);
    if (!text) continue;
    const outside = placeholdersOf(text).filter((p) => p < 1 || p > n);
    if (c !== "whatsapp" && outside.length)
      out.push({
        channel: c,
        code: "values",
        words: `values it was not given: ${outside.map((p) => `{{${p}}}`).join(" ")}`,
      });
    if (/[{}]/.test(craftWithoutSlots(text)))
      out.push({ channel: c, code: "braces", words: "braces that are not a value" });
    if (c === "whatsapp" && v.whatsapp) out.push(...craftWhatsappIssues(v.whatsapp.body, b));
    if (c === "email" && v.email) out.push(...craftEmailIssues(v.email));
    if (c === "sms" && v.sms) out.push(...craftTextIssues(v.sms.body, b));
    if (
      b.message.category === "utility" &&
      (priceFigures(text).length > 0 || namesMoney(text) || CRAFT_FREE.test(text))
    )
      out.push({ channel: c, code: "promotes", words: "a price, a discount or a free thing in a utility message" });
    out.push(...craftBeyondDraft(c, text, draft, b));
  }
  return out;
}
