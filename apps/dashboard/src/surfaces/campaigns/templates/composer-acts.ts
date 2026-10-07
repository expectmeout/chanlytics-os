/**
 * What the template composer holds and does (moved from legacy/pages/templates-real.jsx, decision 0015): the words it
 * keeps in state (each starts from what the tab kept of an earlier try, else from the message being translated), what it
 * works out of them, and its four acts -- draft from a brief, write a message in one more language, submit to WhatsApp,
 * start from a starter. The state is a hook the composer calls first, so its cells are the composer's own, in the
 * order the JSX had them.
 *
 * Where the Library hands it `onBegin`, a new message may begin as an email instead (a message needs no WhatsApp row):
 * it asks where the message is sent, and an email takes its own cells beside WhatsApp's -- a title, the values the
 * message takes, and the words the version editor holds -- and its own act, `begin`, which writes the first version
 * through one request. What may be written is said in contracts' words before anything is sent.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  NEW_MESSAGE_WORDS,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_LABEL_MAX,
  TEMPLATE_TITLE_MAX,
  channelNeverCarries,
  isReachOutRow,
  numberedSlots,
  refusalOf,
  slugTemplateName,
  templateNameOk,
  validateOwnVersion,
} from "@chanlytics/contracts";
import type { SlotSet, StarterTemplate, VersionChannel, VersionWords } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { tabDraft } from "../../kit/record/work";
import type { UnsavedWork } from "../../kit/record/work";
import { surfaceValue } from "../../surface-values";
import { starters, templates } from "./verbs";
import type { MessageBegins, VersionDraft } from "./verbs";
import { brainOf } from "./words";

/**
 * Where a new message is sent, in the order the first choice offers it. An email or a text begins a message with no
 * WhatsApp row; WhatsApp's is the composer as it always was.
 */
export const COMPOSER_WHERE = ["email", "sms", "whatsapp"] as const satisfies readonly VersionChannel[];
export type ComposerWhere = (typeof COMPOSER_WHERE)[number];

/** One value a message written as an email takes: what a person calls it ("First name") and an example of what fills it. */
export interface OwnValue {
  label: string;
  example: string;
}

/** What a translation is written from and as: the message on file (or the starter), the language, the words to say. */
export interface TemplateTranslation {
  /** The row on file it is written from, or the library's starter and the language of its words. */
  ref: { id: string } | { starter: string; from?: string };
  /** The language it is written from. */
  from: string;
  /** The message's own name: a translation keeps it. */
  name: string;
  /** The language it is written in. */
  language: string;
  /** The message's title, as its row says it. */
  title: string;
  category?: "marketing" | "utility";
}

/** What WhatsApp took, as the composer's `onDone` hands it back. */
export type TemplateMade = Extract<Awaited<ReturnType<typeof templates.create>>, { ok: true }>["data"];

type Setter<T> = Dispatch<SetStateAction<T>>;

/** Every word the composer holds, with the way to change it. */
export interface ComposerState {
  translate: TemplateTranslation | null;
  /** What the tab kept of an earlier try: the words come back, and a translation is not written (paid for) twice. */
  kept: unknown;
  brief: string;
  setBrief: Setter<string>;
  category: "marketing" | "utility";
  setCategory: Setter<"marketing" | "utility">;
  language: string;
  setLanguage: Setter<string>;
  name: string;
  setName: Setter<string>;
  body: string;
  setBody: Setter<string>;
  footer: string;
  setFooter: Setter<string>;
  examples: string[];
  setExamples: Setter<string[]>;
  labels: string[];
  setLabels: Setter<string[]>;
  buttonText: string;
  setButtonText: Setter<string>;
  buttonUrl: string | null;
  setButtonUrl: Setter<string | null>;
  warnings: string[];
  setWarnings: Setter<string[]>;
  drafting: boolean;
  setDrafting: Setter<boolean>;
  submitting: boolean;
  setSubmitting: Setter<boolean>;
  error: string | null;
  setError: Setter<string | null>;
  failed: boolean;
  setFailed: Setter<boolean>;
  /** Where it is sent: an email or a text begins a message of its own, WhatsApp's is the template composer. */
  where: ComposerWhere;
  setWhere: Setter<ComposerWhere>;
  /** What a message written as an email is called for people; its name is made from it. */
  title: string;
  setTitle: Setter<string>;
  /** The values it takes, in order. */
  values: OwnValue[];
  setValues: Setter<OwnValue[]>;
  /** The words the version editor holds (it tells the composer as they change), kept with the rest in the tab. */
  ownWords: VersionWords;
  setOwnWords: Setter<VersionWords>;
}

/** What the tab kept of a field, else its fallback: the kept words are whatever the tab stored under the composer's key. */
function keptOr<T>(kept: unknown, k: string, fallback: T): T {
  const field = kept && typeof kept === "object" ? (kept as Record<string, unknown>)[k] : undefined;
  return field !== undefined ? (field as T) : fallback;
}

/**
 * The composer's state, in the order the JSX declared it. `start` is where a new message opens: WhatsApp, which every
 * composer that cannot begin a message of its own is on, or the Library's, on whichever it can write now.
 */
export function useComposerState(
  translate: TemplateTranslation | null,
  draftKey: string,
  start: ComposerWhere = "whatsapp",
): ComposerState {
  // Words written here and not submitted come back when the composer opens again (the tab's draft, useUnsavedWork):
  // a new message under "new", a translation under the message and its language -- so a translation the assistant
  // wrote once is not paid for twice.
  const [kept] = useState(() => tabDraft("template", draftKey));
  const [brief, setBrief] = useState(keptOr(kept, "brief", ""));
  const [category, setCategory] = useState(
    keptOr<"marketing" | "utility">(
      kept,
      "category",
      translate && translate.category ? translate.category : "marketing",
    ),
  );
  const [language, setLanguage] = useState(keptOr(kept, "language", translate ? translate.language : "en_US"));
  const [name, setName] = useState(keptOr(kept, "name", translate ? translate.name || "" : ""));
  const [body, setBody] = useState(keptOr(kept, "body", ""));
  const [footer, setFooter] = useState(keptOr(kept, "footer", ""));
  const [examples, setExamples] = useState(keptOr<string[]>(kept, "examples", []));
  const [labels, setLabels] = useState(keptOr<string[]>(kept, "labels", []));
  // The words on a button under the message. Empty means no button.
  const [buttonText, setButtonText] = useState(keptOr(kept, "buttonText", ""));
  // Where a translated message's button goes: the address its own button opens,
  // never the booking link guessed at. Null outside a translation.
  const [buttonUrl, setButtonUrl] = useState(keptOr<string | null>(kept, "buttonUrl", null));
  const [warnings, setWarnings] = useState(keptOr<string[]>(kept, "warnings", []));
  const [drafting, setDrafting] = useState(!!translate && !kept);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A translation that could not be written: the words are not there to change,
  // so the only thing to offer is another try.
  const [failed, setFailed] = useState(false);
  // What was kept before the first choice existed is a WhatsApp template's.
  const [where, setWhere] = useState(keptOr<ComposerWhere>(kept, "where", kept ? "whatsapp" : start));
  const [title, setTitle] = useState(keptOr(kept, "title", ""));
  const [values, setValues] = useState(keptOr<OwnValue[]>(kept, "values", []));
  const [ownWords, setOwnWords] = useState(keptOr<VersionWords>(kept, "ownWords", { subject: "", body: "" }));
  return {
    translate,
    kept,
    brief,
    setBrief,
    category,
    setCategory,
    language,
    setLanguage,
    name,
    setName,
    body,
    setBody,
    footer,
    setFooter,
    examples,
    setExamples,
    labels,
    setLabels,
    buttonText,
    setButtonText,
    buttonUrl,
    setButtonUrl,
    warnings,
    setWarnings,
    drafting,
    setDrafting,
    submitting,
    setSubmitting,
    error,
    setError,
    failed,
    setFailed,
    where,
    setWhere,
    title,
    setTitle,
    values,
    setValues,
    ownWords,
    setOwnWords,
  };
}

/** Whether anything is written in it: any words are kept, and Cancel asks before they go; the name alone (a translation keeps its) is not words. */
export function wroteWords(st: ComposerState): boolean {
  const { translate, brief, body, footer, buttonText, name, examples, title, values, ownWords } = st;
  return !!(
    brief.trim() ||
    body.trim() ||
    footer.trim() ||
    buttonText.trim() ||
    (!translate && name.trim()) ||
    examples.some((x) => String(x || "").trim()) ||
    title.trim() ||
    values.some((v) => v.label.trim() || v.example.trim()) ||
    (ownWords.subject ?? "").trim() ||
    ownWords.body.trim()
  );
}

// The one address a button may open: what the workspace put in Settings.
const tcBookingLink = (): string | null => {
  const brain = brainOf(surfaceValue("settings")?.settings);
  const link = typeof brain.booking_link === "string" ? brain.booking_link.trim() : "";
  return link || null;
};

const tcSlots = (body: string): number[] => {
  const s = new Set<number>();
  for (const m of String(body || "").matchAll(/\{\{(\d+)\}\}/g)) s.add(Number(m[1]));
  return [...s].sort((a, b) => a - b);
};

/** What a message written as an email comes to: its name, the values as the door files them, what keeps it from being written. */
interface OwnFacts {
  /** The title as it is kept: its spaces folded. */
  title: string;
  /** The name the message is filed under, made from the title (the name WhatsApp would know it by); empty where the title gives none. */
  name: string;
  /** What is wrong with a title that is there, in the person's words; null for none, and for one not yet given. */
  titleProblem: string | null;
  /** The message's values, numbered from 1: what each is called, for the editor that draws them by name. */
  slots: SlotSet;
  /** What fills each in a preview, in the same order. */
  examples: string[];
  /** The values as the door files them on the message. */
  variables: MessageBegins["variables"];
  /** What keeps it from being written now, first thing first, in the person's words; null where it may be. */
  problem: string | null;
}

const squeeze = (words: string): string => words.replace(/\s+/g, " ").trim();

/** What is wrong with a title that was given: too long, no letters or digits to make a name of, or a name the workspace holds. */
function titleProblemOf(title: string, name: string, namesHeld: readonly string[]): string | null {
  if (!title) return null;
  if (title.length > TEMPLATE_TITLE_MAX) return NEW_MESSAGE_WORDS.titleTooLong(TEMPLATE_TITLE_MAX);
  if (!templateNameOk(name)) return NEW_MESSAGE_WORDS.titleNeedsWords;
  // A name a row holds is a message that exists (its version would be written beside it, or over one of its own), a
  // starter's is the starter's, and a reach-out's is the reach-out's: none is a message to begin.
  return isReachOutRow({ name }) || namesHeld.includes(name) || starters.byName(name)
    ? NEW_MESSAGE_WORDS.nameTaken
    : null;
}

/** The first value with no name or no example, or past the door's length: its sentence. */
function valuesProblemOf(variables: MessageBegins["variables"]): string | null {
  for (const v of variables) {
    if (!v.label || !v.example) return NEW_MESSAGE_WORDS.valuesNeedWords;
    if (v.label.length > TEMPLATE_LABEL_MAX) return NEW_MESSAGE_WORDS.valueTooLong("name", TEMPLATE_LABEL_MAX);
    if (v.example.length > TEMPLATE_EXAMPLE_MAX) return NEW_MESSAGE_WORDS.valueTooLong("example", TEMPLATE_EXAMPLE_MAX);
  }
  return null;
}

/** A message written as an email, worked out of its title and values. `namesHeld` are the names the workspace already has. */
function ownFactsOf(st: ComposerState, namesHeld: readonly string[]): OwnFacts {
  const title = squeeze(st.title);
  const name = slugTemplateName(title);
  const variables = st.values.map((v, i) => ({ position: i + 1, label: squeeze(v.label), example: v.example.trim() }));
  const titleProblem = titleProblemOf(title, name, namesHeld);
  return {
    title,
    name,
    titleProblem,
    slots: numberedSlots(variables.map((v) => v.label)),
    examples: variables.map((v) => v.example),
    variables,
    problem: (title ? titleProblem : NEW_MESSAGE_WORDS.titleMissing) ?? valuesProblemOf(variables),
  };
}

/** What a text says where it is chosen for a message written here: the carriers' sentence, and the way out. */
export const textSaysWords = (): string =>
  [channelNeverCarries("sms", "marketing"), NEW_MESSAGE_WORDS.textGoesByEmail].filter(Boolean).join(" ");

const NO_NAMES: readonly string[] = [];

/** What the words come to: the values in them, where a button goes, whether it may be submitted. */
export function composerFacts(st: ComposerState, namesHeld: readonly string[] = NO_NAMES) {
  const { translate, name, body, examples, buttonText, buttonUrl, submitting, drafting, language } = st;
  const slots = tcSlots(body);
  // Where a button goes: the workspace's own booking link, the same fact the
  // starters' booking_link slot is filled from. A button's address is FIXED --
  // one that took a value would need a parameter `sendTemplate` never sends, and
  // WhatsApp would refuse every recipient (contracts templateBlocked).
  const bookingLink = tcBookingLink();
  const link = translate ? buttonUrl : bookingLink;
  const button = link && buttonText.trim() ? { text: buttonText.trim(), url: link } : null;
  const exampleFor = (i: number) => examples[i] || "";
  const previewValues = slots.map((n, i) => exampleFor(i));
  const ready =
    !!name.trim() && !!body.trim() && slots.every((n, i) => !!exampleFor(i).trim()) && !submitting && !drafting;
  const toLabel = starters.langLabel(language);
  const fromLabel = translate ? starters.langLabel(translate.from) : "";
  return { slots, link, button, exampleFor, previewValues, ready, toLabel, fromLabel, own: ownFactsOf(st, namesHeld) };
}

interface ActsInput {
  st: ComposerState;
  facts: ReturnType<typeof composerFacts>;
  canEdit: boolean;
  work: UnsavedWork;
  onDone?: (made: TemplateMade) => void;
  /** Writes a message's first version, as the page writes any (its one act at a time, its toast, the surface read again). */
  onBegin?: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
}

/** A refusal made here, before anything is sent, in the shape a refusal from the server has. */
const refusedBeforeSending = (message: string): ApiResult<never> => ({
  ok: false,
  ...refusalOf({ code: "validation", status: 400, message, write: true }),
});

/** What the composer does: each act reads the words as they are when it is pressed, and answers in the words' state. */
export function composerActs({ st, facts, canEdit, work, onDone, onBegin }: ActsInput) {
  const { translate, drafting, brief, category, language, name, body, footer, labels } = st;
  const { setDrafting, setError, setFailed, setSubmitting } = st;
  const { slots, button, exampleFor, ready, toLabel, own } = facts;
  const draft = async () => {
    if (drafting || brief.trim().length < 4 || !canEdit) return;
    setDrafting(true);
    setError(null);
    const r = await templates.draft({ brief: brief.trim(), category, language });
    setDrafting(false);
    if (!r.ok) {
      setError(r.message || "The draft could not be written.");
      return;
    }
    const d = r.data.draft;
    st.setName(d.name || "");
    st.setBody(d.body || "");
    st.setFooter(d.footer || "");
    st.setExamples(d.examples || []);
    st.setLabels((d.variables || []).map((v) => v.label || ""));
    st.setWarnings(d.warnings || []);
  };
  // The message in one more language, written once when the composer opens and
  // again only when asked: the assistant is paid for per draft.
  const translateNow = async () => {
    if (!translate) return;
    setDrafting(true);
    setError(null);
    setFailed(false);
    const r = await templates.draft({ language: translate.language, translate: translate.ref });
    setDrafting(false);
    if (!r.ok) {
      setError(r.message || `It could not be written in ${toLabel} just now.`);
      setFailed(true);
      return;
    }
    const d = r.data.draft;
    st.setName(d.name || translate.name || "");
    if (d.category) st.setCategory(d.category);
    st.setBody(d.body || "");
    st.setFooter(d.footer || "");
    st.setExamples(d.examples || []);
    st.setLabels((d.variables || []).map((v) => v.label || ""));
    // The route answers a draft or a translation; only a translation has a button.
    const own = "button" in d ? d.button : null;
    st.setButtonText(own ? own.text : "");
    st.setButtonUrl(own ? own.url : null);
    st.setWarnings(d.warnings || []);
  };
  const submit = async () => {
    if (!ready || !canEdit) return;
    setSubmitting(true);
    setError(null);
    const r = await templates.create({
      name: name.trim(),
      language,
      category,
      body,
      footer: footer.trim() || null,
      examples: slots.map((n, i) => exampleFor(i).trim()),
      labels: slots.map((n, i) => (labels[i] || "").trim()),
      button,
    });
    setSubmitting(false);
    if (!r.ok) {
      setError(r.message || "WhatsApp did not accept it.");
      return;
    }
    work.done();
    if (onDone) onDone(r.data);
  };
  // A starter's words in the chosen language, to change or submit as they are.
  const startFrom = (s: StarterTemplate) => {
    const t = starters.text(s, language);
    st.setCategory(s.category);
    st.setName(s.name);
    st.setBody(t.body);
    st.setFooter(t.footer || "");
    st.setExamples(t.slots.map((x) => x.example));
    st.setLabels(t.slots.map((x) => x.label));
    st.setButtonText("");
    st.setWarnings([]);
    setError(null);
  };
  // The first version of a message begun as an email, from the editor's Save: what keeps the message from being written,
  // and what its words may say of its values, are said before anything goes; then one request, which says what the
  // message is with its words (an offer or news, as every message written here is). A refusal is the editor's to show.
  const begin = async (version: VersionDraft): Promise<ApiResult<unknown> | null> => {
    if (!onBegin || !canEdit) return null;
    if (own.problem) return refusedBeforeSending(own.problem);
    const words = validateOwnVersion("email", version, own.slots.keys.length, language);
    if (!words.ok) return refusedBeforeSending(words.error);
    const r = await onBegin({
      name: own.name,
      language,
      channel: "email",
      ...(words.value.subject ? { subject: words.value.subject } : {}),
      body: words.value.body,
      message: { category: "marketing", variables: own.variables, title: own.title },
    });
    if (r?.ok) work.done();
    return r;
  };
  return { draft, translateNow, submit, startFrom, begin };
}
