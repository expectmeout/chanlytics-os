/**
 * The deal sheet's fields (moved from legacy/components/deal-sheet.jsx, decision 0015, step 5): the fields a mode draws,
 * in the one order every mode keeps, each present only where contracts' sheet names it, and the select in the kit's input
 * style that the step sheet draws too. Hookless: each field is a plain function returning its element (never a component),
 * so the tree is the one the JSX drew.
 */
import type { ReactNode } from "react";
import { dealSheetMessage } from "@chanlytics/contracts";
import type { DealSheetDraft, DealSheetProblem, DealSheetVM } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { RecordBox, RecordField, RecordSwitch, RecordToggleGroup } from "../../kit/record/field";

/** A select in the kit's input style, with its label above it, as RecordField draws a box: which service, how a yes was given. */
export function DsSelect({
  id,
  label,
  value,
  options,
  onChange,
  busy = false,
  problem = null,
  testid = null,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  busy?: boolean;
  problem?: ReactNode;
  testid?: string | null;
}) {
  return (
    <div className="rec-field" data-testid={testid || undefined}>
      <label>
        <span className="rec-field-label">{label}</span>
        <select
          className="rec-input deal-sheet-select"
          value={value}
          aria-disabled={busy || undefined}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `rec-${id}-problem` : undefined}
          onChange={(e) => {
            if (!busy) onChange(e.target.value);
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {problem ? <FieldError id={`rec-${id}-problem`} message={problem} /> : null}
    </div>
  );
}

/** What a field is given: the sheet, the draft, how it changes, what is wrong with it, and whether a save is out. */
interface FieldsProps {
  sheet: DealSheetVM;
  draft: DealSheetDraft;
  set: (patch: Partial<DealSheetDraft>) => void;
  problem: DealSheetProblem | null;
  busy: boolean;
}

/** What is wrong with a field, said under it: the words when the problem names it. */
const problemAt = (problem: DealSheetProblem | null, field: string): string | null =>
  problem && problem.field === field ? problem.words : null;

/** For a yes, a pass or an end, the day it happened. */
function whenField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.when) return null;
  return (
    <RecordField
      id="deal-sheet-when"
      label={sheet.when.label}
      problem={problemAt(problem, "when")}
      type="date"
      className="deal-sheet-day"
      max={sheet.when.max}
      value={draft.when}
      onChange={(v) => set({ when: v })}
      readOnly={busy}
      data-testid="deal-sheet-when-input"
      testid="deal-sheet-when"
    />
  );
}

/** Which service a new proposal is for. */
function serviceField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.service) return null;
  return (
    <DsSelect
      id="deal-sheet-service"
      label={sheet.service.label}
      value={draft.service}
      options={sheet.service.options}
      onChange={(v) => set({ service: v })}
      busy={busy}
      problem={problemAt(problem, "service")}
      testid="deal-sheet-service"
    />
  );
}

/** The proposal's link. */
function linkField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.link) return null;
  return (
    <RecordField
      id="deal-sheet-link"
      label={sheet.link.label}
      hint={sheet.link.hint}
      problem={problemAt(problem, "link")}
      value={draft.link}
      onChange={(v) => set({ link: v })}
      readOnly={busy}
      type="url"
      inputMode="url"
      autoComplete="off"
      autoCapitalize="none"
      spellCheck={false}
      placeholder={sheet.link.placeholder}
      maxLength={500}
      data-testid="deal-sheet-link-input"
      testid="deal-sheet-link"
    />
  );
}

/** The value and how often it is paid. */
function valueField({ sheet, draft, set, problem, busy }: FieldsProps) {
  const value = sheet.value;
  if (!value) return null;
  const wrong = problemAt(problem, "value");
  return (
    <div className="rec-field deal-sheet-amount" data-testid="deal-sheet-value">
      <span className="rec-field-label" aria-hidden="true">
        {value.label}
      </span>
      <div className="deal-sheet-amount-row">
        <RecordBox
          id="deal-sheet-value"
          label={value.label}
          value={draft.value}
          onChange={(v) => set({ value: v })}
          readOnly={busy}
          inputMode="decimal"
          autoComplete="off"
          placeholder={value.placeholder}
          invalid={wrong ? "rec-deal-sheet-value-problem" : null}
          aria-describedby={wrong ? undefined : "deal-sheet-value-hint"}
          data-testid="deal-sheet-value-input"
        />
        <RecordToggleGroup
          label={value.perLabel}
          value={draft.per}
          options={value.pers}
          onChange={(v) => set({ per: v })}
          readOnly={busy}
          testid="deal-sheet-per"
        />
      </div>
      {wrong ? (
        <FieldError id="rec-deal-sheet-value-problem" message={wrong} testid="deal-sheet-value-problem" />
      ) : (
        <span className="rec-hint" id="deal-sheet-value-hint">
          {value.hint}
        </span>
      )}
    </div>
  );
}

/** The day the proposal stands until. */
function validField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.validUntil) return null;
  return (
    <RecordField
      id="deal-sheet-valid"
      label={sheet.validUntil.label}
      hint={sheet.validUntil.hint}
      problem={problemAt(problem, "validUntil")}
      type="date"
      className="deal-sheet-day"
      value={draft.validUntil}
      onChange={(v) => set({ validUntil: v })}
      readOnly={busy}
      data-testid="deal-sheet-valid-input"
      testid="deal-sheet-valid"
    />
  );
}

/** Why they passed. */
function reasonField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.reason) return null;
  return (
    <div className="rec-field deal-sheet-reasons" data-testid="deal-sheet-reason">
      <span className="rec-field-label" aria-hidden="true">
        {sheet.reason.label}
      </span>
      <RecordToggleGroup
        label={sheet.reason.label}
        value={draft.reason}
        options={sheet.reason.options}
        onChange={(v) => set({ reason: v })}
        readOnly={busy}
      />
      <FieldError message={problemAt(problem, "reason")} />
    </div>
  );
}

/** A note on a pass. */
function noteField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.note) return null;
  return (
    <RecordField
      id="deal-sheet-note"
      label={sheet.note.label}
      hint={sheet.note.hint}
      problem={problemAt(problem, "note")}
      rows={2}
      maxLength={sheet.note.max}
      placeholder={sheet.note.placeholder}
      value={draft.note}
      onChange={(v) => set({ note: v })}
      readOnly={busy}
      data-testid="deal-sheet-note-input"
      testid="deal-sheet-note"
    />
  );
}

/** How a yes was given: the way, and the message or the form's note that says so. */
function howField({ sheet, draft, set, problem, busy }: FieldsProps) {
  const how = sheet.how;
  if (!how) return null;
  return (
    <div className="deal-sheet-how" data-testid="deal-sheet-how">
      <DsSelect
        id="deal-sheet-how"
        label={how.label}
        value={draft.how}
        options={how.options}
        onChange={(v) => set({ how: v as DealSheetDraft["how"] })}
        busy={busy}
        testid="deal-sheet-how-way"
      />
      {draft.how === "customer_message" && how.messages.length > 0 ? (
        <DsSelect
          id="deal-sheet-message-id"
          label={how.which}
          value={draft.messageId}
          options={how.messages}
          onChange={(v) => set({ messageId: v })}
          busy={busy}
          testid="deal-sheet-how-message"
        />
      ) : null}
      {draft.how === "form" ? (
        <RecordField
          id="deal-sheet-where"
          label={how.where}
          problem={problemAt(problem, "how")}
          maxLength={how.max}
          placeholder={how.wherePlaceholder}
          value={draft.formNote}
          onChange={(v) => set({ formNote: v })}
          readOnly={busy}
          data-testid="deal-sheet-where-input"
          testid="deal-sheet-where"
        />
      ) : null}
    </div>
  );
}

/** The send, with its switch, its reason and, once there is a link to carry, its words. */
function sendField({ sheet, draft, set, problem, busy }: FieldsProps) {
  const send = sheet.send;
  if (!send) return null;
  const hasLink = !!draft.link.trim();
  const sending = !!(send.can && draft.send);
  return (
    <div className="deal-sheet-send" data-testid="deal-sheet-send">
      <div className="deal-sheet-send-row">
        <span className="deal-sheet-send-label" id="deal-sheet-send-label">
          {send.label}
        </span>
        <RecordSwitch
          on={sending}
          onChange={(v) => set({ send: v })}
          labelledBy="deal-sheet-send-label"
          describedBy={send.why ? "deal-sheet-send-why" : null}
          readOnly={busy || !send.can}
          testid="deal-sheet-send-switch"
        />
      </div>
      {send.why ? (
        <span className="rec-hint" id="deal-sheet-send-why" data-testid="deal-sheet-send-why">
          {send.why}
        </span>
      ) : null}
      {/* The words follow the link until they are changed, and appear once there is a link to carry. */}
      {sending && (hasLink || draft.message !== null) ? (
        <RecordField
          id="deal-sheet-message"
          label={send.message.label}
          hint={send.message.hint}
          problem={problemAt(problem, "message")}
          rows={3}
          value={dealSheetMessage(draft)}
          onChange={(v) => set({ message: v })}
          readOnly={busy}
          data-testid="deal-sheet-message-input"
          testid="deal-sheet-message"
        />
      ) : null}
    </div>
  );
}

/**
 * The fields a mode draws, in the one order every mode keeps: for a yes, a pass or an end the day it happened first; then
 * which service, the link, the value and how often, the day it stands until; why, a note, how they said yes; and last the
 * send, with its words. Each is present only where contracts' sheet names it.
 */
/** A row of the Glass composer: the word at the left, what the row holds beside it; nothing when the mode draws none of it. */
function dsRow(word: string, testid: string, parts: ReactNode[]) {
  const held = parts.filter((p) => p !== null && p !== undefined && p !== false);
  if (held.length === 0) return null;
  return (
    <div className="ds-grow" data-testid={testid}>
      <span className="ds-grow-word">{word}</span>
      <div className="ds-grow-body">{held}</div>
    </div>
  );
}

/**
 * The same fields as rows, for Glass (canvas D3, one composer for every move): who and what it is for, what is sent,
 * what it is worth and until when, when it happened and whether it goes out now, how they said yes, why it ended, and
 * the note. A mode's fields fall into the rows they belong to, and a row a mode does not fill is not drawn.
 */
export function DealSheetFieldsGlass(props: FieldsProps) {
  return (
    <div className="deal-sheet-fields ds-rows" data-testid="deal-sheet-rows">
      {dsRow("For", "ds-row-for", [serviceField(props)])}
      {dsRow("Says", "ds-row-says", [linkField(props)])}
      {dsRow("Value", "ds-row-value", [valueField(props), validField(props)])}
      {dsRow("When", "ds-row-when", [whenField(props), sendField(props)])}
      {dsRow("How", "ds-row-how", [howField(props)])}
      {dsRow("Why", "ds-row-why", [reasonField(props)])}
      {dsRow("Note", "ds-row-note", [noteField(props)])}
    </div>
  );
}

export function DealSheetFields(props: FieldsProps) {
  return (
    <div className="deal-sheet-fields">
      {whenField(props)}
      {serviceField(props)}
      {linkField(props)}
      {valueField(props)}
      {validField(props)}
      {reasonField(props)}
      {noteField(props)}
      {howField(props)}
      {sendField(props)}
    </div>
  );
}
