/**
 * What the Inbox may send to one person: the approved templates it offers and why the rest are not offered, the
 * slots it fills for a template, and the first slot it cannot fill by itself. A slot's kind and its label are
 * template-slots.ts.
 */
import { purposeOfTemplate } from "../consent/consent";
import { languageWords } from "./message-languages";
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

/**
 * The approved templates the Inbox can send to one person, in the owner's words, and why the rest are not offered.
 * The reply route fills a template's own slots and turns away one with words to write (slotToWrite, I6), and sends
 * a promotion only to someone who said yes to offers (core reply.ts), so the composer offered templates it would
 * refuse: a button whose only outcome was a refusal (I4). The same two judgements, asked before anything is pressed.
 */
export function inboxTemplates<T extends InboxTemplateLike>(
  templates: readonly T[],
  to: { who: string; offersOk: boolean },
): { sendable: Array<{ template: T; title: string; label: string }>; hidden: string | null } {
  const sendable: Array<{ template: T; title: string; label: string }> = [];
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
    const title = templateTitle(t.name, t.title);
    sendable.push({ template: t, title, label: `${title} · ${languageWords(t.language)}` });
  }
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
