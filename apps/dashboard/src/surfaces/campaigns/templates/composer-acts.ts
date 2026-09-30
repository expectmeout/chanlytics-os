/**
 * What the template composer holds and does (moved from legacy/pages/templates-real.jsx, decision 0015): the words it
 * keeps in state (each starts from what the tab kept of an earlier try, else from the message being translated), what it
 * works out of them, and its four acts -- draft from a brief, write a message in one more language, submit to WhatsApp,
 * start from a starter. The state is a hook the composer calls first, so its cells are the composer's own, in the
 * order the JSX had them.
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { StarterTemplate } from "@chanlytics/contracts";
import { tabDraft } from "../../legacy-parts";
import type { UnsavedWork } from "../../legacy-parts";
import { surfaceValue } from "../../surface-values";
import { starters, templates } from "./verbs";
import { brainOf } from "./words";

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
}

/** What the tab kept of a field, else its fallback: the kept words are whatever the tab stored under the composer's key. */
function keptOr<T>(kept: unknown, k: string, fallback: T): T {
  const field = kept && typeof kept === "object" ? (kept as Record<string, unknown>)[k] : undefined;
  return field !== undefined ? (field as T) : fallback;
}

/** The composer's state, in the order the JSX declared it. */
export function useComposerState(translate: TemplateTranslation | null, draftKey: string): ComposerState {
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
  };
}

/** Whether anything is written in it: any words are kept, and Cancel asks before they go; the name alone (a translation keeps its) is not words. */
export function wroteWords(st: ComposerState): boolean {
  const { translate, brief, body, footer, buttonText, name, examples } = st;
  return !!(
    brief.trim() ||
    body.trim() ||
    footer.trim() ||
    buttonText.trim() ||
    (!translate && name.trim()) ||
    examples.some((x) => String(x || "").trim())
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

/** What the words come to: the values in them, where a button goes, whether it may be submitted. */
export function composerFacts(st: ComposerState) {
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
  return { slots, link, button, exampleFor, previewValues, ready, toLabel, fromLabel };
}

interface ActsInput {
  st: ComposerState;
  facts: ReturnType<typeof composerFacts>;
  canEdit: boolean;
  work: UnsavedWork;
  onDone?: (made: TemplateMade) => void;
}

/** What the composer does: each act reads the words as they are when it is pressed, and answers in the words' state. */
export function composerActs({ st, facts, canEdit, work, onDone }: ActsInput) {
  const { translate, drafting, brief, category, language, name, body, footer, labels } = st;
  const { setDrafting, setError, setFailed, setSubmitting } = st;
  const { slots, button, exampleFor, ready, toLabel } = facts;
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
  return { draft, translateNow, submit, startFrom };
}
