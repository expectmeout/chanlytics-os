/**
 * The two forms the template composer draws (moved from legacy/pages/templates-real.jsx, decision 0015): a message
 * written again in one more language, and a new message. Each is a function that returns its element, called by the
 * composer and not drawn as a component of its own, so the composer's tree is the tree it was; the composer's state is
 * theirs to read and to set, handed in as props.
 */
import type { ReactNode } from "react";
import { gate, navigate } from "../../legacy-verbs";
import { fieldErrorPart, unsavedAskPart } from "../../legacy-parts";
import type { UnsavedWork } from "../../legacy-parts";
import { Icon } from "../../kit/icon/icon";
import { LanguagePicker } from "../parts/picker";
import { MessagePreview } from "../parts/message-preview";
import type { ComposerState, TemplateTranslation, composerActs, composerFacts } from "./composer-acts";
import { starters } from "./verbs";

/** The fields and the preview, made before the form is chosen: a translation that is being written draws neither. */
interface Made {
  fields: ReactNode;
  preview: ReactNode;
}

/** What both forms read and do: the composer's words, what they come to, its acts, and the rule that keeps its words. */
interface ComposerCtx {
  st: ComposerState;
  facts: ReturnType<typeof composerFacts>;
  acts: ReturnType<typeof composerActs>;
  work: UnsavedWork;
  businessName: string;
  onCancel?: () => void;
}

// The fields the words are changed in: a translation's are the same as a new
// message's, less the name (it IS the message, so it keeps its name) and a
// button it never had.
export function composerFields({ st, facts }: ComposerCtx) {
  const { translate, name, setName, body, setBody, footer, setFooter, category } = st;
  const { buttonText, setButtonText, buttonUrl, labels, setExamples } = st;
  const { link, slots, exampleFor } = facts;
  return (
    <div className="tpl-fields">
      {!translate && (
        <label className="bc-var">
          <span className="bc-var-label">Name (lowercase, underscores)</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="spring_offer"
            data-testid="tpl-name"
          />
        </label>
      )}
      <label className="bc-var tpl-body">
        <span className="bc-var-label">
          Message — values as {"{{1}}"}, {"{{2}}"} in order
        </span>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="tpl-body" />
      </label>
      <label className="bc-var">
        <span className="bc-var-label">Footer (optional)</span>
        <input
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
          placeholder={category === "marketing" ? "Reply STOP to opt out" : ""}
          data-testid="tpl-footer"
        />
      </label>
      {(!translate || buttonUrl) && (
        <label className="bc-var" data-testid="tpl-button">
          <span className="bc-var-label">
            Button (optional)
            {link ? <> &middot; opens {link.replace(/^https?:\/\//, "")}</> : null}
          </span>
          {link ? (
            <input
              value={buttonText}
              maxLength={25}
              onChange={(e) => setButtonText(e.target.value)}
              placeholder="Book now"
              data-testid="tpl-button-text"
            />
          ) : (
            // prettier-ignore
            <span className="bc-excl-hint" data-testid="tpl-button-none">
              A button needs somewhere to go. Put your booking link in <button type="button" className="cl-bucket-link" onClick={() => navigate("admin/workspace")}>Settings</button> first.
            </span>
          )}
        </label>
      )}
      {slots.length > 0 && (
        <div className="bc-vars" data-testid="tpl-examples">
          {slots.map((n, i) => (
            <label key={n} className="bc-var">
              <span className="bc-var-label">
                Example for {"{{" + n + "}}"}
                {labels[i] ? ` · ${labels[i]}` : ""}
              </span>
              <input
                value={exampleFor(i)}
                onChange={(e) =>
                  setExamples((ex) => {
                    const next = [...ex];
                    next[i] = e.target.value;
                    return next;
                  })
                }
                placeholder="what a real value looks like"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function composerPreview({ st, facts, businessName }: ComposerCtx) {
  const { body, footer } = st;
  const { previewValues, button } = facts;
  return body ? (
    <div className="bc-preview-wrap" data-testid="tpl-preview">
      <MessagePreview
        from={businessName}
        body={body}
        values={previewValues}
        footer={footer || null}
        buttons={button ? [{ text: button.text, kind: "url" }] : null}
      />
    </div>
  ) : null;
}

/** A message the workspace has, written again in one more language. */
export function translationForm(c: ComposerCtx, translate: TemplateTranslation, made: Made) {
  const { st, facts, acts, work, onCancel } = c;
  const { drafting, failed, error, warnings, submitting } = st;
  const { toLabel, fromLabel, ready } = facts;
  const { translateNow, submit } = acts;
  const FieldError = fieldErrorPart();
  const UnsavedAsk = unsavedAskPart();
  return (
    <section className="ct-section tpl-composer is-translate" data-testid="tpl-composer" data-mode="translate">
      <div className="ct-sec-head">
        <span className="ct-sec-title">
          <Icon name="globe" size={13} /> {translate.title} in {toLabel}
        </span>
        <span className="ct-sec-meta" data-testid="tpl-translate-meta">
          {drafting
            ? `Writing it from the ${fromLabel} words…`
            : failed
              ? `From the ${fromLabel} words`
              : `Written from the ${fromLabel} words — read it through, change what you like, then send it for review`}
        </span>
      </div>
      {drafting ? (
        <div
          className="tpl-drafting"
          role="status"
          aria-busy="true"
          aria-label={`Writing it in ${toLabel}`}
          data-testid="tpl-translating"
        >
          <span className="tpl-drafting-line" />
          <span className="tpl-drafting-line" />
          <span className="tpl-drafting-line is-short" />
        </div>
      ) : failed ? (
        <div className="tpl-retry" data-testid="tpl-translate-failed">
          <FieldError message={error} testid="tpl-error" />
          <button
            className="btn btn-sm"
            onClick={translateNow}
            data-testid="tpl-translate-again"
            {...gate("approve", "write a template in another language")}
          >
            <Icon name="refresh" size={11} /> Try again
          </button>
        </div>
      ) : (
        <div className="tpl-split">
          {made.fields}
          {made.preview}
        </div>
      )}
      {!drafting && !failed && warnings.length > 0 && (
        <div className="bc-excl-hint" data-testid="tpl-warnings">
          {warnings.join(" ")}
        </div>
      )}
      {!drafting && !failed && <FieldError message={error} testid="tpl-error" />}
      <div className="bc-actions">
        {work.asking ? (
          <UnsavedAsk onYes={work.discard} onNo={work.stay} what="submitted" testid="tpl-leave" />
        ) : (
          <>
            <span className="bc-excl-hint">
              The same message, <span className="mono">{translate.name}</span>, in one more language — WhatsApp reviews
              it on its own.
            </span>
            <span className="bc-actions-spacer" />
            {onCancel && (
              <button className="cl-bucket-link" onClick={work.leave} data-testid="tpl-cancel">
                Cancel
              </button>
            )}
            <button
              className="btn btn-primary btn-sm"
              disabled={!ready}
              onClick={submit}
              data-testid="tpl-submit"
              {...gate("approve", "submit a template")}
            >
              {submitting ? "Submitting…" : "Submit to WhatsApp"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/** A new message: from a starter, or from what the owner says, then the words. */
export function newTemplateForm(c: ComposerCtx, made: Made) {
  const { st, facts, acts, work, businessName, onCancel } = c;
  const { brief, setBrief, category, setCategory, language, setLanguage } = st;
  const { drafting, warnings, error, submitting } = st;
  const { startFrom, draft, submit } = acts;
  const { ready } = facts;
  const FieldError = fieldErrorPart();
  const UnsavedAsk = unsavedAskPart();
  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">New template</span>
        <span className="ct-sec-meta">
          WhatsApp reviews it before it can be sent — usually minutes, sometimes a day
        </span>
        {onCancel && (
          <button className="cl-bucket-link" onClick={work.leave} data-testid="tpl-close">
            Close
          </button>
        )}
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">From</span>
        <div className="bc-chips" style={{ alignItems: "center" }}>
          {starters.list.map((s) => (
            <button
              key={s.key}
              className="bc-chip"
              title={`${s.title} — ${s.purpose}`}
              onClick={() => startFrom(s)}
              data-testid="tpl-start-from"
            >
              {s.title}
            </button>
          ))}
          <span className="bc-excl-hint">a starter to change — or say what you want to tell customers below</span>
        </div>
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Say</span>
        <textarea
          className="tpl-brief"
          rows={2}
          value={brief}
          placeholder="What do you want to tell customers? e.g. 20% off any service this week, book by Friday"
          onChange={(e) => setBrief(e.target.value)}
          data-testid="tpl-brief"
        />
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Kind</span>
        <div className="bc-chips">
          <button
            className={"bc-chip" + (category === "marketing" ? " active" : "")}
            onClick={() => setCategory("marketing")}
            title="An offer, news or an invitation — needs the customer's yes"
          >
            Marketing
          </button>
          <button
            className={"bc-chip" + (category === "utility" ? " active" : "")}
            onClick={() => setCategory("utility")}
            title="A notice about their own booking or account — no promotional words"
          >
            Utility
          </button>
          {/* Any language WhatsApp takes, found by typing it: the list is 111 long,
              and a select of 111 is a scroll nobody finishes. */}
          <LanguagePicker
            display="label"
            value={language}
            choices={starters.allLanguages}
            onPick={(id) => setLanguage(id)}
            label="The language it is written in"
            search
            testid="tpl-language"
          />
          <button
            className="btn btn-sm"
            disabled={drafting || brief.trim().length < 4}
            onClick={draft}
            data-testid="tpl-draft"
            {...gate("approve", "draft a template")}
          >
            <Icon name="sparkle" size={11} /> {drafting ? "Drafting…" : "Draft with Chanlytics"}
          </button>
        </div>
      </div>
      {made.fields}
      {made.preview}
      {warnings.length > 0 && (
        <div className="bc-excl-hint" data-testid="tpl-warnings">
          {warnings.join(" ")}
        </div>
      )}
      <FieldError message={error} testid="tpl-error" />
      <div className="bc-actions">
        {/* Close, with words in it: the one question first (UnsavedAsk), where the submit was. */}
        {work.asking ? (
          <UnsavedAsk onYes={work.discard} onNo={work.stay} what="submitted" testid="tpl-leave" />
        ) : (
          <>
            <span className="bc-excl-hint">
              The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}
            </span>
            <span className="bc-actions-spacer" />
            <button
              className="btn btn-primary btn-sm"
              disabled={!ready}
              onClick={submit}
              data-testid="tpl-submit"
              {...gate("approve", "submit a template")}
            >
              {submitting ? "Submitting…" : "Submit to WhatsApp"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
