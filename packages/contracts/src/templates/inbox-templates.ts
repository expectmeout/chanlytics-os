/**
 * What the Inbox may send to one person: the approved templates it offers and why the rest are not offered, the
 * slots it fills for a template, and the first slot it cannot fill by itself. A slot's kind and its label are
 * template-slots.ts.
 */
import { purposeOfTemplate } from "../consent/consent";
import { languageWords } from "./message-languages";
import { templateBlocked } from "./template-parts";
import { languageBase, languageLabel } from "./template-languages";
import { TEMPLATE_STATUS_WORDS, type ParamSourceKind, type ParamSpec } from "./templates";
import { defaultParamSpecs, slotLabels } from "./template-slots";
import { templateTitle } from "./template-titles";
import { starterByName } from "./starter-lookup";

/** The slots the Inbox fills from what it holds of the person and the workspace (core reply.ts shapeTemplate). */
const INBOX_FILLS: ReadonlySet<ParamSourceKind> = new Set(["first_name", "business_name", "booking_link"]);

/** An approved template as the Inbox composer is given it (GET templates). */
export interface InboxTemplateLike {
  id: string;
  name: string;
  language: string;
  category?: string | null;
  variables?: unknown;
  title?: string | null;
  /** Why this product cannot send it, as the reader answers (templateBlocked); null when it can. */
  blocked?: string | null;
  /** Or the components Meta holds, for a reader that did not work it out. */
  components?: unknown;
}

/** A title without the language it already ends with: "Bienvenida (Spanish)" in Spanish is "Bienvenida". */
function titleWithoutLanguage(title: string, code: string): string {
  for (const words of [languageLabel(code), languageWords(code)]) {
    const tail = ` (${words})`;
    if (title.length > tail.length && title.toLowerCase().endsWith(tail.toLowerCase())) {
      return title.slice(0, title.length - tail.length).trimEnd();
    }
  }
  return title;
}

/**
 * The approved templates the Inbox can send to one person, in the owner's words, and why the rest are not offered.
 * The reply route fills a template's own slots and turns away one with words to write (slotToWrite, I6), and sends
 * a promotion only to someone who said yes to offers (core reply.ts), so the composer offered templates it would
 * refuse: a button whose only outcome was a refusal (I4). The same two judgements, asked before anything is pressed,
 * and a third: a message WhatsApp approved that this product cannot put on the wire whole (a picture for a heading, a
 * button that takes a value: templateBlocked) is not offered either, and the one sentence says so.
 *
 * A message is offered once, by its title: one in several languages is several rows (Meta files a name and a language),
 * and a person choosing what to send does not choose a language -- the first of its rows is the default, the product's
 * own (English) where it has one, a message with one comes before a message without, and the words say a language
 * only where two entries would otherwise read alike. A
 * title that already ends with its language ("Bienvenida (Spanish)") loses it: the row says what language it is.
 * `hidden` is the sentence that says what was kept back, and why.
 */
export function inboxTemplates<T extends InboxTemplateLike>(
  templates: readonly T[],
  to: {
    who: string;
    offersOk: boolean;
    /** Their visit as People knows it: one ahead, one behind, or none known. A message for after a visit waits while one is ahead. */
    visit?: "ahead" | "behind" | null;
  },
): {
  sendable: Array<{ template: T; title: string; label: string; blank: InboxBlank | null; fits: boolean }>;
  hidden: string | null;
} {
  const rows: Array<{ template: T; title: string; blank: InboxBlank | null; fits: boolean }> = [];
  let promotions = 0;
  let unfillable = 0;
  let afterVisit = 0;
  const refused: string[] = [];
  for (const t of templates) {
    // WhatsApp would refuse it for every send, whoever it is to: asked first, so its reason is not hidden behind another.
    const blocked = templateBlocked(t);
    if (blocked) {
      refused.push(blocked);
      continue;
    }
    // The reply route's own reading of the slots: the Inbox fills the person's and the business's facts, and asks the
    // member for one blank of words (inboxBlankOf: "The note"); a template that needs anything else is not offered (I6).
    const blank = inboxBlankOf(t);
    if (!blank && slotToWrite(t)) {
      unfillable += 1;
      continue;
    }
    if (purposeOfTemplate(t.category) === "marketing" && !to.offersOk) {
      promotions += 1;
      continue;
    }
    // A message for after a visit ("thanks for coming in yesterday") reads wrong to someone whose visit is still ahead:
    // "How did it go" stood first in the reply box under a price question two days before the visit (16 Oct 2026).
    const starter = starterByName(t.name);
    const trigger = starter?.trigger ?? null;
    if (trigger === "visited" && to.visit === "ahead") {
      afterVisit += 1;
      continue;
    }
    // What fits now comes first: a note whose words the member writes answers anything ("A quick note", a starter for no
    // moment), and a visit's reminder fits a visit ahead. A blank on any other message is a fact of it (a visit's time).
    const fits = (!!blank && !!starter && trigger === null) || (trigger === "visit_tomorrow" && to.visit === "ahead");
    rows.push({ template: t, title: titleWithoutLanguage(templateTitle(t.name, t.title), t.language), blank, fits });
  }
  // One message's rows stand together, its default language first, and the messages that have one before those that
  // have not (nothing says what language this person reads, so the product's own is the first to offer); each keeps the
  // order it came in.
  const isDefault = (r: { template: T }) => languageBase(r.template.language) === "en";
  const named = [...new Set(rows.map((r) => r.template.name))];
  const inDefault = (name: string) => rows.some((r) => r.template.name === name && isDefault(r));
  const names = [...named.filter(inDefault), ...named.filter((name) => !inDefault(name))];
  const byName = names.flatMap((name) => {
    const own = rows.filter((r) => r.template.name === name);
    return [...own.filter(isDefault), ...own.filter((r) => !isDefault(r))];
  });
  // What fits first, each keeping that order: the reply box opens on the first.
  const ordered = [...byName.filter((r) => r.fits), ...byName.filter((r) => !r.fits)];
  const reads = (title: string) => ordered.filter((r) => r.title === title).length;
  const sendable = ordered.map((r) => ({
    template: r.template,
    title: r.title,
    label: reads(r.title) > 1 ? `${r.title} · ${languageWords(r.template.language)}` : r.title,
    blank: r.blank,
    fits: r.fits,
  }));
  const held = [
    refused.length ? `${refused.length} that WhatsApp would refuse (${[...new Set(refused)].join(", ")})` : "",
    promotions ? `${promotions} promotion${promotions === 1 ? "" : "s"} (${to.who} hasn't said yes to offers)` : "",
    unfillable ? `${unfillable} that ${unfillable === 1 ? "needs" : "need"} words the Inbox doesn't ask for` : "",
    afterVisit ? `${afterVisit} for afterwards (${to.who}'s booking is ahead)` : "",
  ].filter(Boolean);
  // "a, b and c": two read as they always did, "a and b".
  const said = held.length > 1 ? `${held.slice(0, -1).join(", ")} and ${held[held.length - 1]}` : held[0];
  return { sendable, hidden: held.length ? `Not offered: ${said}.` : null };
}

/**
 * Whether a picker may offer a row: approved, and not hidden by the workspace. The one statement of it. The templates
 * reader keeps the rows it is true of for the composers (and counts the rest, templateHolds), and the pages that draw their
 * pickers from the settings read, which holds every row and is the one read of the templates, judge the same rows by it.
 */
export function templateOffered(t: { meta_status?: string | null; hidden_at?: string | null }): boolean {
  return t.meta_status === "approved" && !t.hidden_at;
}

/**
 * The WhatsApp messages the composers cannot offer, counted by why: not approved yet, refused, paused or disabled by
 * WhatsApp, or hidden by the workspace. The templates read answers it beside the approved rows, so an empty picker can
 * say why it is empty (noTemplateWords).
 */
export interface TemplateHolds {
  pending: number;
  rejected: number;
  paused: number;
  disabled: number;
  hidden: number;
}

/**
 * The holds on the rows the composers' read left out (approved and not hidden is what it offers, and the read says which
 * rows it left out, so there is one statement of that): each WhatsApp row by its status, or hidden where it was approved
 * and the workspace hid it. A row of another channel is not WhatsApp's to hold.
 */
export function templateHolds(
  left: readonly { channel?: string | null; meta_status?: string | null }[],
): TemplateHolds {
  const out: TemplateHolds = { pending: 0, rejected: 0, paused: 0, disabled: 0, hidden: 0 };
  for (const t of left) {
    if (t.channel !== "whatsapp") continue;
    const status = t.meta_status;
    if (status === "pending" || status === "rejected" || status === "paused" || status === "disabled") out[status] += 1;
    else if (status === "approved") out.hidden += 1;
  }
  return out;
}

/** A status WhatsApp put on a version, as the picker says why a message is not offered: the Library's own word for it, lower case (TEMPLATE_STATUS_WORDS). */
const byWhatsApp = (status: "rejected" | "paused" | "disabled"): string =>
  `${TEMPLATE_STATUS_WORDS[status].toLowerCase()} by WhatsApp`;

const templateHoldWords = (): Array<[keyof TemplateHolds, string]> => [
  ["pending", "waiting for WhatsApp to review"],
  ["rejected", byWhatsApp("rejected")],
  ["paused", byWhatsApp("paused")],
  ["disabled", byWhatsApp("disabled")],
  ["hidden", "hidden by you"],
];

/**
 * What the Inbox composer says where no message is approved for WhatsApp, and why, when the read knows: "No approved
 * template yet (2 waiting for WhatsApp to review, 1 refused by WhatsApp) -- nothing can be sent until one is." It said
 * only "none yet" over a workspace whose messages were all waiting, refused or paused, which is the owner's cue to go
 * to a different place for each. With nothing counted (the read does not say, or the workspace has none at all) it is
 * the plain sentence.
 */
export function noTemplateWords(held: Partial<TemplateHolds> | null | undefined): string {
  const parts = templateHoldWords().flatMap(([key, words]) => {
    const n = held?.[key] ?? 0;
    return n > 0 ? [`${n} ${words}`] : [];
  });
  return `No approved template yet${parts.length ? ` (${parts.join(", ")})` : ""} — nothing can be sent until one is.`;
}

/**
 * The slots the Inbox fills for a template, the way broadcasts and the assistant fill them (defaultParamSpecs): a
 * starter's own, else a guess per recorded slot. A template whose slots the sync never recorded keeps the two the
 * Inbox always sent, the business name and the booking link (I6).
 */
export function inboxSlots(t: { name: string; variables?: unknown }): ParamSpec[] {
  return Array.isArray(t.variables)
    ? defaultParamSpecs({ name: t.name, variables: t.variables })
    : [{ kind: "business_name" }, { kind: "booking_link" }];
}

/**
 * The first slot of a template the Inbox cannot fill by itself -- words to write, a visit's time or its service, a
 * proposal's or a review's link -- by its label; null when every slot is a fact the Inbox has: the first name, the
 * business name, the booking link. The reply route refuses such a template in these words, and the composer does not
 * offer it (I6).
 */
export function slotToWrite(t: { name: string; language?: string | null; variables?: unknown }): string | null {
  const at = inboxSlots(t).findIndex((s) => !INBOX_FILLS.has(s.kind));
  if (at < 0) return null;
  return slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables })[at] ?? `Value ${at + 1}`;
}

/**
 * The one blank of a template that the Inbox asks a member to write: its place among the template's slots, what it is
 * called ("The note") and its example. A template whose only slot the Inbox cannot fill by itself is words to write
 * (the starters' "A quick note") has one; any other has none (inboxBlankOf).
 */
export interface InboxBlank {
  at: number;
  label: string;
  example: string | null;
}

/**
 * The longest a member's words in a template's blank may be: a sentence or two, the length of "A quick note"'s own note,
 * where WhatsApp would take a thousand. The reply route refuses longer.
 */
export const TEMPLATE_WORDS_MAX = 300;

/**
 * A member's words for a template's blank, as WhatsApp takes a value: one line, its spaces single (Meta refuses a value
 * with a line break, a tab or four spaces in a row). Empty where nothing is left. The reply box and the reply route say
 * it the same way, so what the box shows is what is sent.
 */
export function templateWords(words: string | null | undefined): string {
  return (words ?? "").replace(/\s+/g, " ").trim();
}

/**
 * The blank the Inbox asks a member to fill, where a template has exactly one slot it cannot fill by itself and that slot
 * is words to write; null for any other template. The facts it fills (the first name, the business name, the booking
 * link) stay the server's, so the browser never chooses a link that reaches a phone (core reply.ts shapeTemplate): the
 * one value a member gives is their own words, which they could have written in the window anyway.
 */
export function inboxBlankOf(t: { name: string; language?: string | null; variables?: unknown }): InboxBlank | null {
  const slots = inboxSlots(t);
  const open = slots.flatMap((s, at) => (INBOX_FILLS.has(s.kind) ? [] : [{ s, at }]));
  const only = open.length === 1 ? open[0] : undefined;
  if (!only || only.s.kind !== "text" || only.s.value) return null;
  const labels = slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables });
  const vars = Array.isArray(t.variables) ? (t.variables as Array<{ example?: unknown }>) : [];
  const example = vars[only.at]?.example;
  return {
    at: only.at,
    label: labels[only.at] ?? `Value ${only.at + 1}`,
    example: typeof example === "string" && example.trim() ? example.trim() : null,
  };
}

/** A part of a template's words as the reply box draws them: the template's own words, or its blank, by its label. */
export type TemplatePart = { words: string; blank?: undefined } | { blank: string; words?: undefined };

/**
 * A template's words as this person would read them, in parts: each slot filled the way the reply route fills it (their
 * first name, the business's name and booking link, "[Booking link]" where none is given), and the blank the member
 * writes left as a part of its own, so the reply box can draw it in the sentence (the phone thread's canvas, C1). Where
 * the template's text was never read, no words, and its blank alone where it has one: the send refuses without it.
 */
export function inboxTemplateParts(
  t: { name: string; language?: string | null; body_preview: string | null; variables?: unknown },
  facts: { firstName: string | null; businessName: string | null; bookingLink: string | null },
): TemplatePart[] {
  const body = String(t.body_preview ?? "");
  const blank = inboxBlankOf(t);
  if (!body) return blank ? [{ blank: blank.label }] : [];
  const slots = inboxSlots(t);
  const labels = slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables });
  const vars = Array.isArray(t.variables) ? (t.variables as Array<{ position?: unknown }>) : [];
  // A slot's place in the words: the variable's own position where it says one, else its order.
  const valueAt = new Map<number, TemplatePart>();
  slots.forEach((s, i) => {
    const given = vars[i]?.position;
    const pos = typeof given === "number" ? given : i + 1;
    const label = labels[i] ?? `Value ${i + 1}`;
    const words =
      s.kind === "first_name"
        ? facts.firstName || "there"
        : s.kind === "business_name"
          ? facts.businessName || `[${label}]`
          : s.kind === "booking_link"
            ? facts.bookingLink?.replace(/^https?:[/][/]/, "") || `[${label}]`
            : s.kind === "text" && s.value
              ? s.value
              : null;
    valueAt.set(pos, blank && i === blank.at ? { blank: blank.label } : { words: words ?? `[${label}]` });
  });
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const m of body.matchAll(/\{\{(\d+)\}\}/g)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ words: body.slice(last, at) });
    parts.push(valueAt.get(Number(m[1])) ?? { words: m[0] });
    last = at + m[0].length;
  }
  if (last < body.length) parts.push({ words: body.slice(last) });
  // A blank whose place the words never show (a preview read before its slots were): its words go after them, so the box
  // always has somewhere to write what the send refuses without.
  if (blank && !parts.some((part) => part.blank !== undefined)) parts.push({ words: " " }, { blank: blank.label });
  return parts;
}
