/**
 * The picker and New, steps of the same sheet (the canvas's PhonePicker and PhoneNew boards, 18 Oct 2026: "the only place
 * a sequence is chosen or made, always one tap away"): the picker lists every sequence to leads Add can go to, by its
 * state and one line, said once whether the lead can join any; a tap adds it there, and that sequence becomes the pick for
 * the search. New sequence takes a name and a start (a copy of the pick, Ask's draft from your goal and this search, or
 * blank) and makes a draft holding the lead, which becomes the pick: its emails are written once, after the pile.
 * ‹ Back returns to the card.
 *
 * The same two steps serve many leads at once (the bulk bar's Add N ▾), named by how many.
 */
import { useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { LEAD_SHEET_WORDS as W, newStartFirst, type LeadPickerRowVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { ListRow } from "../../kit/list-row/list-row";
import { StatePill } from "../../kit/pill/state-pill";
import { focusAsDrawn, gate } from "../../legacy-verbs";

/** A row that is a press: Enter and Space press it, as a button's would. */
const pressKeys = (go: () => void) => (e: KeyboardEvent) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  go();
};

/** ‹ Back to the card, and the step's title. */
const stepHead = (title: string, onBack: () => void, sub?: string | null) => (
  <div className="lw-step-h">
    <Button variant="quiet" size="sm" onClick={onBack} data-testid="lead-sheet-step-back">
      <Icon name="chevron" size={11} className="lw-back-glyph" />
      {W.back}
    </Button>
    <div className="lw-step-t">
      <b>{title}</b>
      {sub ? <span>{sub}</span> : null}
    </div>
  </div>
);

interface PickerProps {
  /** Who goes: the lead's short name, or how many. */
  who: { name: string } | { count: number };
  rows: readonly LeadPickerRowVM[] | null;
  /** The add door's one answer for who goes, said once ("Persida can join any of these"), or why one cannot. */
  canJoin: string | null;
  busy: boolean;
  onPick: (row: LeadPickerRowVM) => void;
  onNew: () => void;
  onBack: () => void;
}

/** The picker: each sequence to leads, the pick marked, and New sequence. */
export function SheetPicker(p: PickerProps) {
  const title = "name" in p.who ? W.picker.title(p.who.name) : W.picker.titleMany(p.who.count);
  return (
    <div className="lw-step" data-testid="lead-sheet-picker">
      {stepHead(title, p.onBack, W.picker.sub)}
      {p.canJoin ? (
        <p className="lw-say quiet" data-testid="lead-sheet-can-join">
          {p.canJoin}
        </p>
      ) : null}
      <div className="lw-h">
        <span>{W.picker.yours}</span>
      </div>
      {p.rows === null ? (
        <div className="sq-reading" aria-busy="true" />
      ) : p.rows.length === 0 ? (
        <p className="lw-say quiet">{W.picker.none}</p>
      ) : (
        <div className="lw-pick-rows" role="list">
          {p.rows.map((r) => (
            <ListRow
              key={r.id}
              bare
              role="button"
              tabIndex={0}
              aria-disabled={p.busy || undefined}
              className={r.picked ? "lw-pick-row is-picked" : "lw-pick-row"}
              name={
                <>
                  {r.name} <StatePill kind="tone" value={r.tone} label={r.word} />
                </>
              }
              said={r.picked ? `${r.line} · ${W.picker.pick}` : r.line}
              end={(place) => (r.picked ? <Icon name="check" size={14} className={place} /> : null)}
              onClick={() => !p.busy && p.onPick(r)}
              onKeyDown={pressKeys(() => !p.busy && p.onPick(r))}
              data-testid={`lead-sheet-pick-${r.id}`}
              {...gate("approve", "add this lead to a sequence")}
            />
          ))}
        </div>
      )}
      <ListRow
        bare
        role="button"
        tabIndex={0}
        className="lw-pick-row is-new"
        name={
          <>
            <Icon name="plus" size={14} /> {W.picker.newOne}
          </>
        }
        said={"count" in p.who ? W.picker.newLineMany(p.who.count) : W.picker.newLine}
        onClick={p.onNew}
        onKeyDown={pressKeys(p.onNew)}
        data-testid="lead-sheet-new"
        {...gate("approve", "start a sequence")}
      />
    </div>
  );
}

/** How New starts: a copy of a sequence, Ask's draft, or blank. */
export type NewStart = { kind: "copy"; from: string; name: string } | { kind: "ask" } | { kind: "blank" };

interface NewProps {
  who: { name: string } | { count: number };
  /** The sequence a copy starts from: the pick, else the newest; Change copies another. */
  copies: readonly LeadPickerRowVM[];
  /** The search the leads came from, which Ask's draft writes from; none outside a search. */
  canAsk: boolean;
  /** The name it opens with: the search's, where no sequence has it yet (one press makes it). */
  suggest: string | null;
  busy: boolean;
  /** Ask is writing its draft. */
  drafting: boolean;
  onCreate: (name: string, start: NewStart) => void;
  onBack: () => void;
}

/** One way to start: its words, its line, chosen or not; a press chooses it. */
function StartRow(p: {
  on: boolean;
  title: string;
  line: string;
  end?: ReactNode;
  onPick: () => void;
  testid: string;
}) {
  return (
    <ListRow
      bare
      role="radio"
      aria-checked={p.on}
      tabIndex={0}
      className={p.on ? "lw-start-row is-on" : "lw-start-row"}
      name={p.title}
      said={p.line}
      end={(place) => (
        <span className={place}>
          {p.end}
          {p.on ? <Icon name="check" size={14} /> : null}
        </span>
      )}
      onClick={p.onPick}
      onKeyDown={pressKeys(p.onPick)}
      data-testid={p.testid}
    />
  );
}

/** New sequence: its name, and how it starts; Create and add makes the draft and adds who goes. */
export function SheetNew(p: NewProps) {
  const [name, setName] = useState(p.suggest ?? "");
  const [copyAt, setCopyAt] = useState(0);
  const copy = p.copies.length ? p.copies[copyAt % p.copies.length] : null;
  const [how, setHow] = useState(() => newStartFirst(p.copies, p.canAsk));
  const who = "name" in p.who ? p.who.name : null;
  const start: NewStart =
    how === "copy" && copy
      ? { kind: "copy", from: copy.id, name: copy.name }
      : how === "ask"
        ? { kind: "ask" }
        : { kind: "blank" };
  // Ask writes its draft before the sequence is made: the press says so while it does.
  const drafting = p.drafting || (p.busy && how === "ask");
  const ready = name.trim().length > 0 && !p.busy && !drafting;
  return (
    <div className="lw-step" data-testid="lead-sheet-new-step">
      {stepHead(W.make.title, p.onBack, who ? W.make.sub(who) : W.make.subMany("count" in p.who ? p.who.count : 0))}
      <Field
        label={W.make.name}
        value={name}
        onValueChange={setName}
        maxLength={80}
        // eslint-disable-next-line jsx-a11y-x/no-autofocus -- New opened it to name the sequence
        autoFocus={focusAsDrawn()}
        data-testid="lead-sheet-new-name"
      />
      <div className="lw-h">
        <span>{W.make.from}</span>
      </div>
      <div className="lw-start" role="radiogroup" aria-label={W.make.from}>
        {copy ? (
          <StartRow
            on={how === "copy"}
            title={W.make.copy(copy.name)}
            line={W.make.copyLine}
            end={
              p.copies.length > 1 ? (
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCopyAt((n) => n + 1);
                    setHow("copy");
                  }}
                  data-testid="lead-sheet-new-change"
                >
                  {W.make.change}
                </Button>
              ) : null
            }
            onPick={() => setHow("copy")}
            testid="lead-sheet-new-copy"
          />
        ) : null}
        {p.canAsk ? (
          <StartRow
            on={how === "ask"}
            title={W.make.ask}
            line={W.make.askLine}
            onPick={() => setHow("ask")}
            testid="lead-sheet-new-ask"
          />
        ) : null}
        <StartRow
          on={how === "blank"}
          title={W.make.blank}
          line={W.make.blankLine}
          onPick={() => setHow("blank")}
          testid="lead-sheet-new-blank"
        />
      </div>
      <Button
        variant="primary"
        className="lw-new-go"
        disabled={!ready}
        aria-busy={p.busy || drafting || undefined}
        onClick={() => p.onCreate(name.trim(), start)}
        data-testid="lead-sheet-new-create"
        {...gate("approve", "start a sequence")}
      >
        {drafting ? W.make.drafting : who ? W.make.create(who) : W.make.createMany("count" in p.who ? p.who.count : 0)}
      </Button>
    </div>
  );
}
