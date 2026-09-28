/**
 * A message as a customer would read it: a starter's slots, or a saved template's, filled with the business's own
 * name and booking link, a blank for what it has not given, and the sample for anything else. What kind each slot
 * is and what it is called are template-slots.ts.
 */
import { starterText } from "./starter-lookup";
import type { StarterTemplate } from "./starter-templates";
import { defaultSlotKinds, slotLabels, type VariableLike } from "./template-slots";

function fill(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (m, n) => values[Number(n) - 1] ?? m);
}

/** What a business says about itself, for the slots that name it. */
export interface OwnFacts {
  business_name?: string | null;
  booking_link?: string | null;
}

/** The slots that name the business, and what a blank one is called when there is no label of its own. */
const OWN_SLOT_LABEL: ReadonlyMap<string, string> = new Map([
  ["business_name", "Business name"],
  ["booking_link", "Booking link"],
]);

/**
 * A slot's words for a customer's eyes. A slot that names the business takes
 * its own name or booking link, and one the business has not given yet is a
 * blank to fill, "[Booking link]" -- never the sample filed with Meta: a
 * starter's "Luna Studio" and its booksy link read as a real business's real
 * link. Any other slot shows its example; "Dani" is plainly a sample customer.
 */
function slotWords(kind: string | undefined, label: string, example: string | null, own: OwnFacts): string | null {
  if (kind && OWN_SLOT_LABEL.has(kind)) {
    const given = own[kind as keyof OwnFacts];
    return typeof given === "string" && given.trim() ? given : `[${label}]`;
  }
  return example;
}

/**
 * One filled value per slot, in order -- the words alone, before they are put
 * back into the body. A preview that draws the message as a chat marks what
 * fills per person, and it cannot mark anything once the values have been
 * substituted into a string, so the values are decided here and the two
 * preview functions below are the same thing joined up.
 */
export function starterPreviewValues(
  s: StarterTemplate,
  language: string,
  businessName?: string | null,
  bookingLink?: string | null,
): string[] {
  const t = starterText(s, language);
  const own: OwnFacts = { business_name: businessName, booking_link: bookingLink };
  return t.slots.map((x) => slotWords(x.kind, x.label, x.example, own) ?? x.example);
}

/** The message as a customer would read it: the business's own name and booking link, and a blank for what it has not given. */
export function starterPreview(
  s: StarterTemplate,
  language: string,
  businessName?: string | null,
  bookingLink?: string | null,
): string {
  return fill(starterText(s, language).body, starterPreviewValues(s, language, businessName, bookingLink));
}

/**
 * A saved template as a customer would read it, from the row as the sync keeps
 * it: a position, a label, the example filed with Meta -- and no kind. The kind
 * is a starter's own, known by its name, else a guess from the label and the
 * example (defaultSlotKinds), and the words follow slotWords. A slot with
 * nothing to show stays a slot.
 */
export function templatePreviewValues(
  t: { name: string; language?: string | null; body_preview: string | null; variables: unknown },
  own: OwnFacts = {},
): string[] {
  const vars = Array.isArray(t.variables) ? (t.variables as VariableLike[]) : [];
  const kinds = defaultSlotKinds(t);
  const labels = slotLabels(t);
  const values: string[] = [];
  vars.forEach((v, i) => {
    const at = typeof v?.position === "number" && v.position >= 1 ? v.position - 1 : i;
    const kind = kinds[i];
    const label =
      labels[i] && !/^Value [0-9]+$/.test(labels[i]) ? labels[i] : (OWN_SLOT_LABEL.get(kind) ?? `Value ${at + 1}`);
    const words = slotWords(kind, label, typeof v?.example === "string" && v.example ? v.example : null, own);
    if (words !== null) values[at] = words;
  });
  return values;
}

export function templatePreview(
  t: { name: string; language?: string | null; body_preview: string | null; variables: unknown },
  own: OwnFacts = {},
): string {
  return fill(String(t.body_preview ?? ""), templatePreviewValues(t, own));
}
