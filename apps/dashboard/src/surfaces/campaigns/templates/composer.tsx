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
 *
 * Where the Library gives it `onBegin`, a new message asks where it is sent first: an email begins a message of its
 * own, with no WhatsApp row (a message needs no WhatsApp number), and WhatsApp is the composer as it was. Any other
 * place it is drawn -- the send screen's, a translation -- has no such choice and is the WhatsApp composer alone.
 */
import { useEffect, useRef } from "react";
import type { ApiResult } from "@/client/api";
import { canDo } from "../../frame-verbs";
import { useUnsavedWork } from "../../kit/record/work";
import { composerActs, composerFacts, useComposerState, wroteWords } from "./composer-acts";
import type { TemplateMade, TemplateTranslation } from "./composer-acts";
import { composerFields, composerPreview, newTemplateForm, translationForm } from "./composer-forms";
import type { VersionDraft } from "./verbs";

interface TemplateComposerProps {
  onDone?: (made: TemplateMade) => void;
  onCancel?: () => void;
  businessName?: string;
  translate?: TemplateTranslation | null;
  /** Drawn as the pane beside the Templates list (parts/split.tsx): a new message's head, rows and foot, not a card. */
  pane?: boolean;
  /** Why a template cannot be written yet (a WhatsApp number is what it is written to): said in place of the rows, and nothing is submitted. */
  numberWhy?: string | null;
  /**
   * Writes the first version of a message that begins as an email, as the page writes any version (the answer is the
   * server's, null where it did not start). Given, the composer asks where the message is sent; it opens on WhatsApp where
   * there is a number to write to, and on email where there is none.
   */
  onBegin?: (draft: VersionDraft) => Promise<ApiResult<unknown> | null>;
  /** The names the workspace already has, which a new message may not take: a version under one is written beside what is there. */
  namesHeld?: readonly string[];
  /**
   * Whether the Google listing keeps a review link, as the page drawing the composer read it from the surface it loads (the
   * send screen's broadcasts surface): the starters it offers hold the review ask only where it does. Not given, the
   * Library's own surface says it (templates/verbs.ts `starters.list`, the settings surface the Library opens on).
   */
  reviewLink?: boolean;
}

export function TemplateComposer({
  onDone,
  onCancel,
  businessName = "",
  translate = null,
  pane = false,
  numberWhy = null,
  onBegin,
  namesHeld,
  reviewLink,
}: TemplateComposerProps) {
  const draftKey = translate ? `${translate.name}|${translate.language}` : "new";
  const st = useComposerState(translate, draftKey, onBegin && numberWhy !== null ? "email" : "whatsapp");
  const { brief, category, language, name, body, footer, examples, labels, buttonText, buttonUrl, warnings } = st;
  const { where, title, values, ownWords } = st;
  const asked = useRef(!!st.kept);
  const work = useUnsavedWork("template", draftKey, {
    value: {
      brief,
      category,
      language,
      name,
      body,
      footer,
      examples,
      labels,
      buttonText,
      buttonUrl,
      warnings,
      where,
      title,
      values,
      ownWords,
    },
    dirty: wroteWords(st),
    onLeave: () => {
      if (onCancel) onCancel();
    },
  });
  // Who may draft or submit: the role store's answer, View-as included.
  const canEdit = canDo("approve");
  const facts = composerFacts(st, namesHeld);
  const acts = composerActs({ st, facts, canEdit, work, onDone, onBegin });
  useEffect(() => {
    if (!translate || asked.current) return;
    asked.current = true;
    void acts.translateNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival: a composer is keyed by its language
  }, []);
  const ctx = { st, facts, acts, work, businessName, onCancel, pane, numberWhy, begins: !!onBegin, reviewLink };
  // The fields the words are changed in and the preview beside them are made before the form is chosen, as the JSX made them.
  const made = { fields: composerFields(ctx), preview: composerPreview(ctx) };
  return translate ? translationForm(ctx, translate, made) : newTemplateForm(ctx, made);
}
