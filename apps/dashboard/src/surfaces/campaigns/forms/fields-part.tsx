/**
 * A form as a visitor will see it, changed in place (the Forms canvas, "The draft, changed in place"): press a
 * question to change its words, its choices, whether it is needed, its place, or to remove it. A new question is made
 * by saying what to ask: AI proposes it, and it is the owner's to add. No list of kinds to pick from, and no second
 * screen.
 *
 * What is typed is kept by use-forms.ts's draft; this draws it and says each change.
 */
import { useState } from "react";
import { CHOICE_KINDS, FORM_LIMITS, type FormDescription, type FormField } from "@chanlytics/contracts";
import { AskLooking } from "../../files/looking";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { Switch } from "../../kit/switch/switch";
import { SayLine } from "./say-line";
import { doFormPress, type DraftEditing } from "./use-forms";
import { FORMS_WORDS as W } from "./words";

const PART_WORDS = W.form;

/** An id for a choice made here: short, and not one the question already holds. */
function newChoiceId(field: FormField): string {
  const held = new Set((field.choices ?? []).map((choice) => choice.id));
  for (let n = held.size + 1; ; n++) if (!held.has(`c${n}`)) return `c${n}`;
}

/** The draft with one question changed, moved or removed. */
const withField = (draft: FormDescription, id: string, next: FormField | null): FormDescription => ({
  ...draft,
  fields: draft.fields.flatMap((field) => (field.id === id ? (next ? [next] : []) : [field])),
});

function fieldMoved(draft: FormDescription, id: string, by: -1 | 1): FormDescription {
  const at = draft.fields.findIndex((field) => field.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= draft.fields.length) return draft;
  const fields = [...draft.fields];
  const [field] = fields.splice(at, 1);
  if (field) fields.splice(to, 0, field);
  return { ...draft, fields };
}

/** A question as a visitor sees it: its words, and a blank box or its choices. */
function QuestionShown({ field }: { field: FormField }) {
  return (
    <>
      <strong>
        {field.label}
        {field.needed ? null : <em>{PART_WORDS.optional}</em>}
      </strong>
      {field.help ? <p>{field.help}</p> : null}
      {field.choices?.length ? (
        <div className="fmv-opts">
          {field.choices.map((choice) => (
            <span key={choice.id}>{choice.label}</span>
          ))}
        </div>
      ) : (
        <div className="fmv-blank" data-tall={field.kind === "long" || undefined} />
      )}
    </>
  );
}

/** A question being changed: its words, its choices, whether it is needed, its place, and the way to remove it. */
function QuestionChanged({
  field,
  at,
  onChange,
  onMove,
}: {
  field: FormField;
  at: { first: boolean; last: boolean; only: boolean };
  onChange: (next: FormField | null) => void;
  onMove: (by: -1 | 1) => void;
}) {
  const choices = field.choices ?? [];
  const setChoice = (id: string, label: string) =>
    onChange({ ...field, choices: choices.map((choice) => (choice.id === id ? { ...choice, label } : choice)) });
  return (
    <>
      <Field
        label={PART_WORDS.labelOf}
        value={field.label}
        onValueChange={(label) => onChange({ ...field, label })}
        maxLength={FORM_LIMITS.label}
        data-testid="forms-q-label"
      />
      <Field
        label={PART_WORDS.helpOf}
        value={field.help ?? ""}
        onValueChange={(help) => onChange({ ...field, help: help || undefined })}
        maxLength={FORM_LIMITS.help}
        data-testid="forms-q-help"
      />
      {CHOICE_KINDS.has(field.kind) ? (
        <div className="fmv-choices">
          {choices.map((choice) => (
            <div key={choice.id} className="fmv-choice">
              <Field
                aria-label={PART_WORDS.choiceLabel}
                value={choice.label}
                onValueChange={(label) => setChoice(choice.id, label)}
                maxLength={FORM_LIMITS.label}
              />
              <Button
                iconOnly
                variant="quiet"
                size="sm"
                disabled={choices.length <= 2}
                aria-label={PART_WORDS.removeChoice(choice.label)}
                onClick={() => onChange({ ...field, choices: choices.filter((other) => other.id !== choice.id) })}
              >
                <Icon name="x" size={12} />
              </Button>
            </div>
          ))}
          {choices.length < FORM_LIMITS.choices ? (
            <Button
              size="sm"
              onClick={() => onChange({ ...field, choices: [...choices, { id: newChoiceId(field), label: "" }] })}
              data-testid="forms-q-add-choice"
            >
              <Icon name="plus" size={12} />
              {PART_WORDS.addChoice}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="fmv-tools">
        <Switch
          label={PART_WORDS.needed}
          checked={field.needed}
          onCheckedChange={(needed) => onChange({ ...field, needed })}
          data-testid="forms-q-needed"
        />
        <span className="fmv-tools-word" aria-hidden="true">
          {PART_WORDS.needed}
        </span>
        <span className="fmv-tools-end">
          <Button
            iconOnly
            variant="quiet"
            size="sm"
            disabled={at.first}
            aria-label={PART_WORDS.up}
            onClick={() => onMove(-1)}
          >
            <Icon name="arrow-up" size={13} />
          </Button>
          <Button
            iconOnly
            variant="quiet"
            size="sm"
            disabled={at.last}
            aria-label={PART_WORDS.down}
            onClick={() => onMove(1)}
          >
            <Icon name="arrow-down" size={13} />
          </Button>
          <Button
            iconOnly
            variant="quiet"
            tone="danger"
            size="sm"
            disabled={at.only}
            aria-label={PART_WORDS.remove}
            onClick={() => onChange(null)}
            data-testid="forms-q-remove"
          >
            <Icon name="x" size={13} />
          </Button>
        </span>
      </div>
    </>
  );
}

/** The form's heading and the line under it: as a visitor reads them, or being changed. */
function HeadingBlock({
  draft,
  chosen,
  canChange,
  onChoose,
  onChange,
}: {
  draft: FormDescription;
  chosen: boolean;
  canChange: boolean;
  onChoose: () => void;
  onChange: (next: FormDescription) => void;
}) {
  if (chosen)
    return (
      <div className="fmv-q" data-chosen="">
        <Field
          label={PART_WORDS.heading}
          value={draft.heading}
          onValueChange={(heading) => onChange({ ...draft, heading })}
          maxLength={FORM_LIMITS.heading}
          data-testid="forms-heading"
        />
        <Field
          label={PART_WORDS.intro}
          rows={2}
          value={draft.intro ?? ""}
          onValueChange={(intro) => onChange({ ...draft, intro: intro || undefined })}
          maxLength={FORM_LIMITS.intro}
          data-testid="forms-intro"
        />
      </div>
    );
  return (
    <Pressed className="fmv-hd" on={canChange} onPress={onChoose} testid="forms-heading-shown">
      <h3>{draft.heading}</h3>
      {draft.intro ? <p>{draft.intro}</p> : null}
    </Pressed>
  );
}

/** A part of the form that opens for changing as it is pressed, where this member may change it. */
function Pressed({
  className,
  on,
  onPress,
  testid,
  children,
}: {
  className: string;
  on: boolean;
  onPress: () => void;
  testid: string;
  children: React.ReactNode;
}) {
  if (!on)
    return (
      <div className={className} data-testid={testid}>
        {children}
      </div>
    );
  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      onClick={onPress}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onPress();
      }}
      data-testid={testid}
    >
      {children}
    </div>
  );
}

/** What AI proposes to add: each question the draft does not hold yet, said with its choices and whether it is needed. */
function Proposed({
  draft,
  proposed,
  onAdd,
  onDrop,
}: {
  draft: FormDescription;
  proposed: { form: FormDescription; said: string | null };
  onAdd: () => void;
  onDrop: () => void;
}) {
  const held = new Set(draft.fields.map((field) => field.id));
  const fresh = proposed.form.fields.filter((field) => !held.has(field.id));
  return (
    <Panel variant="inset" size="sm" className="fmv-prop" data-testid="forms-proposed">
      <div className="fmv-by">
        <Icon name="three" size={14} />
        <span>{PART_WORDS.suggests}</span>
      </div>
      {fresh.map((field) => (
        <div key={field.id} className="fmv-prop-q">
          <strong>{field.label}</strong>
          <p>
            {[
              field.choices?.map((choice) => choice.label).join(" · "),
              field.needed ? PART_WORDS.needed : PART_WORDS.optional,
            ]
              .filter(Boolean)
              .join(". ")}
          </p>
        </div>
      ))}
      {proposed.said ? <p>{proposed.said}</p> : null}
      <div className="fmv-acts">
        <Button size="sm" variant="primary" onClick={onAdd} data-testid="forms-proposed-add">
          {PART_WORDS.add}
        </Button>
        <Button size="sm" onClick={onDrop} data-testid="forms-proposed-drop">
          {PART_WORDS.notThis}
        </Button>
      </div>
    </Panel>
  );
}

/** "Ask something else": one line to AI, then what it proposes, the owner's to add. */
function AskMore({ formId, editing }: { formId: string; editing: DraftEditing }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [away, setAway] = useState(false);
  const [proposed, setProposed] = useState<{ form: FormDescription; said: string | null } | null>(null);
  const ask = async (sentence: string) => {
    setBusy(true);
    setAway(false);
    // What is typed is kept first: AI is handed the form as it stands on the page.
    await editing.settle();
    const pressed = await doFormPress({ act: "question", form_id: formId, sentence });
    setBusy(false);
    if (pressed.ok && pressed.data.proposed) {
      setProposed({ form: pressed.data.proposed, said: pressed.data.said });
      return true;
    }
    setAway(true);
    return false;
  };
  if (proposed)
    return (
      <Proposed
        draft={editing.draft}
        proposed={proposed}
        onAdd={() => {
          void editing.put(proposed.form);
          setProposed(null);
          setOpen(false);
        }}
        onDrop={() => setProposed(null)}
      />
    );
  if (!open)
    return (
      <Button className="fmv-more" onClick={() => setOpen(true)} data-testid="forms-ask-more">
        <Icon name="plus" size={13} />
        {PART_WORDS.askMore}
      </Button>
    );
  return (
    <div className="fmv-more-line" aria-busy={busy || undefined}>
      <SayLine
        mark={
          busy ? (
            <span className="fmv-three" data-small="">
              <AskLooking looking />
            </span>
          ) : (
            <Icon name="three" size={15} />
          )
        }
        placeholder={PART_WORDS.askHint}
        label={PART_WORDS.askLabel}
        send={PART_WORDS.askMore}
        busy={busy}
        onSay={ask}
        testid="forms-ask-more-line"
      />
      {away ? (
        <p className="fmv-note" role="status">
          {PART_WORDS.aiAway}
        </p>
      ) : null}
    </div>
  );
}

/** Whether a form asks for a way to answer the person: an email address or a phone number. */
export const asksAWayToAnswer = (draft: FormDescription): boolean =>
  draft.fields.some((field) => field.kind === "email" || field.kind === "phone");

/** A form with no way to answer its visitor cannot go live: said beside the form, with the fix one press away. */
function Blocked({ editing }: { editing: DraftEditing }) {
  const addEmail = () => {
    const held = new Set(editing.draft.fields.map((field) => field.id));
    const id = held.has("email") ? `email${held.size + 1}` : "email";
    const email: FormField = { id, kind: "email", label: W.blocked.email, needed: true };
    // After the name, where a form asks who someone is.
    const [first, ...rest] = editing.draft.fields;
    void editing.put({ ...editing.draft, fields: first ? [first, email, ...rest] : [email] });
  };
  return (
    <Panel variant="inset" size="sm" className="fmv-prop" data-testid="forms-blocked">
      <div className="fmv-by">
        <Icon name="alert" size={13} />
        <span>{W.blocked.by}</span>
      </div>
      <strong>{W.blocked.title}</strong>
      <p>{W.blocked.body}</p>
      <div className="fmv-acts">
        <Button size="sm" variant="primary" onClick={addEmail} data-testid="forms-blocked-fix">
          {W.blocked.fix}
        </Button>
      </div>
    </Panel>
  );
}

interface FormPartProps {
  formId: string;
  editing: DraftEditing;
  /** A published form whose draft holds changes its visitors do not see yet. */
  changed: boolean;
  canChange: boolean;
}

/** The Form part: the heading, each question, the way to ask something else, and what stands in the way of going live. */
export function FormPart({ formId, editing, changed, canChange }: FormPartProps) {
  const [chosen, setChosen] = useState<string | null>(null);
  const { draft } = editing;
  const last = draft.fields.length - 1;
  return (
    <div className="fmv-edit" data-testid="forms-form">
      {changed ? (
        <p className="fmv-state" data-waits="" data-testid="forms-not-live">
          {PART_WORDS.notLiveOne}
        </p>
      ) : null}
      <HeadingBlock
        draft={draft}
        chosen={chosen === "heading"}
        canChange={canChange}
        onChoose={() => setChosen("heading")}
        onChange={editing.change}
      />
      {draft.fields.map((field, index) =>
        chosen === field.id ? (
          <div key={field.id} className="fmv-q" data-chosen="" data-testid="forms-q-chosen">
            <QuestionChanged
              field={field}
              at={{ first: index === 0, last: index === last, only: draft.fields.length === 1 }}
              onChange={(next) => {
                if (!next) setChosen(null);
                editing.change(withField(draft, field.id, next));
              }}
              onMove={(by) => editing.change(fieldMoved(draft, field.id, by))}
            />
          </div>
        ) : (
          <Pressed key={field.id} className="fmv-q" on={canChange} onPress={() => setChosen(field.id)} testid="forms-q">
            <QuestionShown field={field} />
          </Pressed>
        ),
      )}
      {editing.unkept ? (
        <p className="fmv-note" role="alert" data-testid="forms-unkept">
          {editing.unkept}
        </p>
      ) : null}
      {canChange && draft.fields.length < FORM_LIMITS.fields ? <AskMore formId={formId} editing={editing} /> : null}
      {canChange && !asksAWayToAnswer(draft) ? <Blocked editing={editing} /> : null}
      {chosen ? (
        <div className="fmv-acts">
          <LinkButton onClick={() => setChosen(null)} data-testid="forms-done">
            Done
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}
