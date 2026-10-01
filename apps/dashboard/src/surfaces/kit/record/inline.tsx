/**
 * The record kit: the inline editor (moved whole from legacy/components/record-fold.jsx, decision 0015).
 *
 * The kit's third gesture (spec §5, canvas Edit-Inline), for one value. The row becomes its field, and keeps the row's
 * line: its label stays in the label column (`label`, drawn as rec-inline-<id>-key, which names the whole editor and which
 * the page's field names its box by), the page's field takes the value's place, and where the row's act was sit two small
 * presses, ✓ Save and ✕ Cancel, named by their words for a screen reader and on hover. A one-line row keeps its height as
 * it becomes its editor (record.css measures both at 44px), so nothing under it moves. Under the field, only when there is
 * something to draw: a disagreement on the row (`disputed`, RecordRow's shape), which stays on screen while it is edited,
 * to read (its press is the row's, at rest); what saving writes (RecordSays, as rec-inline-<id>-says, which describes the
 * box); and the page's ask. The disagreement's line carries no id here: the editor is on the page, hidden, while the row
 * is at rest, and the row's own line has the id its press is described by (rec-row-<id>-other), which was in the document
 * twice.
 *
 *   const website = useRecordFold("website", { dirty: changed });
 *   {website.open ? null : <RecordRow id="website" act={{ label: "Change", onClick: website.request }} ... />}
 *   <RecordInline id="website" label="Website" open={website.open} says={lines} saysLabel="It will say"
 *                 confirm={asking ? <Confirm ... /> : null} onSave={save} onCancel={cancel} saving={busy} gate={…}>
 *     <RecordField id="website-box" label={null} aria-labelledby="rec-inline-website-key" … />
 *   </RecordInline>
 *
 * Its keys: Escape cancels and Ctrl or Cmd with Enter saves, as a fold's do (recKeys); and Enter alone, pressed in an
 * <input>, saves too, since one value in one box is what Enter has always sent. A textarea keeps Enter for its newline,
 * and a box that took the key first (a combobox picking from its list) keeps it. The presses name no key: the ? sheet is
 * the one place a key is drawn (Ruben, 23 Sep 2026).
 *
 * Like a fold it is drawn on every render and flips `open`: closed, it is `hidden`, whole. It holds nothing of its own:
 * whether it is open comes from the registry (useRecordFold), and the draft, the check and the save are the page's. It
 * shares the fold's focus and keys, and registers with the registry as a fold does (drawn). Save is busy, not disabled,
 * while it saves, for RecordFoot's reason: it stays a button focus rests on, says so, and a press does nothing
 * meanwhile; nor does Cancel's.
 */
import { useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Icon } from "../icon/icon";
import { recKeys, useRecDrawn, useRecFocus } from "./focus";
import type { FoldId } from "./registry";
import { RecordDispute } from "./row";
import { RecordSays } from "./says";

interface RecordInlineProps {
  id: FoldId;
  label: ReactNode;
  open?: boolean;
  says?: string | null;
  saysLabel?: ReactNode;
  gone?: string | null;
  goneLabel?: ReactNode;
  note?: ReactNode;
  disputed?: { value?: ReactNode; source?: string | null; sentence?: ReactNode } | null;
  confirm?: ReactNode;
  onSave?: ((e?: MouseEvent<HTMLButtonElement>) => void) | null;
  onCancel?: ((e?: MouseEvent<HTMLElement>) => void) | null;
  saving?: boolean;
  saveLabel?: string;
  savingLabel?: string;
  cancelLabel?: string;
  gate?: Record<string, unknown> | null;
  changed?: number[] | null;
  goneChanged?: number[] | null;
  children?: ReactNode;
}

/** What saving writes, drawn beside the field. */
function inlineTold(props: RecordInlineProps) {
  const { id, says = null, saysLabel = null, gone = null, goneLabel = null, note = null } = props;
  const { changed = null, goneChanged = null } = props;
  return (
    <RecordSays
      id={`rec-inline-${id}-says`}
      testid={`rec-inline-says-${id}`}
      text={says}
      label={saysLabel}
      gone={gone}
      goneLabel={goneLabel}
      note={note}
      changed={changed}
      goneChanged={goneChanged}
      inline
    />
  );
}

/** The two small presses where the row's act was: ✓ Save and ✕ Cancel. */
function inlineActs(props: RecordInlineProps) {
  const { id, onSave, onCancel, saving = false, saveLabel = "Save", savingLabel = "Saving…" } = props;
  const { cancelLabel = "Cancel", gate = null } = props;
  return (
    <div className="rec-inline-acts">
      <button
        type="button"
        className="rec-inline-act"
        data-act="save"
        onClick={(e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          if (onSave) onSave(e);
        }}
        aria-label={saving ? savingLabel : saveLabel}
        title={saveLabel}
        aria-disabled={saving || undefined}
        aria-busy={saving || undefined}
        data-testid={`rec-inline-save-${id}`}
        {...(gate || {})}
      >
        <Icon name="check" size={13} />
      </button>
      <button
        type="button"
        className="rec-inline-act"
        data-act="cancel"
        onClick={(e) => {
          if (saving) {
            e.preventDefault();
            return;
          }
          if (onCancel) onCancel(e);
        }}
        aria-label={cancelLabel}
        title={cancelLabel}
        aria-disabled={saving || undefined}
        data-testid={`rec-inline-cancel-${id}`}
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

/** One value, edited in the row that states it. */
export function RecordInline(props: RecordInlineProps) {
  const { id, label, open = true, confirm = null, saving = false, gate = null, onSave, onCancel } = props;
  const { says = null, gone = null, note = null, disputed = null, children = null } = props;
  const box = useRef<HTMLDivElement | null>(null);
  // Its ask is not drawn while it saves, as a fold's is not.
  const ask = saving ? null : confirm;
  const onFocus = useRecFocus(id, open, box, { inner: ".rec-inline-body", fallback: null });
  useRecDrawn(id);
  const keyId = `rec-inline-${id}-key`;
  const refused = !!(gate && gate["aria-disabled"]);
  const foldKeys = recKeys({ onCancel, onSave, saving, refused });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    foldKeys(e);
    if (e.defaultPrevented || e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
    const t = e.target as HTMLElement | null;
    if (!t || t.tagName !== "INPUT" || !e.currentTarget || !e.currentTarget.contains(t)) return;
    if (!onSave || saving || refused) return;
    e.preventDefault();
    onSave();
  };
  const told = inlineTold(props);
  const other = disputed ? (
    <RecordDispute disputed={{ value: disputed.value, source: disputed.source, sentence: disputed.sentence }} />
  ) : null;
  // Drawn only with something in it, so a one-line row has one line: RecordSays draws nothing of nothing.
  const more =
    other || ask || (typeof says === "string" && says.trim()) || (typeof gone === "string" && gone.trim()) || note;
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- the editor takes its own focus and keys (Escape, Enter, Ctrl+Enter)
    <div
      ref={box}
      className="rec-inline"
      role="group"
      aria-labelledby={keyId}
      aria-busy={saving || undefined}
      data-open={open ? "true" : "false"}
      hidden={open ? undefined : true}
      data-testid={`rec-inline-${id}`}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
    >
      <span className="rec-inline-key" id={keyId}>
        {label}
      </span>
      <div className="rec-inline-body">{children}</div>
      {inlineActs(props)}
      {more ? (
        <div className="rec-inline-more">
          {other}
          {told}
          {ask}
        </div>
      ) : null}
    </div>
  );
}
