/**
 * Add to a list (canvas A, More's record group): the kit's Sheet over the page, one row for each list kept by hand with
 * a switch that puts them on it or takes them off, the lists that keep themselves said as they stand, each a door to it
 * on People, and a new list made with them on it, in place, at its foot. Read from the People surface, as their Lists
 * group is (lists.tsx); a change goes through the list verbs and the surface is read again, so a switch is the server's
 * once it lands. A list that waits on its answer holds still.
 */
import { useState } from "react";
import { PERSON_ACT_WORDS, PERSON_LISTS_SHEET_WORDS as W } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { FailedRead } from "../../../kit/empty/empty";
import { Icon } from "../../../kit/icon/icon";
import { RecordBox, RecordSwitch } from "../../../kit/record/field";
import { Sheet } from "../../../kit/sheet/sheet";
import { routeDoor } from "../../../legacy-verbs";
import { lists } from "../../people-lists";
import { plMakeListWith, plUndoList } from "../../lists/doors";
import { clientSegRoute } from "../../person-verbs";
import { usePeopleSeam } from "../use-people";
import type { PageCtx } from "../ctx";

/**
 * A new list with them on it, made where they are (never a trip to People and back): its name, and the press that makes
 * it; the toast after takes it back.
 */
function NewListRow({ c, who }: { c: PageCtx; who: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const make = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const made = await plMakeListWith(n, [c.p.id]);
    setBusy(false);
    if (!made.ok) {
      c.flash({ tone: "danger", msg: <>{made.message || W.notMade}</> });
      return;
    }
    // A fill refused takes the list back with it (plMakeListWith): nothing was made, and the refusal says why.
    if (!made.filled.ok) {
      c.flash({ tone: "danger", msg: <>{made.filled.message || W.notMade}</> });
      return;
    }
    setName("");
    c.flash({
      msg: (
        <>
          <b>{who}</b> {W.onNew} <b>{n}</b>
        </>
      ),
      undo: () => void plUndoList(made.id, n, c.flash),
    });
  };
  return (
    <li className="cl-prof-listpick-row">
      <span className="cl-prof-listpick-name">
        <RecordBox
          id="person-new-list"
          label={W.newListName}
          placeholder={W.newList}
          value={name}
          onChange={setName}
          readOnly={busy}
          onKeyDown={(e) => {
            if (e.key === "Enter") void make();
          }}
          testid="person-lists-sheet-new"
        />
      </span>
      <Button
        size="sm"
        disabled={!name.trim()}
        aria-busy={busy || undefined}
        onClick={() => void make()}
        data-testid="person-lists-sheet-make"
      >
        {busy ? W.making : W.make}
      </Button>
    </li>
  );
}

/** Add to a list, open while the page says so (`c.listsOpen`). */
export function ListsSheet({ c }: { c: PageCtx }) {
  const people = usePeopleSeam();
  const [busy, setBusy] = useState<string | null>(null);
  const id = c.p.id;
  const who = c.first === "them" ? "This person" : c.first;
  const saved = (people && people.saved) || [];
  const byHand = saved.filter((s) => s.byHand);
  const toggle = async (listId: string, name: string, on: boolean) => {
    if (busy) return;
    setBusy(listId);
    const r = await (on ? lists.drop(listId, [id]) : lists.add(listId, [id]));
    setBusy(null);
    if (!r.ok) {
      c.flash({ tone: "danger", msg: <>{r.message || W.failed}</> });
      return;
    }
    c.flash({
      msg: (
        <>
          <b>{who}</b> {W.moved(!on)} <b>{name}</b>
        </>
      ),
    });
  };
  const body =
    people && people.savedRead === false ? (
      <FailedRead kind="line" what="their lists" surface="people" testid="person-lists-sheet-failed" />
    ) : !people ? (
      <div className="route-reading" role="status" aria-busy="true">
        Reading…
      </div>
    ) : (
      <ul className="cl-prof-listpick" data-testid="person-lists-sheet-rows">
        {byHand.map((s) => {
          const on = s.ids.includes(id);
          const labelId = `person-list-${s.id}`;
          return (
            <li key={s.id} className="cl-prof-listpick-row" aria-busy={busy === s.id || undefined}>
              <span id={labelId}>{s.name}</span>
              <RecordSwitch
                on={on}
                labelledBy={labelId}
                onChange={() => void toggle(s.id, s.name, on)}
                testid="person-lists-sheet-switch"
              />
            </li>
          );
        })}
        {c.p.smartLists.map((l) => (
          <li key={l.id} className="cl-prof-listpick-row">
            <a {...routeDoor(clientSegRoute(l.id))} data-door>
              {l.label} <Icon name="chevron" size={10} />
            </a>
            <span className="cl-prof-listpick-src">{W.keepsItself}</span>
          </li>
        ))}
        {byHand.length === 0 ? (
          <li className="cl-prof-listpick-row">
            <span className="cl-prof-listpick-src">{W.none}</span>
          </li>
        ) : null}
        <NewListRow c={c} who={who} />
      </ul>
    );
  return (
    <Sheet
      open={c.listsOpen}
      onClose={() => c.setListsOpen(false)}
      title={PERSON_ACT_WORDS.addToList}
      close={{ label: W.close, glyph: <Icon name="x" size={13} /> }}
      testid="person-lists-sheet"
    >
      {body}
    </Sheet>
  );
}
