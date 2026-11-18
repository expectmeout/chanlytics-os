"use client";

/**
 * A lead's own preview, What it knows (decision 0079; the redesign of 17 November 2026, drawn as its canvas draws it):
 * every fact, each put right in place; one the listing never had, added the same way, in amber; its services, a list
 * no sentence replaces, taking what is off about them; and what the business told it. Two shapes of one row: on a phone,
 * What it knows whole, the rows of a sheet over the page (knows-sheet.tsx), grouped by where each fact was read; on a
 * desk, the facts down their card beside the conversation, each with where it was read over it. Every word is
 * contracts'.
 *
 * Putting a fact right is the page's not-right door: where they say what is right, the record takes it at once and the
 * row is theirs ("From you"); where they only say something is off, the line reaches whoever wrote to them.
 */
import { useState, type SyntheticEvent } from "react";
import { LEAD_PREVIEW_WORDS as W, type PreviewKnowsRowVM, type PreviewPageVM } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Field, fieldProblem } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { previewVerbs } from "./verbs";

/** The two shapes of a row: What it knows whole, its source the group's; or a desk's card, its source over its value. */
type RowShape = "whole" | "side";

/** What a row's press says: add what it lacks, put its value right, or say what is off about a list. */
const knownPressOf = (row: PreviewKnowsRowVM, lacks: boolean): string =>
  lacks ? W.add : row.fix === "say" ? W.sayOff : W.fix;

/**
 * How a row's parts are named for a test, by its shape: a desk's card and What it knows whole both stand in the page
 * once the sheet is open, so each names its own.
 */
const fixIdOf = (shape: RowShape, part: string, row: PreviewKnowsRowVM): string =>
  `${shape === "whole" ? "pv-not-right" : "pv-side-fix"}${part}-${row.key}`;

/** A row's press, which opens the box that puts it right: in amber where the fact is one it lacks. */
function PvKnownPress({
  row,
  lacks,
  shape,
  onOpen,
}: {
  row: PreviewKnowsRowVM;
  lacks: boolean;
  shape: RowShape;
  onOpen: () => void;
}) {
  const list = row.fix === "say";
  return (
    <Button
      variant={lacks ? "outline" : "quiet"}
      size="touch"
      className={lacks ? "pv-add" : undefined}
      onClick={onOpen}
      data-testid={fixIdOf(shape, "", row)}
    >
      {lacks || list ? null : <Icon name="pencil" size={14} />}
      {knownPressOf(row, lacks)}
    </Button>
  );
}

/** The box that puts a fact right: what is right, or what is off about a list, then Cancel and Save. */
function PvKnownEdit(props: {
  row: PreviewKnowsRowVM;
  shape: RowShape;
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
        data-testid={fixIdOf(props.shape, "-text", row)}
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
          data-testid={fixIdOf(props.shape, "-send", row)}
        >
          {W.save}
        </Button>
      </span>
    </form>
  );
}

/** What a row says over its value: its name, or on a desk's card where it was read, or that it is theirs now. */
function knownNameOf(row: PreviewKnowsRowVM, shape: RowShape, theirs: string | null): string {
  if (theirs) return `${W.from.you} · ${W.fixed}`;
  // Whole, a list is named by how many it holds ("17 services") over the list itself.
  if (shape === "whole") return row.short ?? row.label;
  return row.missing ? `${row.label} · ${row.from}` : row.from;
}

/** One fact: what it is, its value, and its press; open, the box that puts it right. */
function PvKnownRow({
  row,
  token,
  look,
  shape,
}: {
  row: PreviewKnowsRowVM;
  token: string;
  look: boolean;
  shape: RowShape;
}) {
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
  const testid = shape === "whole" ? `pv-knows-${row.key}` : `pv-side-${row.key}`;
  return (
    <div className="pv-known" data-missing={lacks || undefined} data-testid={testid}>
      <span className="pv-known-words">
        <span className="pv-known-name" role={theirs ? "status" : undefined}>
          {knownNameOf(row, shape, theirs)}
        </span>
        <span className="pv-known-value" data-testid={`${testid}-value`}>
          {/* On a desk's card a list says how many it holds before the first of them. */}
          {theirs ?? (shape === "side" && row.short ? `${row.short}: ${row.value}` : row.value)}
        </span>
        {thanked ? (
          <span className="pv-known-name" role="status">
            {W.notRightThanks}
          </span>
        ) : null}
      </span>
      {look || open || thanked ? null : (
        <PvKnownPress row={row} lacks={lacks} shape={shape} onOpen={() => setOpen(true)} />
      )}
      {open ? (
        <PvKnownEdit
          row={row}
          shape={shape}
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

/** Its facts by where each was read, those it lacks first: one group a source, in the order the sources first come. */
function factGroupsOf(
  rows: readonly PreviewKnowsRowVM[],
): { from: string; missing: boolean; rows: PreviewKnowsRowVM[] }[] {
  const groups: { from: string; missing: boolean; rows: PreviewKnowsRowVM[] }[] = [];
  for (const row of [...rows.filter((r) => r.missing), ...rows.filter((r) => !r.missing)]) {
    const group = groups.find((g) => g.from === row.from);
    if (group) group.rows.push(row);
    else groups.push({ from: row.from, missing: row.missing, rows: [row] });
  }
  return groups;
}

/**
 * What it knows whole, as its sheet's rows (knows-sheet.tsx): what it lacks first, in amber, then each source's facts,
 * then what they told it.
 */
export function PvKnownGroups({ vm, told, token }: { vm: PreviewPageVM; told: readonly string[]; token: string }) {
  return (
    <div className="pv-knows" data-testid="pv-knows-rows">
      {factGroupsOf(vm.knows).map((group) => (
        <div key={group.from} className="pv-group">
          <span className="pv-label">{group.from}</span>
          <div className="pv-rows" data-missing={group.missing || undefined}>
            {group.rows.map((row) => (
              <PvKnownRow key={row.key} row={row} token={token} look={false} shape="whole" />
            ))}
          </div>
        </div>
      ))}
      {told.length ? (
        <div className="pv-group" data-testid="pv-teach">
          <span className="pv-label">{W.toldTitle}</span>
          <div className="pv-rows">
            {told.map((line, at) => (
              <p key={`${at}:${line}`} className="pv-known pv-known-value" data-testid={`pv-taught-${at}`}>
                {line}
              </p>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * What it knows on a desk, down their card under Call it: each fact with where it was read over it and its press beside
 * it, put right in place; the one it lacks last, in amber, with what its absence costs. Its sender looking presses
 * nothing.
 */
export function PvSideKnows({ vm, token, look }: { vm: PreviewPageVM; token: string; look: boolean }) {
  if (!vm.knows.length) return null;
  const rows = [
    ...vm.knows.filter((row) => !row.missing && row.key === "services"),
    ...vm.knows.filter((row) => !row.missing && row.key !== "services"),
    ...vm.knows.filter((row) => row.missing),
  ];
  return (
    <section className="pv-side-knows" aria-label={W.knowsTitle} data-testid="pv-side-knows">
      <h2 className="pv-label">{W.knowsTitle}</h2>
      {rows.map((row) => (
        <PvKnownRow key={row.key} row={row} token={token} look={look} shape="side" />
      ))}
    </section>
  );
}
