"use client";

/**
 * A lead's own preview, What it knows whole (decision 0079; the redesign of 17 November 2026): every fact with where it
 * was read, each put right in place; one the listing never had, added the same way; its services, a list no sentence
 * replaces, taking what is off about them; and what the business told it. A view of the page, as the call is: the page
 * is a stranger's, opened from an email, so nothing of the app's frame rides in for a sheet. Every word is contracts'.
 *
 * Putting a fact right is the page's not-right door: where they say what is right, the record takes it at once and the
 * row is theirs ("From you"); where they only say something is off, the line reaches whoever wrote to them.
 */
import { useState, type SyntheticEvent } from "react";
import { LEAD_PREVIEW_WORDS as W, type PreviewKnowsRowVM, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { previewVerbs } from "./verbs";

/** What a row's press says: add what it lacks, put its value right, or say what is off about a list. */
const knownPressOf = (row: PreviewKnowsRowVM, lacks: boolean): string =>
  lacks ? W.add : row.fix === "say" ? W.sayOff : W.fix;

/** A row's press, which opens the box that puts it right: outlined where the fact is one it lacks. */
function PvKnownPress({ row, lacks, onOpen }: { row: PreviewKnowsRowVM; lacks: boolean; onOpen: () => void }) {
  const list = row.fix === "say";
  return (
    <Button variant={lacks ? "outline" : "quiet"} size="touch" onClick={onOpen} data-testid={`pv-not-right-${row.key}`}>
      {lacks || list ? null : <Icon name="pencil" size={14} />}
      {knownPressOf(row, lacks)}
    </Button>
  );
}

/** The box that puts a fact right: what is right, or what is off about a list, then Cancel and Save. */
function PvKnownEdit(props: {
  row: PreviewKnowsRowVM;
  said: string;
  busy: boolean;
  problem: string | null;
  onSaid: (words: string) => void;
  onCancel: () => void;
  onSave: (event: SyntheticEvent) => void;
}) {
  const { row, busy } = props;
  return (
    <form className="pv-edit" onSubmit={props.onSave}>
      <Field
        aria-label={row.fix === "say" ? W.sayOffLabel : row.label}
        rows={2}
        value={props.said}
        onValueChange={props.onSaid}
        readOnly={busy}
        maxLength={300}
        data-testid={`pv-not-right-text-${row.key}`}
        {...fieldProblem(props.problem)}
      />
      <span className="pv-edit-acts">
        <Button variant="quiet" size="touch" onClick={props.onCancel}>
          {W.cancel}
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="touch"
          disabled={busy || !props.said.trim()}
          data-testid={`pv-not-right-send-${row.key}`}
        >
          {W.save}
        </Button>
      </span>
    </form>
  );
}

/** What a row says under its value: where it was read, or that it is theirs now, or that what they said was heard. */
const knownFromOf = (row: PreviewKnowsRowVM, theirs: string | null, thanked: boolean): string =>
  theirs ? `${W.from.you} · ${W.fixed}` : thanked ? W.notRightThanks : row.from;

/** One fact: its name, its value, where it was read, and its press; open, the box that puts it right. */
function PvKnownRow({ row, token, look }: { row: PreviewKnowsRowVM; token: string; look: boolean }) {
  const [open, setOpen] = useState(false);
  // A fact's own value is what is typed over; a list's, and one it lacks, start empty.
  const [said, setSaid] = useState(row.missing || row.fix === "say" ? "" : row.value);
  const [busy, setBusy] = useState(false);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [thanked, setThanked] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    const right = said.trim();
    if (!right || busy) return;
    setBusy(true);
    setProblem(null);
    const answer = await previewVerbs.notRight(token, row.label, right);
    setBusy(false);
    if (!answer.ok) {
      setProblem(answer.message ?? W.failed);
      return;
    }
    setOpen(false);
    // A list keeps its own words, with theirs told beside it: the row says it was heard, never that it changed.
    if (answer.data.fixed && row.fix === "value") setTheirs(right);
    else setThanked(true);
  };
  const lacks = row.missing && theirs === null;
  return (
    <div className="pv-known" data-missing={lacks || undefined} data-testid={`pv-knows-${row.key}`}>
      <span className="pv-known-words">
        <span className="pv-quiet">{row.label}</span>
        <span className="pv-answer" data-testid={`pv-knows-value-${row.key}`}>
          {theirs ?? row.value}
        </span>
        <span className="pv-quiet" role={theirs || thanked ? "status" : undefined}>
          {knownFromOf(row, theirs, thanked)}
        </span>
      </span>
      {look || open || thanked ? null : <PvKnownPress row={row} lacks={lacks} onOpen={() => setOpen(true)} />}
      {open ? (
        <PvKnownEdit
          row={row}
          said={said}
          busy={busy}
          problem={problem}
          onSaid={setSaid}
          onCancel={() => setOpen(false)}
          onSave={save}
        />
      ) : null}
    </div>
  );
}

/** What it knows, whole: what it lacks first, then each fact, then what they told it. */
export function PvKnows({
  vm,
  told,
  token,
  look,
  onDone,
}: {
  vm: PreviewPageVM;
  told: readonly string[];
  token: string;
  look: boolean;
  onDone: () => void;
}) {
  const rows = [...vm.knows.filter((row) => row.missing), ...vm.knows.filter((row) => !row.missing)];
  return (
    <section className="pv-knows" aria-labelledby="pv-knows-title" data-testid="pv-knows">
      <div className="pv-knows-head">
        <h1 className="pv-name" id="pv-knows-title">
          {W.knowsTitle}
        </h1>
        <Button
          variant="glass"
          size="touch"
          iconOnly
          aria-label={W.knowsDone}
          onClick={onDone}
          data-testid="pv-knows-done"
        >
          <Icon name="x" size={14} />
        </Button>
      </div>
      <p className="pv-by">{W.knowsSub}</p>
      <Panel className="pv-known-list">
        {rows.map((row) => (
          <PvKnownRow key={row.key} row={row} token={token} look={look} />
        ))}
      </Panel>
      {told.length ? (
        <Panel className="pv-known-list" data-testid="pv-teach">
          <span className="pv-label">{W.toldTitle}</span>
          {told.map((line, at) => (
            <p key={`${at}:${line}`} className="pv-answer" data-testid={`pv-taught-${at}`}>
              {line}
            </p>
          ))}
        </Panel>
      ) : null}
    </section>
  );
}
