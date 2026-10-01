/**
 * What the open list lets the page do (moved whole from legacy/pages/people.jsx, decision 0015): make a list on the rail,
 * bring an archived one back, open a list made here, take the list as a file, its own step, pick a list, take one person
 * off it; and the phone's sheets' acts -- Add a person, and the open list's rename, delete and "Save these".
 */
import type { Dispatch, SetStateAction } from "react";
import type { ListRule } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import { lists as listsDoor } from "../people-lists";
import {
  plAddPerson,
  plAddedWords,
  plArchivedWords,
  plDeleteList,
  plMakeListWith,
  plMakeRuleList,
  plRenameList,
  plRuleMadeWords,
  plUndoList,
} from "../lists/doors";
import { railToggle } from "../rail/rail-kit";
import { exportLink } from "../shell-verbs";
import type { Flash, SavedList, SmartList } from "../types";
import { PL_ADD_EMPTY, PL_LIST_EMPTY } from "../words";
import type { AddDraft, ListDraft } from "../words";
import type { PersonRowVM } from "@chanlytics/contracts";

type Setter<T> = Dispatch<SetStateAction<T>>;

/**
 * A list made on the rail says so and is the one shown: the rail used to close with no word, the new list somewhere down
 * it. The answer goes back to the rail, which shows a refusal where the name was typed. An archived list back on the rail
 * (00169): said in a toast either way.
 */
export function peopleListDoors({
  plFlash,
  setListId,
  setSavedId,
  setMadeId,
  setListsOpen,
}: {
  plFlash: Flash;
  setListId: Setter<string | null>;
  setSavedId: Setter<string | null>;
  setMadeId: Setter<string | null>;
  setListsOpen: Setter<boolean>;
}) {
  const restoreList = async (a: { id: string; name: string }) => {
    const r = await listsDoor.restore(a.id);
    plFlash(
      r.ok
        ? {
            msg: (
              <>
                <b>{a.name}</b> is back on your lists
              </>
            ),
          }
        : { tone: "danger", msg: <>{r.message || "It could not be brought back."}</> },
    );
  };
  const createList = async (name: string, rule: ListRule | null = null) => {
    const r = await listsDoor.create(name, rule);
    if (r.ok) {
      plFlash({
        msg: rule ? (
          <>
            <b>{name}</b> made. It keeps itself current.
          </>
        ) : (
          <>
            <b>{name}</b> made. Pick people and use Add to list, or add them from their profile.
          </>
        ),
      });
      if (r.data && r.data.id) {
        setListId(null);
        setSavedId(r.data.id);
        setMadeId(r.data.id);
      }
      setListsOpen(false);
    }
    return r;
  };
  return { restoreList, createList };
}

/**
 * What the open list lets the page do: open a list made here, take the list as a file, its own step, pick a list, and take
 * one person off it.
 */
export function peopleListActs({
  activeList,
  activeSaved,
  listGone,
  setListId,
  setTab,
  setSavedId,
  setMadeId,
  plFlash,
}: {
  activeList: SmartList | null;
  activeSaved: SavedList | null;
  listGone: { title: string } | null;
  setListId: Setter<string | null>;
  setTab: Setter<string>;
  setSavedId: Setter<string | null>;
  setMadeId: Setter<string | null>;
  plFlash: Flash;
}) {
  // A list kept as a rule is opened, and its title is where it is changed.
  const openMade = (id: string) => {
    setListId(null);
    setTab("all");
    setSavedId(id);
    setMadeId(id);
  };
  // Export follows the list that is open (decision 0009): the route counts it as a send does, every member; with no list
  // open it is everyone.
  const exportName = activeSaved ? activeSaved.name : activeList ? activeList.label : null;
  // A list that can't be counted here, or isn't here, has no file to take: said on the button, never a refusal page.
  const exportBlocked = activeSaved && activeSaved.unknown ? activeSaved.unknown : listGone ? listGone.title : null;
  const exportHref = exportLink(
    exportName ? (activeSaved ? `list:${activeSaved.id}` : `seg:${(activeList as SmartList).id}`) : undefined,
  );
  const listStep = (activeSaved && activeSaved.action) || (activeList && activeList.action) || null;
  // One list open at a time: it is the page's title, so two open at once would be a title over a table it does not
  // describe. Picking the open one again shows everyone.
  const pickSmart = (id: string) => {
    setSavedId(null);
    setListId((cur) => railToggle(cur, id));
  };
  const pickSaved = (id: string) => {
    setListId(null);
    setSavedId((cur) => railToggle(cur, id));
  };
  // One person off the list kept by hand that is open, from their row; Undo puts them back.
  const dropFromList = async (p: PersonRowVM) => {
    if (!activeSaved) return;
    const list = activeSaved;
    const r = await listsDoor.drop(list.id, [p.id]);
    if (!r.ok) {
      plFlash(refusalToast(r, `Still on ${list.name}`));
      return;
    }
    plFlash({
      msg: (
        <>
          <b>{p.name}</b> is off <b>{list.name}</b>
        </>
      ),
      undo: async () => {
        const u = await listsDoor.add(list.id, [p.id]);
        if (!u.ok) plFlash(refusalToast(u, `Not back on ${list.name}`));
      },
    });
  };
  return { openMade, exportName, exportBlocked, exportHref, listStep, pickSmart, pickSaved, dropFromList };
}

/** What the phone's sheets are handed: the drafts they hold, the list open, the rule behind the view, and the doors. */
interface PhoneActsArgs {
  addDraft: AddDraft;
  setAddDraft: Setter<AddDraft>;
  setAddOpen: Setter<boolean>;
  listAct: string | null;
  setListAct: Setter<string | null>;
  listDraft: ListDraft;
  setListDraft: Setter<ListDraft>;
  activeSaved: SavedList | null;
  viewRule: ListRule | null;
  shownIds: string[];
  openMade: (id: string) => void;
  setSavedId: Setter<string | null>;
  plFlash: Flash;
  onOpenProfile: (id: string) => void;
}

/** The open list's acts on a phone (the more-menu's): the desktop's doors, the page's draft, the desktop's words. */
function listActGoOf(a: PhoneActsArgs, closePhoneSheet: () => void) {
  const { listAct, listDraft, setListDraft, activeSaved, viewRule, shownIds, openMade, setSavedId, plFlash } = a;
  return async () => {
    const d = listDraft;
    if (d.busy) return;
    const n = d.name.trim();
    if (listAct !== "delete" && !n) return;
    if (listAct !== "save" && !activeSaved) return;
    if (listAct === "rename" && n === (activeSaved as SavedList).name) {
      closePhoneSheet();
      return;
    }
    setListDraft({ ...d, busy: true, error: null });
    if (listAct === "delete") {
      const r = await plDeleteList(activeSaved as SavedList);
      if (!r.ok) {
        setListDraft((x) => ({ ...x, busy: false, error: r.error }));
        return;
      }
      if (r.archived) plFlash({ msg: plArchivedWords((activeSaved as SavedList).name, r) });
      closePhoneSheet();
      setSavedId(null);
      return;
    }
    if (listAct === "rename") {
      const r = await plRenameList(activeSaved as SavedList, n);
      if (!r.ok) {
        setListDraft((x) => ({ ...x, busy: false, error: r.error }));
        return;
      }
      closePhoneSheet();
      plFlash({
        msg: (
          <>
            Renamed to <b>{n}</b>
          </>
        ),
      });
      return;
    }
    if (viewRule && ((d.mode || "rule") === "rule" || shownIds.length === 0)) {
      const r = await plMakeRuleList(n, viewRule);
      if (!r.ok) {
        setListDraft((x) => ({ ...x, busy: false, error: r.error }));
        return;
      }
      closePhoneSheet();
      plFlash({ msg: plRuleMadeWords(n) });
      if (r.id) openMade(r.id);
      return;
    }
    const ids = shownIds;
    const made = await plMakeListWith(n, ids);
    if (!made.ok) {
      setListDraft((x) => ({ ...x, busy: false, error: made.message || "Could not make the list." }));
      return;
    }
    const { filled, id } = made;
    closePhoneSheet();
    plFlash(
      filled.ok
        ? {
            msg: (
              <>
                {ids.length} kept as <b>{n}</b>
              </>
            ),
            undo: () => plUndoList(id, n, plFlash),
          }
        : refusalToast(filled, "Not kept as a list"),
    );
  };
}

export function peoplePhoneSheetActs(a: PhoneActsArgs) {
  const { addDraft, setAddDraft, setAddOpen, setListAct, setListDraft, plFlash, onOpenProfile } = a;
  // The phone's Add a person: the desktop's door (plAddPerson), the page's draft. Added, the sheet closes and their page
  // opens, as the desktop's form does.
  const addOnPhone = async () => {
    const d = addDraft;
    if (d.busy || !d.phone.trim()) return;
    setAddDraft({ ...d, busy: true, error: null });
    const r = await plAddPerson(d);
    if (!r.ok) {
      setAddDraft((x) => ({ ...x, busy: false, error: r.error }));
      return;
    }
    plFlash({ msg: plAddedWords(d, r.existed) });
    setAddOpen(false);
    setAddDraft(PL_ADD_EMPTY);
    onOpenProfile(r.id);
  };
  const closePhoneSheet = () => {
    setAddOpen(false);
    setAddDraft(PL_ADD_EMPTY);
    setListAct(null);
    setListDraft(PL_LIST_EMPTY);
  };
  return { addOnPhone, closePhoneSheet, listActGo: listActGoOf(a, closePhoneSheet) };
}
