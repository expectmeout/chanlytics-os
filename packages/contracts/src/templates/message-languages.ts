/**
 * A message's languages as people read them: a code's words, the labels of a set of rows, the choices its one
 * picker offers, and whether Chanlytics can write it in another. WhatsApp's own list is template-languages.ts.
 */
import {
  WHATSAPP_LANGUAGES,
  languageLabel,
  languageName,
  templateLanguage,
  type TemplateLanguage,
} from "./template-languages";

/**
 * A language code as people read it: "en_US" is "English", "es" is "Spanish";
 * the code itself where nothing can say. WhatsApp's own list first
 * (template-languages.ts), so the word a send names is the word the picker
 * offered.
 */
export function languageWords(code: string): string {
  return languageName(code);
}

/**
 * The languages of a set of rows, each with the words a person reads.
 *
 * `languageWords` strips the region, so "en_US" and "en" both read "English" --
 * and a workspace holding both would see one chip offering the same word twice.
 * Where two codes would read alike, each says its place as WhatsApp's list
 * spells it ("English" beside "English (US)"), or its own code where the list
 * does not know it; where they do not, the word stands alone.
 */
export function languageLabels(codes: readonly string[]): Record<string, string> {
  const seen = new Map<string, number>();
  for (const c of codes) {
    const w = languageWords(c);
    seen.set(w, (seen.get(w) ?? 0) + 1);
  }
  const out: Record<string, string> = {};
  for (const c of codes) {
    const w = languageWords(c);
    out[c] = (seen.get(w) ?? 0) > 1 ? (templateLanguage(c) ? languageLabel(c) : `${w} (${c})`) : w;
  }
  return out;
}

/* ---- A message's languages, as its one picker offers them ---- */

export type LanguageGroup = "on" | "ready" | "add";

/** The picker's headings: what WhatsApp holds, what the library has written, what Chanlytics can write. */
export const LANGUAGE_GROUP_WORDS: Readonly<Record<LanguageGroup, string>> = {
  on: "On WhatsApp",
  ready: "Ready to add",
  add: "Translate into",
};

export interface LanguageChoice extends TemplateLanguage {
  group: LanguageGroup;
  /**
   * Its status at WhatsApp, drawn as the glyph: a status for a language on
   * file, null for one the library has written and WhatsApp has never seen.
   * Absent for a language nobody has written yet, which has nothing to draw.
   */
  status?: string | null;
}

/**
 * Every language a message can be read in or given, as its picker lists them.
 *
 * A row per language used to sit on the message's line -- "EN ES" -- a slot
 * for each language the workspace answered in, so a page of sixteen messages
 * was sixteen pairs of letters, and a seventh language would have been a
 * seventh column. One chip says the language in view; this is what it opens:
 *
 *   on     the languages WhatsApp holds, each with its status
 *   ready  the ones the starter library has written that the workspace never added
 *   add    every other language WhatsApp takes, when the owner may add one and
 *          Chanlytics can carry the message whole (templateUntranslatable)
 *
 * A code WhatsApp does not list -- a row synced from elsewhere -- is still the
 * message's, and is offered under its own code.
 */
export function messageLanguageChoices(input: {
  onFile: readonly { language: string; meta_status?: string | null }[];
  ready?: readonly string[];
  canAdd?: boolean;
}): LanguageChoice[] {
  const seen = new Set<string>();
  const out: LanguageChoice[] = [];
  const known = (code: string): TemplateLanguage =>
    templateLanguage(code) ?? {
      id: code,
      label: languageLabel(code),
      name: languageName(code),
      region: null,
      native: languageLabel(code),
    };
  for (const r of input.onFile) {
    if (seen.has(r.language)) continue;
    seen.add(r.language);
    out.push({ ...known(r.language), id: r.language, group: "on", status: r.meta_status ?? "approved" });
  }
  for (const code of input.ready ?? []) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({ ...known(code), id: code, group: "ready", status: null });
  }
  if (input.canAdd) {
    for (const l of WHATSAPP_LANGUAGES) {
      if (seen.has(l.id)) continue;
      out.push({ ...l, group: "add" });
    }
  }
  return out;
}

/**
 * Why Chanlytics cannot write this message in another language, in the
 * owner's words; null when it can.
 *
 * It writes what the create route files (templateComponents): the words, a
 * footer and one button that opens a link. A message with a heading, or any
 * other button, would lose it in the new language -- a different message
 * under the same name, which is the one thing a translation must not be.
 */
export function templateUntranslatable(t: {
  header?: string | null;
  buttons?: readonly { kind: string }[] | null;
  blocked?: string | null;
  category?: string | null;
}): string | null {
  if (t.blocked) return `it has ${t.blocked}`;
  if (t.category && !/^(marketing|utility)$/i.test(t.category))
    return `WhatsApp files it as ${String(t.category).toLowerCase()}`;
  if (t.header) return "it has a heading";
  const buttons = t.buttons ?? [];
  if (buttons.length > 1) return "it has more than one button";
  const b = buttons[0];
  if (b && b.kind !== "url") return b.kind === "reply" ? "it has a reply button" : "it has a button that calls";
  return null;
}
