/**
 * What saving writes, and the foot (moved whole from legacy/components/record-fold.jsx, decision 0015).
 *
 * RecordSays is the composer's own words for what saving writes: the lines it adds, under the page's eyebrow (`label`);
 * the lines it takes away, under a second (`goneLabel`); and a sentence of the page's own before them (`note`), where
 * the change reaches past its lines. Nothing to say draws nothing, never an empty block. `inline` sets each eyebrow
 * beside its lines, as an inline editor's row does on a desktop; a fold, and every phone, stacks them.
 *
 * Each line is a span of its own inside the block's <pre>, in the same text, newlines and all. `changed` and
 * `goneChanged` are the indexes of the lines of `text` and of `gone` that the draft has just changed: the page works
 * that out, since it holds the block before and after, and the kit marks those lines `data-changed` for record.css's
 * wash (spec §9, item 3: only the changed clause, once). A line is keyed by its words, so a line rewritten is a new
 * element and washes as it arrives, and a line that stays keeps its element and never washes again, whatever else is
 * marked.
 *
 * RecordFoot is Save and Cancel, and beside them a line of the page's (`footNote`). The keys that do the same (recKeys)
 * are not named here: the ? sheet is the one place a key is drawn. Save is busy, not disabled, while it saves: a
 * disabled button lets go of focus, to the page, and a save that failed left it there. It stays a button focus can rest
 * on, and a press while it saves does nothing; so does a press on Cancel, for the reason recKeys gives.
 */
import { Fragment } from "react";
import type { MouseEvent, ReactNode } from "react";

const recSaysLines = (text: string, marks: number[] | null) => {
  const on = new Set(Array.isArray(marks) ? marks : []);
  const seen = new Map<string, number>();
  return text.split("\n").map((line, i) => {
    const n = (seen.get(line) || 0) + 1;
    seen.set(line, n);
    return (
      <Fragment key={`${n}:${line}`}>
        {i ? "\n" : null}
        <span className="rec-says-line" data-changed={on.has(i) ? "true" : undefined}>
          {line}
        </span>
      </Fragment>
    );
  });
};

interface RecordSaysProps {
  id?: string | null;
  testid?: string | null;
  text?: string | null;
  label?: ReactNode;
  gone?: string | null;
  goneLabel?: ReactNode;
  note?: ReactNode;
  inline?: boolean;
  changed?: number[] | null;
  goneChanged?: number[] | null;
}

/** What saving writes: the lines it adds, the lines it takes away, and a sentence of the page's. */
export function RecordSays({
  id = null,
  testid = null,
  text = null,
  label = null,
  gone = null,
  goneLabel = null,
  note = null,
  inline = false,
  changed = null,
  goneChanged = null,
}: RecordSaysProps) {
  const writes = typeof text === "string" && text.trim() !== "";
  const drops = typeof gone === "string" && gone.trim() !== "";
  if (!writes && !drops && !note) return null;
  return (
    <div
      className="rec-says"
      id={id || undefined}
      data-inline={inline ? "true" : undefined}
      data-testid={testid || undefined}
    >
      {note ? (
        <p className="rec-says-note" data-testid={testid ? `${testid}-note` : undefined}>
          {note}
        </p>
      ) : null}
      {writes ? (
        <div className="rec-says-part" data-part="says">
          {label ? <span className="rec-says-eyebrow">{label}</span> : null}
          <pre>{recSaysLines(text, changed)}</pre>
        </div>
      ) : null}
      {drops ? (
        <div className="rec-says-part" data-part="gone">
          {goneLabel ? <span className="rec-says-eyebrow">{goneLabel}</span> : null}
          <pre>{recSaysLines(gone, goneChanged)}</pre>
        </div>
      ) : null}
    </div>
  );
}

interface RecordFootProps {
  saveTestid?: string;
  cancelTestid?: string;
  onSave?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  onCancel?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  saving?: boolean;
  saveLabel?: ReactNode;
  savingLabel?: ReactNode;
  cancelLabel?: ReactNode;
  gate?: Record<string, unknown> | null;
  footNote?: ReactNode;
}

/** The foot: Save and Cancel, and beside them a line of the page's. */
export function RecordFoot({
  saveTestid,
  cancelTestid,
  onSave,
  onCancel,
  saving = false,
  saveLabel = "Save",
  savingLabel = "Saving…",
  cancelLabel = "Cancel",
  gate = null,
  footNote = null,
}: RecordFootProps) {
  return (
    <div className="rec-foot">
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={(e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          if (onSave) onSave(e);
        }}
        aria-disabled={saving || undefined}
        aria-busy={saving || undefined}
        data-testid={saveTestid}
        {...(gate || {})}
      >
        {saving ? savingLabel : saveLabel}
      </button>
      <button
        type="button"
        className="btn btn-sm btn-ghost"
        onClick={(e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          if (onCancel) onCancel(e);
        }}
        aria-disabled={saving || undefined}
        data-testid={cancelTestid}
      >
        {cancelLabel}
      </button>
      {footNote ? <span className="rec-foot-note">{footNote}</span> : null}
    </div>
  );
}
