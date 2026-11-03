/**
 * Delete… for a selection (3 Nov 2026): the person page's Delete person, for many at a press. A mailbox brought in
 * programs and pitches as people before it judged its senders (decision 0080), and an owner's five erasures an hour made
 * clearing them a day of taps. The owner's alone; fifty at a press, as every act of the bar; the count typed, as the
 * person page types the name; Not a person is the person page's switch, by address alone. Whoever a press could not
 * delete stays selected, and the toast says why. Drawn in the kit's sheet, a side pane on a desk and from the foot on a
 * phone, as Delete person is.
 */
import { useId } from "react";
import { MAILBOX_SENDERS_WORDS, PERSON_DELETE_WORDS } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { Switch } from "../../kit/switch/switch";
import { deletePeopleMany, type DeletedMany } from "../people-detail";
import { DELETE_MANY_CLOSED, type BulkCtx } from "./bulk-state";

/** How many of the selection's names the question says before "and N more". */
const NAMES_SAID = 5;

const howManyPeople = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Delete…'s words: the act, its sheet, its question with the typed count, and what a press says after. */
export const DELETE_MANY_WORDS = {
  act: "Delete…",
  hover: "Delete these people and everything kept about them",
  title: (n: number) => `Delete ${howManyPeople(n)}`,
  who: (names: readonly string[], more: number) => `${names.join(", ")}${more ? ` and ${more} more` : ""}.`,
  typed: (n: number) => `Type ${n} to confirm.`,
  yes: (n: number) => `Delete ${n}`,
  busy: "Deleting…",
  cancel: "Cancel",
  failed: "Could not delete these people.",
  /** What a press did: who went, who did not and why, who was gone already, and who is still selected for the next. */
  said: (r: DeletedMany, more: number, bot: boolean) =>
    [
      r.erased.length
        ? `${howManyPeople(r.erased.length)} deleted${bot ? ": their mail stays in your mailbox" : ""}`
        : "Nobody deleted",
      r.failed.length ? `${r.failed.length} not deleted — ${r.failed[0].message}` : null,
      r.skipped.length ? `${r.skipped.length} already gone` : null,
      r.left.length + more ? `${r.left.length + more} still selected — press Delete again` : null,
    ]
      .filter(Boolean)
      .join(" · "),
} as const;

/** Whether the selection may be deleted from this bar: an owner's, on a page that keeps the act. */
export const mayDeleteMany = (b: BulkCtx) => b.isOwner && b.keeps("delete");

/** Delete…'s acts: open its question, answer it, and close it. */
export function deleteManyActs(b: BulkCtx) {
  const { st, flash, batch, rest, onKeep, onClear, onSheet } = b;
  const { busy, setBusy, del, setDel } = st;
  const askDelete = () => {
    if (busy) return;
    onSheet(null);
    setDel({ ...DELETE_MANY_CLOSED, open: true });
  };
  const closeDelete = () => {
    if (!busy) setDel(DELETE_MANY_CLOSED);
  };
  const confirmDelete = async () => {
    if (busy || del.typed.trim() !== String(batch.length)) return;
    setBusy(true);
    setDel((d) => ({ ...d, error: null }));
    const r = await deletePeopleMany(batch, del.bot);
    setBusy(false);
    if (!r.ok) {
      setDel((d) => ({ ...d, error: r.message || DELETE_MANY_WORDS.failed }));
      return;
    }
    setDel(DELETE_MANY_CLOSED);
    flash({ tone: r.failed.length ? "danger" : "ok", msg: <>{DELETE_MANY_WORDS.said(r, rest.length, del.bot)}</> });
    // Who could not go, and who the press had no time for, stay selected beside the rest of the selection.
    const keep = [...r.failed.map((f) => f.id), ...r.left, ...rest];
    if (keep.length) onKeep(keep);
    else onClear();
  };
  return { askDelete, closeDelete, confirmDelete };
}
type DeleteManyActs = ReturnType<typeof deleteManyActs>;

/**
 * The question: what a delete removes, whom it names, Not a person, and the count typed in the foot. Drawn while asked,
 * on a desk and a phone alike.
 */
export function DeleteManySheet({ b, a }: { b: BulkCtx; a: DeleteManyActs }) {
  const id = useId();
  const { st, batch, picked } = b;
  const { busy, del, setDel } = st;
  const n = batch.length;
  const names = picked.slice(0, n).map((p) => p.name);
  const W = DELETE_MANY_WORDS;
  return (
    <Sheet
      backCloses
      open={del.open && n > 0}
      onClose={a.closeDelete}
      title={W.title(n)}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      footCloses
      foot={
        <Confirm
          danger
          typed={String(n)}
          value={del.typed}
          onType={(v) => setDel((d) => ({ ...d, typed: v }))}
          question={W.typed(n)}
          yes={W.yes(n)}
          no={W.cancel}
          busyLabel={W.busy}
          busy={busy}
          error={del.error}
          onYes={() => void a.confirmDelete()}
          onNo={a.closeDelete}
          testid="bulk-delete"
        />
      }
      testid="bulk-delete-sheet"
    >
      <div className="cl-bulk-delete">
        <p className="cl-prof-ask-detail">{PERSON_DELETE_WORDS.detail}</p>
        <p className="cl-prof-ask-detail" data-testid="bulk-delete-who">
          {W.who(names.slice(0, NAMES_SAID), Math.max(0, names.length - NAMES_SAID))}
        </p>
        <div className="cl-prof-ask-row">
          <span className="cl-prof-ask-detail" id={`${id}-bot`}>
            {MAILBOX_SENDERS_WORDS.notAPerson}
          </span>
          <Switch
            checked={del.bot}
            onCheckedChange={(on) => setDel((d) => ({ ...d, bot: on }))}
            labelledBy={`${id}-bot`}
            readOnly={busy}
            data-testid="bulk-delete-not-a-person"
          />
        </div>
      </div>
    </Sheet>
  );
}
