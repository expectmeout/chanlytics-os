/**
 * The two forms the template composer draws (moved from legacy/pages/templates-real.jsx, decision 0015): a message
 * written again in one more language, and a new message. Each is a function that returns its element, called by the
 * composer and not drawn as a component of its own, so the composer's tree is the tree it was; the composer's state is
 * theirs to read and to set, handed in as props.
 *
 * A new message in the Library's pane opens on where it is sent. WhatsApp is the form as it was; an email is the own
 * form -- a title, the language, the values the message takes and then its words in the version editor, which writes the
 * first version of a message with no WhatsApp row; a text is not offered for it (texts carry no offers) and says so,
 * and offers the email.
 */
import type { ReactNode } from "react";
import {
  NEW_MESSAGE_WORDS,
  TEMPLATE_EXAMPLE_MAX,
  TEMPLATE_LABEL_MAX,
  TEMPLATE_TITLE_MAX,
  VERSION_CHANNEL_WORDS,
} from "@chanlytics/contracts";
import { gate, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { EmptyState } from "../../kit/empty/empty";
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
import { COMPOSER_WHERE, textSaysWords } from "./composer-acts";
import type { ComposerState, OwnValue, TemplateTranslation, composerActs, composerFacts } from "./composer-acts";
import { VersionEditor } from "./version-editor";
import { starters } from "./verbs";
import { TPL_VERSION_WORDS } from "./words";

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
  /** Why nothing can be submitted yet (no WhatsApp number to write it to): said where the rows would be. */
  numberWhy: string | null;
  /** Whether a new message asks where it is sent first, and may begin as an email: the Library's composer does. */
  begins: boolean;
  /** Whether the listing keeps a review link, as the page drawing it read it; undefined: the Library's surface says (composer.tsx). */
  reviewLink: boolean | undefined;
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
              placeholder="Ana"
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
          <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="tpl-leave" />
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
 * The language a message is written in: any one WhatsApp takes, found by typing it (the list is 111 long, and a select
 * of 111 is a scroll nobody finishes). A WhatsApp template and a message written as an email choose it the same way.
 */
function languagePicker({ language, setLanguage }: ComposerState) {
  const spoken = starters.allLanguages.find((l) => l.id === language);
  return (
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
  );
}

/**
 * What a new message is made of, in the order it is asked: where it starts from, what it says, its kind and language,
 * then its words and what is wrong with them. A card and the pane beside the list draw the same rows.
 */
function newRows(c: ComposerCtx, made: Made) {
  const { st, acts } = c;
  const { brief, setBrief, category, setCategory } = st;
  const { drafting, warnings, error } = st;
  const { startFrom, draft } = acts;
  return (
    <>
      <div className="tpl-row">
        <span className="bc-row-label">From</span>
        <div className="bc-chips" style={{ alignItems: "center" }}>
          {(c.reviewLink === undefined ? starters.list : starters.offered(c.reviewLink)).map((s) => (
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
          {languagePicker(st)}
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

/** The first choice's options, in the order it offers them, each by contracts' name for the channel. */
const WHERE_OPTIONS = COMPOSER_WHERE.map((value) => ({
  value,
  label: VERSION_CHANNEL_WORDS[value],
  testid: `tpl-where-${value}`,
}));

/** Where the message is sent: the first thing a new message in the Library asks. */
function whereRow({ st }: ComposerCtx) {
  return (
    <div className="tpl-compose" data-testid="tpl-where-step">
      <div className="tpl-row">
        <span className="bc-row-label">Where</span>
        <Segmented
          label={NEW_MESSAGE_WORDS.where}
          value={st.where}
          onValueChange={st.setWhere}
          options={WHERE_OPTIONS}
        />
      </div>
    </div>
  );
}

/** A text chosen for a message written here: it carries no offers, which is all such a message is; the email is the way out. */
function textStep({ st }: ComposerCtx) {
  return (
    <div className="tpl-own" data-testid="tpl-text-step">
      <p className="bc-excl-hint" data-testid="tpl-text-says">
        {textSaysWords()}
      </p>
      <div className="tpl-own-acts">
        <Button size="sm" onClick={() => st.setWhere("email")} data-testid="tpl-text-email">
          {NEW_MESSAGE_WORDS.writeAsEmail}
        </Button>
      </div>
    </div>
  );
}

/**
 * A message written as an email, which has no WhatsApp row: its title (its name is made from it and shown as the name
 * WhatsApp would know it by), the language, the values it takes -- each a name and an example, numbered in order -- and
 * then its words in the version editor, whose Save writes the first version. The editor draws each value by its name and
 * checks the words against them as they are typed; the composer keeps the words with the rest.
 */
function ownForm(c: ComposerCtx) {
  const { st, facts, acts, onCancel } = c;
  const { title, setTitle, values, setValues, ownWords, setOwnWords, language } = st;
  const { own } = facts;
  const change = (at: number, edit: Partial<OwnValue>) =>
    setValues((all) => all.map((v, i) => (i === at ? { ...v, ...edit } : v)));
  return (
    <div className="tpl-own" data-testid="tpl-own">
      <p className="bc-excl-hint" data-testid="tpl-own-note">
        {NEW_MESSAGE_WORDS.own}
      </p>
      <Field
        label="Title"
        value={title}
        onValueChange={setTitle}
        maxLength={TEMPLATE_TITLE_MAX}
        placeholder="Spring offer"
        hint={
          own.name ? (
            <>
              {NEW_MESSAGE_WORDS.knownAs} <span className="mono">{own.name}</span>
            </>
          ) : undefined
        }
        data-testid="tpl-own-title"
      />
      <FieldError message={own.titleProblem} testid="tpl-own-title-error" />
      <Field label="Language" control={languagePicker(st)} />
      <div className="tpl-own-values" data-testid="tpl-own-values">
        {values.map((v, i) => (
          // A value is its place in the message ({{1}}, {{2}}): the row's key is that place. Its name and its example
          // share a line on a phone (Ruben, 10 Oct 2026: each value took two full-width boxes).
          <div className="tpl-own-value" key={i}>
            <Field
              label={`Value ${i + 1}`}
              value={v.label}
              maxLength={TEMPLATE_LABEL_MAX}
              onValueChange={(label) => change(i, { label })}
              placeholder="First name"
              data-testid={`tpl-own-value-${i + 1}-name`}
            />
            <Field
              label={`Value ${i + 1} example`}
              value={v.example}
              maxLength={TEMPLATE_EXAMPLE_MAX}
              onValueChange={(example) => change(i, { example })}
              placeholder="Ana"
              data-testid={`tpl-own-value-${i + 1}-example`}
            />
          </div>
        ))}
      </div>
      <div className="tpl-own-acts">
        <Button
          size="sm"
          onClick={() => setValues((all) => [...all, { label: "", example: "" }])}
          data-testid="tpl-own-value-add"
        >
          <Icon name="plus" size={12} /> {TPL_VERSION_WORDS.addValue}
        </Button>
        {values.length > 0 ? (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => setValues((all) => all.slice(0, -1))}
            data-testid="tpl-own-value-remove"
          >
            {NEW_MESSAGE_WORDS.removeValue}
          </Button>
        ) : null}
      </div>
      <VersionEditor
        name={own.name}
        channel="email"
        language={language}
        start={ownWords}
        slots={own.slots}
        values={own.examples}
        busy={false}
        within={{ onWords: setOwnWords }}
        onSave={acts.begin}
        onClose={() => onCancel?.()}
      />
    </div>
  );
}

/**
 * A new message, in the pane beside the list (parts/split.tsx): its name and what it waits on in the head, Cancel at the
 * head's end -- which asks first when something was written, as Escape does -- the rows in the body and the submit in
 * the foot, where the glass bar stands. It was a card over the list, which pushed the messages down while it was open.
 * Where the message may begin as an email, the body opens on where it is sent: WhatsApp's rows and submit are as they
 * were, and an email's form carries its own Save in the editor.
 */
function newTemplatePane(c: ComposerCtx, made: Made) {
  const { st, facts, acts, work, businessName, numberWhy, begins } = c;
  const { submitting } = st;
  const { submit } = acts;
  const { ready } = facts;
  // Where the composer cannot begin a message of its own, it is WhatsApp's whatever a kept draft says.
  const where = begins ? st.where : "whatsapp";
  const leave = <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="tpl-leave" />;
  return (
    <CmPane
      testid="messages-composer"
      title="New template"
      sub={
        where === "whatsapp"
          ? "WhatsApp reviews it before it can be sent — usually minutes, sometimes a day"
          : where === "email"
            ? NEW_MESSAGE_WORDS.sub
            : undefined
      }
      onClose={work.leave}
      closeLabel="Cancel"
      closeTestid="tpl-close"
      foot={
        // Cancel, and Escape, with words in it: the one question first (UnsavedAsk), where the submit was.
        work.asking ? (
          leave
        ) : where !== "whatsapp" ? null : (
          <>
            <span className="bc-excl-hint">
              The words are yours; WhatsApp approves them. {businessName ? `Sent as ${businessName}.` : ""}
            </span>
            <Button
              variant="primary"
              disabled={!ready || numberWhy !== null}
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
      {begins ? whereRow(c) : null}
      {where === "email" ? ownForm(c) : where === "sms" ? textStep(c) : null}
      {where !== "whatsapp" ? null : numberWhy !== null ? (
        <EmptyState
          kind="line"
          glyph="phone"
          title={numberWhy}
          action={{ label: "Open Connections", to: "admin/integrations" }}
          testid="tpl-no-number"
        />
      ) : (
        <div className="tpl-compose" data-testid="tpl-composer">
          {newRows(c, made)}
        </div>
      )}
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
          <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="tpl-leave" />
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
