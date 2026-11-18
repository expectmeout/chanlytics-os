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
import { Field } from "../kit/field/field";
import { Icon } from "../kit/icon/icon";
import { Panel } from "../kit/panel/panel";
import { previewVerbs } from "./verbs";

/** What a row's press says: add what it lacks, put its value right, or say what is off about a list. */
const pressOf = (row: PreviewKnowsRowVM): string => (row.missing ? W.add : row.fix === "say" ? W.sayOff : W.fix);

/** One fact: its name, its value, where it was read, and its press; open, the box that puts it right. */
function PvKnownRow({ row, token, look }: { row: PreviewKnowsRowVM; token: string; look: boolean }) {
  const [open, setOpen] = useState(false);
  // A fact's own value is what is typed over; a list's, and one it lacks, start empty.
  const [said, setSaid] = useState(row.missing || row.fix === "say" ? "" : row.value);
  const [busy, setBusy] = useState(false);
  const [theirs, setTheirs] = useState<string | null>(null);
  const [thanked, setThanked] = useState(false);
  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    const right = said.trim();
    if (!right || busy) return;
    setBusy(true);
    const answer = await previewVerbs.notRight(token, row.label, right);
    setBusy(false);
    if (!answer.ok) return;
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
          {theirs ? `${W.from.you} · ${W.fixed}` : thanked ? W.notRightThanks : row.from}
        </span>
      </span>
      {look || open || thanked ? null : (
        <Button
          variant={lacks ? "outline" : "quiet"}
          size="touch"
          onClick={() => setOpen(true)}
          data-testid={`pv-not-right-${row.key}`}
        >
          {lacks || row.fix === "say" ? null : <Icon name="pencil" size={14} />}
          {pressOf(row)}
        </Button>
      )}
      {open ? (
        <form className="pv-edit" onSubmit={save}>
          <Field
            aria-label={row.fix === "say" ? W.sayOffLabel : row.label}
            rows={2}
            value={said}
            onValueChange={setSaid}
            readOnly={busy}
            maxLength={300}
            data-testid={`pv-not-right-text-${row.key}`}
          />
          <span className="pv-edit-acts">
            <Button variant="quiet" size="touch" onClick={() => setOpen(false)}>
              {W.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="touch"
              disabled={busy || !said.trim()}
              data-testid={`pv-not-right-send-${row.key}`}
            >
              {W.save}
            </Button>
          </span>
        </form>
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
