/**
 * What a cell draws from, and the rows' place (moved whole from legacy/pages/people.jsx usePeopleCells and
 * usePeoplePlace, decision 0015).
 */
import { useEffect, useMemo, useRef } from "react";
import type { PersonRowVM } from "@chanlytics/contracts";
import { askOnScreenKey, setAskOnScreen } from "../../legacy-verbs";
import { warmPeople, warmPerson } from "../people-detail";
import { usePlPlace } from "../hooks/use-place";
import type { PlaceControls } from "../hooks/use-place";
import type { PeopleCellCtx, PeopleRead, SavedList } from "../types";

/**
 * What a cell needs, behind ONE object that holds still until something in it changes: the rows are PeopleRowMemo, which
 * draws a row again only when a prop of its own changed, and a context made new on every draw redrew every row on every
 * keystroke (the same fault the Leads scope's cellCtxLeads fixed). The doors are the latest closures behind refs, so a new
 * closure is not a new context; the columns are told apart by their keys, not their array. What a cell draws from: the
 * booking link, each row's words, the list open for taking people off, their lists, and which columns a desktop shows.
 */
export function usePeopleCells({
  people,
  saved,
  activeSaved,
  canEditLists,
  columns,
  onOpenProfile,
  dropFromList,
}: {
  people: PeopleRead;
  saved: readonly SavedList[];
  activeSaved: SavedList | null;
  canEditLists: boolean;
  columns: readonly { key: string; off?: boolean }[];
  onOpenProfile: (id: string) => void;
  dropFromList: (p: PersonRowVM) => Promise<void>;
}) {
  const listsOf = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const s of saved) for (const id of s.ids) (m[id] = m[id] || []).push(s.name);
    return m;
  }, [saved]);
  const cellOpenRef = useRef(onOpenProfile);
  cellOpenRef.current = onOpenProfile;
  const cellDropRef = useRef(dropFromList);
  cellDropRef.current = dropFromList;
  const cellCtxRef = useRef<{ key: unknown[]; ctx: PeopleCellCtx } | null>(null);
  const cellCtxKey = [
    people.bookingLink || null,
    people.attention,
    saved,
    activeSaved ? activeSaved.id : null,
    canEditLists,
    columns.map((c) => (c.off ? `-${c.key}` : c.key)).join(","),
  ];
  if (!cellCtxRef.current || cellCtxRef.current.key.some((v, i) => !Object.is(v, cellCtxKey[i]))) {
    cellCtxRef.current = {
      key: cellCtxKey,
      ctx: {
        bookingLink: people.bookingLink || null,
        attention: people.attention,
        onOpen: (id) => cellOpenRef.current(id),
        // Read a person before their row is pressed: a pointer arriving, a finger coming down, the cursor landing.
        onWarm: (id) => {
          void warmPerson(id);
        },
        drop:
          activeSaved && activeSaved.byHand && canEditLists
            ? { list: activeSaved, onDrop: (person) => void cellDropRef.current(person) }
            : null,
        listsOf,
        shows: Object.fromEntries(columns.filter((c) => !c.off).map((c) => [c.key, true])),
      },
    };
  }
  const cellCtx = cellCtxRef.current.ctx;
  // What a row press does, behind one function for the same reason: the shell hands the page a new onOpenProfile on every
  // route change, and a phone in a selection turns a press into a toggle, so the door changes while the rows should not.
  const rowOpenRef = useRef<((id: string) => void) | null>(null);
  const rowOpen = useRef((id: string) => {
    if (rowOpenRef.current) rowOpenRef.current(id);
  }).current;
  return { cellCtx, rowOpenRef, rowOpen };
}

/** The rows' place: whether anything filters them, each view's own place (usePlPlace), and the first people read ahead. */
export function usePeoplePlace({
  controls,
  shown,
  tab,
  listId,
  savedId,
  q,
}: {
  controls: PlaceControls;
  shown: readonly PersonRowVM[];
  tab: string;
  listId: string | null;
  savedId: string | null;
  q: string;
}) {
  const filtered = tab !== "all" || !!listId || !!savedId || !!q.trim();
  const shownIds = shown.map((r) => r.id);
  // Each view keeps its own place: everyone, a smart list, a kept list or a state.
  const peopleView = listId ? `seg:${listId}` : savedId ? `list:${savedId}` : tab !== "all" ? `state:${tab}` : "all";
  const { cursor, setCursor, rowBudget, keysWith, toggleAll } = usePlPlace({
    controls,
    page: "people",
    view: peopleView,
    ids: shownIds,
    noun: "person",
    selectionOf: `${tab}|${listId}|${savedId}`,
    windowed: true,
  });
  // The people this view shows first, read in the background once the boot is in, so a press opens a page the tab already
  // holds, whole (people-detail.ts warmPeople): a person not read yet opens on nothing of theirs until it is.
  const aheadKey = shownIds.slice(0, 12).join(",");
  useEffect(() => {
    if (aheadKey) warmPeople(aheadKey.split(","));
  }, [aheadKey]);
  // What Ask is told is on screen (legacy-bridge/ask/context.ts): the people this view draws, in its order after its list,
  // search and sort, forty at most, and the view that chose them; taken back when the list goes.
  useEffect(() => {
    const drawn = shown.slice(0, 40);
    setAskOnScreen({
      key: "people",
      ids: drawn.map((r) => r.id),
      labels: drawn.map((r) => r.name || ""),
      view: q.trim() ? `${peopleView}:search` : peopleView,
    });
    // Taken back when the list goes (a person's page, People's lists): its rows are no longer on screen.
    return () => {
      if (askOnScreenKey() === "people") setAskOnScreen(null);
    };
  });
  return { filtered, shownIds, cursor, setCursor, rowBudget, keysWith, toggleAll };
}
