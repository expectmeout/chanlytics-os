/**
 * The deal sheet's fields (moved from legacy/components/deal-sheet.jsx, decision 0015, step 5): the fields a mode draws,
 * in the one order every mode keeps, each present only where contracts' sheet names it, and the select in the kit's input
 * style that the step sheet draws too. Hookless: each field is a plain function returning its element (never a component),
 * so the tree is the one the JSX drew.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { dealSheetMessage } from "@chanlytics/contracts";
import type { DealSheetDraft, DealSheetProblem, DealSheetVM } from "@chanlytics/contracts";
import { FieldError } from "../../kit/field-error/field-error";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Token } from "../../kit/picker/token";
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

/** A day as its token says it, "Thu, Oct 30", with the year where it is not this one, from the business's "YYYY-MM-DD". */
function pickedDayWords(day: string, today: string): string {
  const year = day.slice(0, 4) !== today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(year ? { year: "numeric" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

type DayPickModule = typeof import("./day-pick");
let dayPick: DayPickModule | null = null;
let dayPickLoading: Promise<DayPickModule> | null = null;

/** The month a day is picked from, loaded once, as the sheet first draws a day (day-pick.tsx says why). */
export function loadDayPick(): Promise<DayPickModule> {
  // What it reads of the module is named, so the dead-exports check (knip) sees the use.
  dayPickLoading ??= import("./day-pick").then(({ DayPick }) => (dayPick = { DayPick }));
  return dayPickLoading;
}

/**
 * A day, picked from the kit's month over the sheet, its words a token under the label: the browser's own date box drew
 * "mm/dd/yyyy" in the system's type (the fitted sheets, 14 Oct 2026). A day that may be left empty says so while it is,
 * and a word beside it empties it again. The token is drawn at once; the month behind it as its module lands.
 */
function DayField(p: {
  id: string;
  label: string;
  value: string;
  today: string;
  onChange: (day: string) => void;
  busy: boolean;
  problem: string | null;
  empty?: { none: string; clear: string };
  testid: string;
}) {
  const [, landed] = useState(0);
  if (!dayPick) void loadDayPick().then(() => landed((n) => n + 1));
  const token = (
    <Token aria-labelledby={`${p.id}-label`} data-testid={`${p.testid}-input`}>
      <Icon name="calendar" size={13} /> {p.value ? pickedDayWords(p.value, p.today) : (p.empty?.none ?? "")}
    </Token>
  );
  const pick = (day: string) => {
    if (!p.busy) p.onChange(day);
  };
  return (
    <div className="rec-field deal-sheet-day" data-testid={p.testid}>
      <span className="rec-field-label" id={`${p.id}-label`}>
        {p.label}
      </span>
      <span className="ds-day-row">
        {dayPick ? (
          <dayPick.DayPick value={p.value} today={p.today} label={p.label} onPick={pick} trigger={token} />
        ) : (
          token
        )}
        {p.empty && p.value && !p.busy ? (
          <LinkButton onClick={() => p.onChange("")} data-testid={`${p.testid}-clear`}>
            {p.empty.clear}
          </LinkButton>
        ) : null}
      </span>
      {p.problem ? <FieldError id={`rec-${p.id}-problem`} message={p.problem} /> : null}
    </div>
  );
}

/** For a yes, a pass or an end, the day it happened. */
function whenField({ sheet, draft, set, problem, busy }: FieldsProps) {
  if (!sheet.when) return null;
  return (
    <DayField
      id="deal-sheet-when"
      label={sheet.when.label}
      value={draft.when}
      today={sheet.when.max}
      onChange={(v) => set({ when: v })}
      busy={busy}
      problem={problemAt(problem, "when")}
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
      {/* Who sees it is said on the label's line, a lock and its words, where it stood as a line of its own under the
          box (the fitted sheets, 14 Oct 2026); the box is described by it either way. */}
      <span className="rec-field-label ds-label-line" aria-hidden="true">
        {value.label}
        <span className="ds-private" id="deal-sheet-value-private">
          <Icon name="lock" size={10} />
          {value.private}
        </span>
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
          aria-describedby={wrong ? undefined : value.hint ? "deal-sheet-value-hint" : "deal-sheet-value-private"}
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
      ) : value.hint ? (
        <span className="rec-hint" id="deal-sheet-value-hint">
          {value.hint}
        </span>
      ) : null}
    </div>
  );
}

/** The day the proposal stands until, or none. */
function validField({ sheet, draft, set, problem, busy }: FieldsProps) {
  const valid = sheet.validUntil;
  if (!valid) return null;
  return (
    <DayField
      id="deal-sheet-valid"
      label={valid.label}
      value={draft.validUntil}
      today={valid.today}
      onChange={(v) => set({ validUntil: v })}
      busy={busy}
      problem={problemAt(problem, "validUntil")}
      empty={{ none: valid.none, clear: valid.clear }}
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
        // Six whys as chips: in one capsule they wrapped into an oval (the fitted sheets, 14 Oct 2026).
        look="chips"
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
