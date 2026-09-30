/**
 * A template written here (moved from legacy/pages/templates-real.jsx, decision 0015): drafted with the assistant in
 * the business's voice, checked against WhatsApp's rules before it leaves, submitted to Meta for review, and tracked to
 * approval by the webhook. Rendered on the Broadcasts page and on Campaigns > Templates. Nothing here sends a message.
 *
 * With `translate`, it writes a message the workspace already has in one more language: the same name and slots,
 * drafted by the assistant from the words WhatsApp holds, for the owner to read, change and submit. Campaigns >
 * Templates opens it in a message's row when a language nobody has written is picked there.
 *
 * What it holds and does is in composer-acts.ts, the two forms it draws (a translation, and a new message) in
 * composer-forms.tsx: plain functions the composer calls, so its tree and its hooks are what they were.
 */
import { useEffect, useRef } from "react";
import { canDo } from "../../legacy-verbs";
import { useLegacyUnsavedWork } from "../../legacy-parts";
import { composerActs, composerFacts, useComposerState, wroteWords } from "./composer-acts";
import type { TemplateMade, TemplateTranslation } from "./composer-acts";
import { composerFields, composerPreview, newTemplateForm, translationForm } from "./composer-forms";

interface TemplateComposerProps {
  onDone?: (made: TemplateMade) => void;
  onCancel?: () => void;
  businessName?: string;
  translate?: TemplateTranslation | null;
}

/** What happened to the starter set, as the answer of adding it says: each count, and what a failure was. */
interface StarterOutcome {
  submitted: number;
  synced: number;
  existing: number;
  failed: number;
  results?: readonly { status: string; title: string; detail?: string }[];
}

// What happened to the starter set, in one line.
export const starterWords = (d: StarterOutcome): string => {
  const parts: string[] = [];
  if (d.submitted) parts.push(`${d.submitted} submitted to WhatsApp for review — usually approved within minutes`);
  if (d.synced) parts.push(`${d.synced} already on your number's account, now here`);
  if (d.existing) parts.push(`${d.existing} already on file`);
  if (d.failed)
    parts.push(
      `${d.failed} could not be added${
        d.results
          ? ": " +
            d.results
              .filter((r) => r.status === "failed")
              .map((r) => `${r.title} (${r.detail || "no reason given"})`)
              .join("; ")
          : ""
      }`,
    );
  return parts.length ? parts.join(" · ") : "Nothing to add";
};

export function TemplateComposer({ onDone, onCancel, businessName = "", translate = null }: TemplateComposerProps) {
  const draftKey = translate ? `${translate.name}|${translate.language}` : "new";
  const st = useComposerState(translate, draftKey);
  const { brief, category, language, name, body, footer, examples, labels, buttonText, buttonUrl, warnings } = st;
  const asked = useRef(!!st.kept);
  const work = useLegacyUnsavedWork("template", draftKey, {
    value: { brief, category, language, name, body, footer, examples, labels, buttonText, buttonUrl, warnings },
    dirty: wroteWords(st),
    onLeave: () => {
      if (onCancel) onCancel();
    },
  });
  // Who may draft or submit: the role store's answer, View-as included.
  const canEdit = canDo("approve");
  const facts = composerFacts(st);
  const acts = composerActs({ st, facts, canEdit, work, onDone });
  useEffect(() => {
    if (!translate || asked.current) return;
    asked.current = true;
    void acts.translateNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: a composer is keyed by its language
  }, []);
  const ctx = { st, facts, acts, work, businessName, onCancel };
  // The fields the words are changed in and the preview beside them are made before the form is chosen, as the JSX made them.
  const made = { fields: composerFields(ctx), preview: composerPreview(ctx) };
  return translate ? translationForm(ctx, translate, made) : newTemplateForm(ctx, made);
}
