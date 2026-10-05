/**
 * What the Inbox may send to one person: the approved templates it offers and why the rest are not offered, the
 * slots it fills for a template, and the first slot it cannot fill by itself. A slot's kind and its label are
 * template-slots.ts.
 */
import { purposeOfTemplate } from "../consent/consent";
import { languageWords } from "./message-languages";
import { languageBase, languageLabel } from "./template-languages";
import type { ParamSpec } from "./templates";
import { defaultParamSpecs, slotLabels } from "./template-slots";
import { templateTitle } from "./template-titles";

/** An approved template as the Inbox composer is given it (GET templates). */
export interface InboxTemplateLike {
  id: string;
  name: string;
  language: string;
  category?: string | null;
  variables?: unknown;
  title?: string | null;
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
 * refuse: a button whose only outcome was a refusal (I4). The same two judgements, asked before anything is pressed.
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
  to: { who: string; offersOk: boolean },
): { sendable: Array<{ template: T; title: string; label: string }>; hidden: string | null } {
  const rows: Array<{ template: T; title: string }> = [];
  let promotions = 0;
  let unfillable = 0;
  for (const t of templates) {
    // The reply route's own reading of the slots: words to write are what the Inbox does not ask for. It counted
    // slots, and turned away any template with other than two -- the workspace's starters among them (I6).
    if (slotToWrite(t)) {
      unfillable += 1;
      continue;
    }
    if (purposeOfTemplate(t.category) === "marketing" && !to.offersOk) {
      promotions += 1;
      continue;
    }
    rows.push({ template: t, title: titleWithoutLanguage(templateTitle(t.name, t.title), t.language) });
  }
  // One message's rows stand together, its default language first, and the messages that have one before those that
  // have not (nothing says what language this person reads, so the product's own is the first to offer); each keeps the
  // order it came in.
  const isDefault = (r: { template: T }) => languageBase(r.template.language) === "en";
  const named = [...new Set(rows.map((r) => r.template.name))];
  const inDefault = (name: string) => rows.some((r) => r.template.name === name && isDefault(r));
  const names = [...named.filter(inDefault), ...named.filter((name) => !inDefault(name))];
  const ordered = names.flatMap((name) => {
    const own = rows.filter((r) => r.template.name === name);
    return [...own.filter(isDefault), ...own.filter((r) => !isDefault(r))];
  });
  const reads = (title: string) => ordered.filter((r) => r.title === title).length;
  const sendable = ordered.map((r) => ({
    template: r.template,
    title: r.title,
    label: reads(r.title) > 1 ? `${r.title} · ${languageWords(r.template.language)}` : r.title,
  }));
  const held = [
    promotions ? `${promotions} promotion${promotions === 1 ? "" : "s"} (${to.who} hasn't said yes to offers)` : "",
    unfillable ? `${unfillable} that ${unfillable === 1 ? "needs" : "need"} words the Inbox doesn't ask for` : "",
  ].filter(Boolean);
  return { sendable, hidden: held.length ? `Not offered: ${held.join(" and ")}.` : null };
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
 * The first slot of a template the Inbox cannot fill by itself -- words to write, a visit's time or its service --
 * by its label; null when every slot is a fact the Inbox has: the first name, the business name, the booking link.
 * The reply route refuses such a template in these words, and the composer does not offer it (I6).
 */
export function slotToWrite(t: { name: string; language?: string | null; variables?: unknown }): string | null {
  const at = inboxSlots(t).findIndex(
    (s) => s.kind === "text" || s.kind === "visit_when" || s.kind === "visit_service" || s.kind === "proposal_link",
  );
  if (at < 0) return null;
  return slotLabels({ name: t.name, language: t.language ?? "en_US", variables: t.variables })[at] ?? `Value ${at + 1}`;
}
