/**
 * Add people: the page's one act (Ruben, 10 Oct 2026: Add a person and Import were two doors to one job), on the record
 * kit's sheet, at every width: one person (add-one.tsx), or a list (add-list.tsx). The choice between the two is the
 * owner's alone, whose door the import is; anyone else adds one person.
 *
 * Nothing moves under the thumb (Ruben, 20 Oct 2026, the canvas "Add people, redesigned": + Note lifted every field
 * 46px, A list dropped the switch 202px, the error landed 300px from its box). So the sheet is steady (it keeps the
 * height it opened at, kit/record/sheet.tsx): what comes and goes changes what is in its room, never where its head is.
 * The switch stands on the title's line; while the lists are picked the title is their way back.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { RecordToggleGroup } from "../../kit/record/field";
import { RecordSheet } from "../../kit/record/sheet";
import { UnsavedAsk, useUnsavedWork } from "../../kit/record/work";
import { gatedProps } from "../../legacy-verbs";
import type { Flash } from "../types";
import { ListPicker, TYPED_KIND, hereOf, oneFields, typedAny, useAddOne } from "./add-one";
import type { AddOne, HandList, Here, KnownPerson, Typed } from "./add-one";
import { listBody, useImport } from "./add-list";
import type { AddList } from "./add-list";

/** The two ways in: one person, or a list as a file. */
type AddWay = "one" | "list";
const ADD_WAYS: { value: AddWay; label: string }[] = [
  { value: "one", label: "One person" },
  { value: "list", label: "A list" },
];

/** What the foot says and does for the way chosen: its act and its words, why it is refused for now, and its Cancel. */
function saveOf(listing: boolean, one: AddOne, list: AddList, here: Here | null) {
  if (!listing) {
    const extras = !!one.note.trim() || one.listIds.length > 0 || one.newLists.length > 0;
    const first = here && /^\p{L}/u.test(here.person.name) ? here.person.name.split(/\s+/)[0] : "them";
    const label = here ? `${extras ? "Add to" : "Open"} ${first}` : "Add";
    return { onSave: one.submit, label, saving: one.busy, refused: null, done: false, cancel: "Cancel" };
  }
  const n = list.readable.length;
  if (list.result && !list.stopped)
    return { onSave: null, label: "", saving: false, refused: null, done: true, cancel: "Done" };
  if (list.result && list.stopped) {
    const left = (n - list.stopped.at).toLocaleString();
    return {
      onSave: list.run,
      label: `Try the other ${left}`,
      saving: list.busy,
      refused: null,
      done: false,
      cancel: "Done",
    };
  }
  const can = !!list.plan && n > 0;
  // Nothing to import yet: Import stands, refused with its reason (the house's gate), so the foot holds its shape.
  const why = !list.plan ? "Choose a file or paste the rows first." : "No row here has a number or an email.";
  return {
    onSave: can ? list.run : () => undefined,
    label: can ? `Import ${n.toLocaleString()} ${n === 1 ? "person" : "people"}` : "Import",
    saving: list.busy,
    refused: can ? null : why,
    done: false,
    cancel: "Cancel",
  };
}

/** A foot of one act, where the kit's pair would offer a Cancel with nothing left to cancel: Done, and the lists' Done. */
const oneAct = (words: string, onPress: () => void, testid: string) => (
  <div className="rec-foot">
    <Button variant="primary" size="sm" onClick={onPress} data-testid={testid}>
      {words}
    </Button>
  </div>
);

/** The title while the lists are picked: the way back, and what the room is for. */
const pickTitle = (onBack: () => void) => (
  <span className="pl-add-pick-title">
    <Button
      iconOnly
      aria-label="Back to their details"
      variant="glass"
      size="sm"
      onClick={onBack}
      data-testid="add-person-list-back"
    >
      <Icon name="chevron" size={14} className="pl-add-back" />
    </Button>
    Put them on
  </span>
);

export function PeopleAddSheet({
  onClose,
  onAdded,
  canImport,
  lists = [],
  openList = null,
  known = [],
  way: firstWay = "one",
  flash = null,
}: {
  onClose: () => void;
  onAdded: (id: string) => void;
  canImport: boolean;
  /** The lists kept by hand a person can be put on as they are added, with how many are on each. */
  lists?: readonly HandList[];
  /** The list kept by hand open on People as the sheet opened: picked already. */
  openList?: string | null;
  /** The people People holds, whom a number or an address typed may turn out to be. */
  known?: readonly KnownPerson[];
  /** The way it opens on: one person, or a list (a door that asks for a client list opens it there). */
  way?: AddWay;
  flash?: Flash | null;
}) {
  const [way, setWay] = useState<AddWay>(firstWay);
  const [picking, setPicking] = useState(false);
  // A person added leaves nothing to keep; the work's own drop is known only once it is made, below.
  const added = useRef<() => void>(() => undefined);
  const one = useAddOne({
    onClose: () => {
      added.current();
      onClose();
    },
    onAdded,
    flash,
    firstLists: openList && lists.some((l) => l.id === openList) ? [openList] : [],
  });
  const list = useImport({ flash });
  const here = useMemo(() => hereOf(known, one.phone, one.email), [known, one.phone, one.email]);
  const listing = canImport && way === "list";
  const save = saveOf(listing, one, list, here);
  // Words typed and not yet added, a person's details or a list read and not yet imported, are asked about before
  // Cancel, the wash, a pull or Escape throw them away (Ruben, 19 Oct 2026: a name typed went on Cancel unasked).
  const typed: Typed = {
    name: one.name,
    phone: one.phone,
    email: one.email,
    note: one.note,
    listIds: one.listIds,
    newLists: one.newLists,
  };
  const work = useUnsavedWork(TYPED_KIND, null, {
    value: typed,
    dirty: listing ? !!list.plan && !list.result && !list.busy : typedAny(typed) && !one.busy,
    onLeave: onClose,
  });
  useEffect(() => {
    added.current = work.done;
  });
  // Back from the lists, the row that opened them has the focus again.
  const wasPicking = useRef(false);
  const listsRow = one.refs.lists;
  useEffect(() => {
    if (wasPicking.current && !picking && listsRow.current) listsRow.current.focus({ preventScroll: true });
    wasPicking.current = picking;
  }, [picking, listsRow]);
  const back = () => setPicking(false);
  const picked = one.listIds.length + one.newLists.length;
  return (
    <RecordSheet
      backCloses
      steady
      id="people-add"
      title={picking ? pickTitle(back) : "Add people"}
      tools={
        // The choice is the owner's, whose door the import is; it waits while a list goes in, and goes once it is in.
        canImport && !picking && !save.done ? (
          <RecordToggleGroup
            label="How to add them"
            value={way}
            options={ADD_WAYS}
            onChange={setWay}
            readOnly={one.busy || list.busy}
            testid="people-add-way"
          />
        ) : null
      }
      toolsInLine
      onClose={work.leave}
      confirm={work.asking ? <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="people-add-leave" /> : null}
      closeLabel={save.done ? "Done" : "Cancel"}
      onSave={picking ? null : save.onSave}
      saveLabel={save.label}
      saving={save.saving}
      savingLabel={listing ? "Importing…" : "Adding…"}
      cancelLabel={save.cancel}
      gate={save.refused ? gatedProps(save.refused) : null}
      foot={
        picking
          ? oneAct(
              picked ? `Done · ${picked} ${picked === 1 ? "list" : "lists"}` : "Done",
              back,
              "add-person-list-done",
            )
          : save.done
            ? oneAct("Done", onClose, "import-done")
            : null
      }
      className="pl-add"
      testid="people-add-sheet"
    >
      <div className="pl-import" data-way={listing ? "list" : "one"}>
        {picking ? (
          <ListPicker one={one} lists={lists} openList={openList} onBack={back} />
        ) : listing ? (
          listBody(list)
        ) : (
          oneFields(one, lists, here, () => setPicking(true))
        )}
      </div>
    </RecordSheet>
  );
}
