/**
 * Delete…'s question for a selection (delete-many.tsx), a chunk of its own: whom it deletes under the title, what Not a
 * person does beside it, and the count typed in the foot, which says it cannot be undone. Drawn in the kit's sheet, a
 * side pane on a desk and from the foot on a phone, as Delete person is.
 */
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { DELETE_MANY_WORDS, type DeleteManyActs } from "./delete-many";
import type { BulkCtx } from "./bulk-state";

/** How many of the selection's names the sheet says under its title before "and N more". */
const NAMES_SAID = 5;

/** The question, drawn while asked, on a desk and a phone alike. */
export function DeleteManySheet({ b, a }: { b: BulkCtx; a: DeleteManyActs }) {
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
      title={W.title(n, del.bot)}
      sub={W.who(names.slice(0, NAMES_SAID), Math.max(0, names.length - NAMES_SAID))}
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
      {del.bot ? (
        <p className="cl-prof-ask-detail" data-testid="bulk-delete-mail-out">
          {W.mailOut}
        </p>
      ) : null}
    </Sheet>
  );
}
