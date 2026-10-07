/**
 * A starter found by its name, its key or its moment, the set a workspace is offered, and a starter's text and the
 * draft the submit route takes, in a language. The set itself is starter-templates.ts.
 */
import { triggerOf, triggerOffered, type PlaybookTrigger } from "../playbooks/playbook-triggers";
import { STARTER_TEMPLATES, type StarterTemplate, type StarterText } from "./starter-templates";

export function starterByName(name: string | null | undefined): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.name === name) ?? null;
}

export function starterByKey(key: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((s) => s.key === key) ?? null;
}

/**
 * A moment that sends another moment's starter. Lapsed is the win-back by visits, and the win-back's words ("it's been
 * a while since we last saw you") are already about a visit: one message, filed with Meta once. One of the workspace's
 * own lists has no starter of its own -- what it sends is the owner's choice.
 */
const STARTER_OF: Partial<Record<string, PlaybookTrigger>> = { lapsed: "quiet_30" };

/**
 * The starter set a workspace is offered (0006): each starter not retired whose moment is offered here
 * (triggerOffered), so a workspace where deals are off is never offered the proposal follow-up, nor has it filed with
 * WhatsApp for it, and no workspace is offered a starter the set replaced (2 Oct 2026).
 */
export function startersOffered(dealsOn: boolean): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((s) => {
    if (s.retired) return false;
    const t = s.trigger ? triggerOf(s.trigger) : null;
    return !t || triggerOffered(t, dealsOn);
  });
}

/**
 * The starter written for a moment: the set's own, else the one it replaced. A moment no longer offered for a new
 * playbook (Welcome, Save our number) still finds the starter it was made with.
 */
export function starterForTrigger(trigger: string | null | undefined): StarterTemplate | null {
  return startersForTrigger(trigger)[0] ?? null;
}

/**
 * Every starter written for a moment: the set's own first, then the ones it replaced, which a workspace that added them
 * before 2 Oct 2026 still holds and still sends. A composer opens on the first the workspace holds, a playbook sending
 * any of them is named for its moment alone, and Ask proposes the first that is approved.
 */
export function startersForTrigger(trigger: string | null | undefined): StarterTemplate[] {
  if (!trigger) return [];
  const own = STARTER_OF[trigger] ?? trigger;
  const all = STARTER_TEMPLATES.filter((s) => s.trigger === own);
  return [...all.filter((s) => !s.retired), ...all.filter((s) => s.retired)];
}

/** The text version in a language, English when the language is not written; null when the starter has none. */
export function starterSmsText(s: StarterTemplate, language: string): { body: string } | null {
  return s.sms?.[language] ?? s.sms?.en_US ?? null;
}

/** The email version in a language, English when the language is not written; null when the starter has none. */
export function starterEmailText(s: StarterTemplate, language: string): { subject: string; body: string } | null {
  return s.email?.[language] ?? s.email?.en_US ?? null;
}

/** The text in a language, English when the language is not written. */
export function starterText(s: StarterTemplate, language: string): StarterText {
  return s.texts[language] ?? s.texts.en_US;
}

/** What the submit route takes: the same shape a template written by hand has. */
export function starterDraft(
  s: StarterTemplate,
  language: string,
): { name: string; language: string; category: string; body: string; footer: string | null; examples: string[] } {
  const t = starterText(s, language);
  return {
    name: s.name,
    language,
    category: s.category,
    body: t.body,
    footer: t.footer,
    examples: t.slots.map((x) => x.example),
  };
}
