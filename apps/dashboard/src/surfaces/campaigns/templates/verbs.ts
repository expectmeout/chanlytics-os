/**
 * Templates, the verbs (`templates`, `syncTemplates`, imported by the page) and the starter library the pages read
 * (`starters`): sync from Meta, draft one with the assistant, submit one to Meta, delete one.
 *
 * Every write goes through the typed client, and after it lands the refresh
 * map re-reads the surfaces that show templates: Settings (every template
 * with its status), the Inbox (the approved ones the composer may send) and,
 * through their hooks, Broadcasts (the approved ones a broadcast may pick)
 * and Playbooks (a playbook picks its trigger's starter the moment it is
 * approved). A draft is a read and refreshes nothing. Owner or operator on
 * the server; a viewer's click returns the server's refusal.
 */
import { api } from "@/legacy-bridge/api";
import {
  LANGUAGE_GROUP_WORDS,
  PARAM_SOURCE_HINTS,
  PARAM_SOURCE_LABELS,
  STARTER_LANGUAGES,
  WHATSAPP_LANGUAGES,
  compareTemplates,
  dealsAreOn,
  defaultSlotKinds,
  defaultTemplate,
  findLanguages,
  groupTemplates,
  languageLabel,
  languageTag,
  languageWords,
  messageLanguageChoices,
  playbooksStillSending,
  slotLabels,
  starterByName,
  starterForTrigger,
  starterPreview,
  starterPreviewValues,
  starterText,
  startersOffered,
  sendableTemplates,
  slotChoices,
  templateFooter,
  templatePreview,
  templatePreviewValues,
  templateSlots,
  templateTitle,
  templateUntranslatable,
  type StarterTemplate,
} from "@chanlytics/contracts";

/**
 * A draft from a brief, or a message the workspace has written again in
 * another language: a row on file by its id, or a starter by its key and the
 * library language to write it from.
 */
export type DraftBody =
  | { brief: string; category: "marketing" | "utility"; language: string }
  | { language: string; translate: { id: string } | { starter: string; from?: string } };
export interface CreateBody {
  name: string;
  language: string;
  category: string;
  body: string;
  footer: string | null;
  examples: string[];
  labels?: string[];
  button?: { text: string; url: string } | null;
}
export interface StarterBody {
  keys?: string[];
  languages?: string[];
}

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
    const all = window.__TEMPLATES_ALL;
    const row = Array.isArray(all) ? all.find((x) => x.name === t) : undefined;
    return templateTitle(t, row?.title ?? null);
  }
  return templateTitle(t.name, t.title ?? null);
}

/** The starter set as the pages read it: the library, and the words and slots for any template. */
export interface StarterLibrary {
  /** The starters this workspace is offered (contracts startersOffered): the proposal follow-up's only where deals are on (0006). */
  readonly list: readonly StarterTemplate[];
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
  /** The rows of a picker grouped by the message they are, so one message is one chip. */
  group: typeof groupTemplates;
  defaultFor: typeof defaultTemplate;
  /** What fills a slot, in the composers' words (contracts PARAM_SOURCE_LABELS): all six, a visit's included. */
  sources: typeof PARAM_SOURCE_LABELS;
  /** Where a filled slot's words come from, beside them: "Each person's own". */
  sourceHints: typeof PARAM_SOURCE_HINTS;
  /** What may fill one slot, its default first: a first name only ever each person's own. */
  slotChoices: typeof slotChoices;
  /** The same for every slot of a template on a moment, or null when one can take nothing there. */
  slots: typeof templateSlots;
  /** Which running playbooks still send a message, in the words the delete route refuses with. */
  stillSends: typeof playbooksStillSending;
  /** A language code as a person reads it ("en_US" -> "English"): a send names the language it goes out in. */
  langWords: typeof languageWords;
  /** The same with its place, as the picker lists it: "English (US)". */
  langLabel: typeof languageLabel;
  /** The chip's letters: "EN", or "EN-US" beside another English. */
  langTag: typeof languageTag;
  /** Every language WhatsApp takes a template in. */
  allLanguages: typeof WHATSAPP_LANGUAGES;
  /** The languages a search typed in English, in the language itself, or as a code finds, best first. */
  findLanguages: typeof findLanguages;
  /** What a message's language picker offers, and the headings it groups them under. */
  languageChoices: typeof messageLanguageChoices;
  languageGroups: typeof LANGUAGE_GROUP_WORDS;
  /** Why Chanlytics cannot write a message in another language; null when it can. */
  untranslatable: typeof templateUntranslatable;
  /** The line under a message's words: the one Meta holds, else the starter's own. */
  footer: typeof templateFooter;
  /** What a composer may offer, and one sentence for what it may not. */
  sendable: typeof sendableTemplates;
}

/** How the workspace being viewed says its customers buy (0008), from the list the workspace surface publishes. */
function viewedSellsBy(): string | null {
  return window.__WORKSPACES?.find((t) => t.id === window.__ACTIVE_WORKSPACE)?.sells_by ?? null;
}

declare global {
  interface Window {
    /** Settings' every template, which a template's title is looked up in by its name (settings.ts publishes it). */
    __TEMPLATES_ALL?: Array<{ name: string; title?: string | null }> | null;
    /** The workspaces, each with how its customers buy (identity.ts keeps it). */
    __WORKSPACES?: Array<{ id: string; sells_by?: string | null }>;
    __ACTIVE_WORKSPACE?: string;
  }
}

/** The starter set as the pages read it, from contracts: the library, and the words and slots for any template. */
export const starters: StarterLibrary = {
  // Read each time a page draws the set: an answer changed in Settings › Business changes it.
  get list() {
    return startersOffered(dealsAreOn(viewedSellsBy()));
  },
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
  group: groupTemplates,
  defaultFor: defaultTemplate,
  sources: PARAM_SOURCE_LABELS,
  sourceHints: PARAM_SOURCE_HINTS,
  slotChoices,
  slots: templateSlots,
  stillSends: playbooksStillSending,
  langWords: languageWords,
  langLabel: languageLabel,
  langTag: languageTag,
  allLanguages: WHATSAPP_LANGUAGES,
  findLanguages,
  languageChoices: messageLanguageChoices,
  languageGroups: LANGUAGE_GROUP_WORDS,
  untranslatable: templateUntranslatable,
  footer: templateFooter,
  sendable: sendableTemplates,
};
