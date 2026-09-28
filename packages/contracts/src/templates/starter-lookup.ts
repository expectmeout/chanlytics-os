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
 * The starter set a workspace is offered (0006): each starter whose moment is offered here (triggerOffered), so a
 * workspace where deals are off is never offered the proposal follow-up, nor has it filed with WhatsApp for it.
 */
export function startersOffered(dealsOn: boolean): StarterTemplate[] {
  return STARTER_TEMPLATES.filter((s) => {
    const t = s.trigger ? triggerOf(s.trigger) : null;
    return !t || triggerOffered(t, dealsOn);
  });
}

export function starterForTrigger(trigger: string | null | undefined): StarterTemplate | null {
  if (!trigger) return null;
  const own = STARTER_OF[trigger] ?? trigger;
  return STARTER_TEMPLATES.find((s) => s.trigger === own) ?? null;
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
