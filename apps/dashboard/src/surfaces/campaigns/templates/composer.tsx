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
import { LIBRARY_STARTER_WORDS } from "@chanlytics/contracts";
import type { ApiResult } from "@/client/api";
import { canDo } from "../../legacy-verbs";
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

/**
 * What happened to the starter set, as the answer of adding it says: each count, what a failure was, how many email and
 * text versions were written or could not be and why, and how many starters' WhatsApp version was skipped (no number).
 */
interface StarterOutcome {
  submitted: number;
  synced: number;
  existing: number;
  failed: number;
  skipped?: number;
  versions_saved?: number;
  versions_failed?: number;
  results?: readonly {
    status: string;
    title: string;
    detail?: string;
    versions?: readonly { status: string; detail?: string }[];
  }[];
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
  if (d.versions_saved) parts.push(LIBRARY_STARTER_WORDS.versionsWritten(d.versions_saved));
  if (d.versions_failed) {
    // The door's own words for why, once: they are the same for every version a database refuses alike.
    const why = d.results?.flatMap((r) => r.versions ?? []).find((v) => v.status === "failed")?.detail ?? null;
    parts.push(LIBRARY_STARTER_WORDS.versionsFailed(d.versions_failed, why));
  }
  if (parts.length === 0 && !d.skipped) return "Nothing to add";
  if (d.skipped) parts.push(LIBRARY_STARTER_WORDS.waitsForNumber);
  return parts.join(" · ");
};

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
