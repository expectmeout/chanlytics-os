/**
 * PeopleReal's hooks, one concern to a function (moved whole from legacy/pages/people.jsx, decision 0015). A hook keeps
 * the effects that set its state beside it, so a setter never leaves its hook; the elements are made where they always
 * were (screen.tsx).
 */
import { useEffect, useState } from "react";
import type { PersonRowVM } from "@chanlytics/contracts";
import { refusalToast } from "../../legacy-verbs";
import { lists as listsDoor } from "../people-lists";
import { peopleMore, peopleSearch } from "../surface";
import { plListGone } from "../rail/rail-kit";
import { surfaceValue } from "../../surface-values";
import { addressReplace, addressRoute } from "../shell-verbs";
import type { Flash, PeopleRead, SavedList, SmartList } from "../types";
import { PL_ADD_EMPTY, PL_LIST_EMPTY, PL_TABS, plPhoneNow, plStandingList } from "../words";
import type { AddDraft, ListDraft } from "../words";
import { noteOwnAddress } from "./own-address";

/** How long the box is left still before the server is asked past the loaded people. */
const SEARCH_DELAY_MS = 250;

/**
 * The list the address names, as it names it: one People doesn't have here is said to be missing (listGone, below), never
 * swapped for Everyone.
 */
export function usePeopleView({
  initialSegment,
  initialSaved,
  initialState,
}: {
  initialSegment: string | null;
  initialSaved: string | null;
  initialState: string | null;
}) {
  const [listId, setListId] = useState<string | null>(initialSegment || plStandingList(initialState) || null);
  useEffect(() => {
    setListId(initialSegment || plStandingList(initialState) || null);
  }, [initialSegment, initialState]);
  const [savedId, setSavedId] = useState<string | null>(initialSaved);
  useEffect(() => {
    setSavedId(initialSaved);
  }, [initialSaved]);
  const [tab, setTab] = useState(initialState && PL_TABS.includes(initialState) ? initialState : "all");
  useEffect(() => {
    if (initialState && PL_TABS.includes(initialState)) setTab(initialState);
  }, [initialState]);
  return { listId, setListId, savedId, setSavedId, tab, setTab };
}

/**
 * The phone's list picker (the rail, as a sheet), and the New list box. The shell's and a profile's "New list"
 * (segments:new) open the box; on a phone the sheet comes up with it, since the rail it sits in is not drawn there.
 */
export function usePeopleSheets(newList: boolean, savedId: string | null) {
  const [listsOpen, setListsOpen] = useState(() => !!newList && plPhoneNow());
  // Arrived at clients/new-list: the box is open from the first draw (and on a phone, the sheet it sits in).
  const [newListSignal, setNewListSignal] = useState(newList ? 1 : 0);
  // People's own sheets on a phone -- Add a person, and the open list's rename, delete and "Save these" -- with their
  // drafts. The page holds them, so its one keyboard listener closes them on Esc and the sheets are hookless.
  const [addOpen, setAddOpen] = useState(false);
  const [addDraft, setAddDraft] = useState<AddDraft>(PL_ADD_EMPTY);
  const [listAct, setListAct] = useState<string | null>(null);
  // The open smart list's rule, being changed under its title (a desktop's; a phone's is a sheet, listAct "rule").
  const [ruleEditing, setRuleEditing] = useState(false);
  useEffect(() => {
    setRuleEditing(false);
  }, [savedId]);
  const [listDraft, setListDraft] = useState<ListDraft>(PL_LIST_EMPTY);
  // Import people: the owner's sheet over the page (import/import-sheet.tsx). The refresh-map re-reads People after each part.
  const [importOpen, setImportOpen] = useState(false);
  useEffect(() => {
    const onNew = () => {
      setNewListSignal((n) => n + 1);
      // The rail is hidden at 900px and under (mobile.css), so there the box opens in the sheet: this asked 720px, and
      // from 721 to 900 it opened inside a rail nobody could see.
      if (plPhoneNow()) setListsOpen(true);
    };
    window.addEventListener("segments:new", onNew);
    return () => window.removeEventListener("segments:new", onNew);
  }, []);
  return {
    listsOpen,
    setListsOpen,
    newListSignal,
    addOpen,
    setAddOpen,
    addDraft,
    setAddDraft,
    listAct,
    setListAct,
    ruleEditing,
    setRuleEditing,
    listDraft,
    setListDraft,
    importOpen,
    setImportOpen,
  };
}

/**
 * The view in the address, so a list or a state can be sent to someone -- the assistant and Today link here. Replaced,
 * never pushed: Back leaves People. The Pipeline's address draws People where deals are off (app-routes.jsx), and People's
 * own address takes its place.
 */
export function usePeopleAddress(listId: string | null, savedId: string | null, tab: string) {
  useEffect(() => {
    const cur = addressRoute();
    if (!cur.startsWith("clients")) return;
    // The New list door's address stands while the box is what it opened; once a list is made (or any view picked), the
    // address is that view's, so a reload opens the list and not the box again.
    const want = listId ? `seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}` : "";
    if (cur === "clients/new-list" && !want) return;
    if (/^clients\/(?!seg:|list:|state:|pipeline(:|$)|new-list$)./.test(cur)) return;
    // Where deals are on, the Pipeline's address is the Pipeline's. This page may still be mounted for the moment a move to
    // it takes to draw, and must not take the address back (before People was one page, the frame's row drew the Pipeline
    // and this page was already gone).
    if (/^clients\/pipeline(:|$)/.test(cur) && surfaceValue("people")?.dealsOn) return;
    const next = want ? `clients/${want}` : "clients";
    if (cur !== next) {
      noteOwnAddress(next);
      addressReplace(next, { quiet: true });
    }
  }, [listId, savedId, tab]);
}

/**
 * When the page does not hold everyone (past the fifty pages the surface reads), the box also asks the server, which
 * matches names and numbers. What it finds sits beside the loaded rows, which the box still searches by their words: its
 * matches used to stand in for the loaded rows, so a loaded person found by their last words vanished, and a search that
 * could not ask the server said nothing and searched only what was loaded.
 */
export function usePeopleFarther({ people, q, plFlash }: { people: PeopleRead; q: string; plFlash: Flash }) {
  const hasMore = !!(people.page && people.page.has_more);
  const [found, setFound] = useState<PersonRowVM[] | null>(null);
  const [searchMore, setSearchMore] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  // Whether the server is being asked right now: the line under the table says so and the table is busy while it is (the
  // loading standard's one on-its-way rule). It was silent, and the rows the server found landed unannounced.
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!hasMore || !q.trim()) {
      setFound(null);
      setSearchFailed(false);
      setSearching(false);
      return undefined;
    }
    let on = true;
    const t = setTimeout(() => {
      setSearching(true);
      peopleSearch(q)
        .then((r) => {
          if (on) {
            setFound(r.rows);
            setSearchMore(!!r.more);
            setSearchFailed(false);
            setSearching(false);
          }
        })
        .catch(() => {
          if (on) {
            setFound(null);
            setSearchFailed(true);
            setSearching(false);
          }
        });
    }, SEARCH_DELAY_MS);
    return () => {
      on = false;
      clearTimeout(t);
      setSearching(false);
    };
  }, [q, hasMore]);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    // A page of people that could not be read says so: Show more used to go quiet and stay.
    try {
      await peopleMore();
    } catch (e) {
      plFlash(refusalToast({ message: e instanceof Error ? e.message : undefined }, "No more people loaded"));
    } finally {
      setLoadingMore(false);
    }
  };
  return { hasMore, found, searchMore, searchFailed, searching, loadingMore, loadMore };
}

/**
 * The list open, as the page names it, and a list made here on its way from the server (`setMadeId`, which the doors that
 * make or open one call).
 */
export function usePeopleOpenList({
  people,
  lists,
  saved,
  listId,
  savedId,
  tab,
  q,
}: {
  people: PeopleRead;
  lists: readonly SmartList[];
  saved: readonly SavedList[];
  listId: string | null;
  savedId: string | null;
  tab: string;
  q: string;
}) {
  const activeList = listId ? (lists.find((l) => l.id === listId) ?? null) : null;
  const activeSaved = savedId ? (saved.find((s) => s.id === savedId) ?? null) : null;
  // A list made here, on its way from the server: not "a list that isn't here" while the surface re-reads.
  const [madeId, setMadeId] = useState<string | null>(null);
  // A list the address names that People doesn't have (decision 0009): a link kept, an answer's jump, a teammate's delete.
  // It is said, and nobody is shown, rather than Everyone under its name. An archived one says how it comes back.
  const listGone =
    savedId && savedId === madeId ? null : plListGone({ listId, activeList, savedId, activeSaved, people });
  // The list made here has arrived: from now on it is a list like any other, said to be gone if it goes.
  useEffect(() => {
    if (madeId && activeSaved && activeSaved.id === madeId) setMadeId(null);
  }, [madeId, activeSaved]);
  // The rule behind the view, when one says it: what "Save these" keeps by default (decision 0009). One filter at a time:
  // a list and a state together, or words in the box, freeze who is shown.
  const viewRule =
    !q.trim() && !((listId || savedId) && tab !== "all")
      ? listsDoor.ruleOf({
          builtin: activeList ? activeList.id : null,
          saved: activeSaved && !activeSaved.byHand ? activeSaved.id : null,
          standing: !listId && !savedId ? tab : null,
        })
      : null;
  return { activeList, activeSaved, listGone, viewRule, setMadeId };
}

/**
 * Any list open is a door Today can keep (decision 0009): pinned for this member (memberships.views.today), said on the
 * list's title line and in a phone's more-menu. The page holds the answer until the surface's copy has it.
 */
export function usePeoplePin({
  activeList,
  activeSaved,
  plFlash,
}: {
  activeList: SmartList | null;
  activeSaved: SavedList | null;
  plFlash: Flash;
}) {
  const openToken = activeSaved ? `list:${activeSaved.id}` : activeList ? `seg:${activeList.id}` : null;
  const canPin = !!openToken;
  // One press at a time: a second one waits for the first's answer, so the saves land in the order pressed.
  const [pinBusy, setPinBusy] = useState(false);
  const pinned = canPin && listsDoor.isPinned(openToken);
  const togglePin = async () => {
    if (!openToken || pinBusy) return;
    const was = listsDoor.isPinned(openToken);
    const name = activeSaved ? activeSaved.name : (activeList as SmartList).label;
    setPinBusy(true);
    const r = await listsDoor.pin(openToken);
    setPinBusy(false);
    plFlash(
      r.ok
        ? {
            msg: was ? (
              <>
                <b>{name}</b> is off Today
              </>
            ) : (
              <>
                <b>{name}</b> is on Today
              </>
            ),
          }
        : { tone: "danger", msg: <>{r.message || "Could not change Today's lists."}</> },
    );
  };
  return { canPin, pinBusy, pinned, togglePin };
}
