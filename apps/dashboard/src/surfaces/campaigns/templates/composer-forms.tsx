/**
 * The two forms the template composer draws (moved from legacy/pages/templates-real.jsx, decision 0015): a message
 * written again in one more language, and a new message. Each is a function that returns its element, called by the
 * composer and not drawn as a component of its own, so the composer's tree is the tree it was; the composer's state is
 * theirs to read and to set, handed in as props.
 */
import type { ReactNode } from "react";
import { gate, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Picker } from "../../kit/picker/picker";
import { UnsavedAsk } from "../../kit/record/work";
import type { UnsavedWork } from "../../kit/record/work";
import { Segmented } from "../../kit/segmented/segmented";
import { cmLanguageSearch, cmLanguages } from "../parts/picker";
import { cmChevron } from "../parts/picks";
import { MessagePreview } from "../parts/message-preview";
import { CmPane } from "../parts/split";
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
  /** Drawn as the pane beside the Templates list (composer.tsx), where a new message is not a card. */
  pane?: boolean;
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
        <Field
          label="Name (lowercase, underscores)"
          value={name}
          onValueChange={setName}
          placeholder="spring_offer"
          data-testid="tpl-name"
        />
      )}
      <Field
        className="tpl-body"
        label={
          <>
            Message — values as {"{{1}}"}, {"{{2}}"} in order
          </>
        }
        rows={4}
        value={body}
        onValueChange={setBody}
        data-testid="tpl-body"
      />
      <Field
        label="Footer (optional)"
        value={footer}
        onValueChange={setFooter}
        placeholder={category === "marketing" ? "Reply STOP to opt out" : ""}
        data-testid="tpl-footer"
      />
      {(!translate || buttonUrl) && (
        <div data-testid="tpl-button">
          {link ? (
            <Field
              label={<>Button (optional) &middot; opens {link.replace(/^https?:\/\//, "")}</>}
              value={buttonText}
              maxLength={25}
              onValueChange={setButtonText}
              placeholder="Book now"
              data-testid="tpl-button-text"
            />
          ) : (
            <Field
              label="Button (optional)"
              control={
                // prettier-ignore
                <span className="bc-excl-hint" data-testid="tpl-button-none">
                  A button needs somewhere to go. Put your booking link in <LinkButton onClick={() => navigate("admin/workspace")}>Settings</LinkButton> first.
                </span>
              }
            />
          )}
        </div>
      )}
      {slots.length > 0 && (
        <div className="bc-vars" data-testid="tpl-examples">
          {slots.map((n, i) => (
            <Field
              key={n}
              label={
                <>
                  Example for {"{{" + n + "}}"}
                  {labels[i] ? ` · ${labels[i]}` : ""}
                </>
              }
              value={exampleFor(i)}
              onValueChange={(words) =>
                setExamples((ex) => {
                  const next = [...ex];
                  next[i] = words;
                  return next;
                })
              }
              placeholder="what a real value looks like"
            />
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
          <Button
            size="sm"
            onClick={translateNow}
            data-testid="tpl-translate-again"
            {...gate("approve", "write a template in another language")}
          >
            <Icon name="refresh" size={11} /> Try again
          </Button>
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
              <LinkButton onClick={work.leave} data-testid="tpl-cancel">
                Cancel
              </LinkButton>
            )}
            <Button
              variant="primary"
              size="sm"
              disabled={!ready}
              onClick={submit}
              data-testid="tpl-submit"
              {...gate("approve", "submit a template")}
            >
              {submitting ? "Submitting…" : "Submit to WhatsApp"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * What a new message is made of, in the order it is asked: where it starts from, what it says, its kind and language,
 * then its words and what is wrong with them. A card and the pane beside the list draw the same rows.
 */
function newRows(c: ComposerCtx, made: Made) {
  const { st, acts } = c;
  const { brief, setBrief, category, setCategory, language, setLanguage } = st;
  const { drafting, warnings, error } = st;
  const { startFrom, draft } = acts;
  const spoken = starters.allLanguages.find((l) => l.id === language);
  return (
    <>
      <div className="tpl-row">
        <span className="bc-row-label">From</span>
        <div className="bc-chips" style={{ alignItems: "center" }}>
          {starters.list.map((s) => (
            <Button
              key={s.key}
              size="sm"
              title={`${s.title} — ${s.purpose}`}
              onClick={() => startFrom(s)}
              data-testid="tpl-start-from"
            >
              {s.title}
            </Button>
          ))}
          <span className="bc-excl-hint">a starter to change — or say what you want to tell customers below</span>
        </div>
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Say</span>
        <Field
          className="tpl-brief"
          aria-label="What you want to tell customers"
          rows={2}
          value={brief}
          placeholder="What do you want to tell customers? e.g. 20% off any service this week, book by Friday"
          onValueChange={setBrief}
          data-testid="tpl-brief"
        />
      </div>
      <div className="tpl-row">
        <span className="bc-row-label">Kind</span>
        <div className="bc-chips">
          <Segmented
            label="Kind"
            value={category}
            onValueChange={setCategory}
            options={[
              {
                value: "marketing",
                label: "Marketing",
                title: "An offer, news or an invitation — needs the customer's yes",
              },
              {
                value: "utility",
                label: "Utility",
                title: "A notice about their own booking or account — no promotional words",
              },
            ]}
          />
          {/* Any language WhatsApp takes, found by typing it: the list is 111 long,
              and a select of 111 is a scroll nobody finishes. */}
          <Picker
            label="The language it is written in"
            value={language}
            onValueChange={setLanguage}
            groups={cmLanguages(starters.allLanguages)}
            chevron={cmChevron()}
            face={
              <>
                <Icon name="globe" size={13} /> {spoken ? spoken.label : language}
              </>
            }
            search={cmLanguageSearch(starters.allLanguages)}
            data-testid="tpl-language"
          />
          <Button
            size="sm"
            disabled={drafting || brief.trim().length < 4}
            onClick={draft}
            data-testid="tpl-draft"
            {...gate("approve", "draft a template")}
          >
            <Icon name="sparkle" size={11} /> {drafting ? "Drafting…" : "Draft with Chanlytics"}
          </Button>
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
    </>
  );
}

/**
 * A new message, in the pane beside the list (parts/split.tsx): its name and what it waits on in the head, Cancel at the
 * head's end -- which asks first when something was written, as Escape does -- the rows in the body and the submit in
 * the foot, where the glass bar stands. It was a card over the list, which pushed the messages down while it was open.
 */
function newTemplatePane(c: ComposerCtx, made: Made) {
  const { st, facts, acts, work, businessName } = c;
  const { submitting } = st;
  const { submit } = acts;
  const { ready } = facts;
  return (
    <CmPane
      testid="messages-composer"
      title="New template"
      sub="WhatsApp reviews it before it can be sent — usually minutes, sometimes a day"
      onClose={work.leave}
      closeLabel="Cancel"
      closeTestid="tpl-close"
      foot={
        // Cancel, and Escape, with words in it: the one question first (UnsavedAsk), where the submit was.
        work.asking ? (
          <UnsavedAsk onYes={work.discard} onNo={work.stay} what="submitted" testid="tpl-leave" />
        ) : (
          <>
            <span className="bc-excl-hint">
              The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}
            </span>
            <Button
              variant="primary"
              disabled={!ready}
              onClick={submit}
              data-testid="tpl-submit"
              {...gate("approve", "submit a template")}
            >
              {submitting ? "Submitting…" : "Submit to WhatsApp"}
            </Button>
          </>
        )
      }
    >
      <div className="tpl-compose" data-testid="tpl-composer">
        {newRows(c, made)}
      </div>
    </CmPane>
  );
}

/** A new message: from a starter, or from what the owner says, then the words. */
export function newTemplateForm(c: ComposerCtx, made: Made) {
  if (c.pane) return newTemplatePane(c, made);
  const { st, facts, acts, work, businessName, onCancel } = c;
  const { submitting } = st;
  const { submit } = acts;
  const { ready } = facts;
  return (
    <section className="ct-section tpl-composer" data-testid="tpl-composer">
      <div className="ct-sec-head">
        <span className="ct-sec-title">New template</span>
        <span className="ct-sec-meta">
          WhatsApp reviews it before it can be sent — usually minutes, sometimes a day
        </span>
        {onCancel && (
          <LinkButton onClick={work.leave} data-testid="tpl-close">
            Close
          </LinkButton>
        )}
      </div>
      {newRows(c, made)}
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
            <Button
              variant="primary"
              size="sm"
              disabled={!ready}
              onClick={submit}
              data-testid="tpl-submit"
              {...gate("approve", "submit a template")}
            >
              {submitting ? "Submitting…" : "Submit to WhatsApp"}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
