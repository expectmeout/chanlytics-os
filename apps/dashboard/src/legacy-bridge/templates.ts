/**
 * Templates, the verbs: `window.__templates` — sync from Meta, draft one
 * with the assistant, submit one to Meta, delete one.
 *
 * Every write goes through the typed client, and after it lands the refresh
 * map re-reads the surfaces that show templates: Settings (every template
 * with its status), the Inbox (the approved ones the composer may send) and,
 * through their hooks, Broadcasts (the approved ones a broadcast may pick)
 * and Playbooks (a playbook picks its trigger's starter the moment it is
 * approved). A draft is a read and refreshes nothing. Owner or operator on
 * the server; a viewer's click returns the server's refusal.
 */
import { api } from "./api";
import { PARAM_SOURCE_LABELS, STARTER_LANGUAGES, STARTER_TEMPLATES, compareTemplates, defaultSlotKinds, defaultTemplate, languageWords, playbooksStillSending, slotLabels, starterByName, starterForTrigger, starterPreview, starterPreviewValues, starterText, templatePreview, templatePreviewValues, templateTitle } from "@chanlytics/contracts";

export interface DraftBody { brief: string; category: "marketing" | "utility"; language: string }
export interface CreateBody { name: string; language: string; category: string; body: string; footer: string | null; examples: string[]; labels?: string[] }
export interface StarterBody { keys?: string[]; languages?: string[] }

export const syncTemplates = () => api()("POST templates/sync");

export const templates = {
  sync: syncTemplates,
  draft: (body: DraftBody) => api()("POST templates/draft", { body }),
  create: (body: CreateBody) => api()("POST templates", { body }),
  remove: (id: string) => api()("DELETE templates/[id]", { params: { id } }),
  /** Out of the composers, or back in. The row stays; syncs keep it. */
  hide: (id: string) => api()("PUT templates/[id]", { params: { id }, body: { hidden: true } }),
  /** The workspace's own words for it; null goes back to the name. Meta's name is untouched. */
  rename: (id: string, title: string | null) => api()("PUT templates/[id]", { params: { id }, body: { title } }),
  show: (id: string) => api()("PUT templates/[id]", { params: { id }, body: { hidden: false } }),
  /** The starter set, or some of it, in the languages asked: idempotent, submitted to Meta where new. */
  addStarters: (body: StarterBody) => api()("POST templates/starter", { body }),
};

/**
 * The words for a template: the title the workspace gave it, a starter's,
 * else the name made words. Takes a row, or a name looked up among the
 * workspace's templates (Settings' list, which boots with the app).
 */
export function titleOf(t: string | { name: string; title?: string | null } | null | undefined): string {
  if (!t) return "";
  if (typeof t === "string") {
    const all = (window as unknown as { __TEMPLATES_ALL?: Array<{ name: string; title?: string | null }> | null }).__TEMPLATES_ALL;
    const row = Array.isArray(all) ? all.find((x) => x.name === t) : undefined;
    return templateTitle(t, row?.title ?? null);
  }
  return templateTitle(t.name, t.title ?? null);
}

/** The starter set as the pages read it: the library, and the words and slots for any template. */
export interface StarterLibrary {
  list: typeof STARTER_TEMPLATES;
  languages: typeof STARTER_LANGUAGES;
  byName: typeof starterByName;
  forTrigger: typeof starterForTrigger;
  text: typeof starterText;
  preview: typeof starterPreview;
  /** A saved row as a customer reads it: this business's name and booking link in the slots that name it. */
  rowPreview: typeof templatePreview;
  /** The same words, one per slot and not yet put back into the body: a preview
      that draws a chat marks what fills per person, and a string cannot be marked. */
  rowValues: typeof templatePreviewValues;
  starterValues: typeof starterPreviewValues;
  title: typeof titleOf;
  slotKinds: typeof defaultSlotKinds;
  slotLabels: typeof slotLabels;
  compare: typeof compareTemplates;
  defaultFor: typeof defaultTemplate;
  /** What fills a slot, in the composers' words (contracts PARAM_SOURCE_LABELS): all six, a visit's included. */
  sources: typeof PARAM_SOURCE_LABELS;
  /** Which running playbooks still send a message, in the words the delete route refuses with. */
  stillSends: typeof playbooksStillSending;
  /** A language code as a person reads it ("en_US" -> "English"): a send names the language it goes out in. */
  langWords: typeof languageWords;
}

declare global {
  interface Window {
    __syncTemplates?: typeof syncTemplates;
    __templates?: typeof templates;
    __starters?: StarterLibrary;
  }
}

export function installTemplates(): void {
  window.__syncTemplates = syncTemplates;
  window.__templates = templates;
  window.__starters = {
    list: STARTER_TEMPLATES,
    languages: STARTER_LANGUAGES,
    byName: starterByName,
    forTrigger: starterForTrigger,
    text: starterText,
    preview: starterPreview,
    rowPreview: templatePreview,
    rowValues: templatePreviewValues,
    starterValues: starterPreviewValues,
    title: titleOf,
    slotKinds: defaultSlotKinds,
    slotLabels,
    compare: compareTemplates,
    defaultFor: defaultTemplate,
    sources: PARAM_SOURCE_LABELS,
    stillSends: playbooksStillSending,
    langWords: languageWords,
  };
}
