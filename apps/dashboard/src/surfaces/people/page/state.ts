/**
 * PeopleReal's state: its hooks, called in the order the one function called them, and what they made, in one object that
 * the elements are drawn from (moved whole from legacy/pages/people.jsx PeopleReal, decision 0015). A hook keeps the
 * effects that set its state beside it, so a setter never leaves its hook.
 */
import { useMemo } from "react";
import { mayAtLeast, navigate } from "../../legacy-verbs";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { PL_COLUMNS, PL_PHONE_COLUMNS } from "../cells/columns";
import { TABLE_BODIES } from "../table/table";
import { usePlControls } from "../hooks/use-controls";
import { usePeople } from "../hooks/use-people";
import { PL_NO_LISTS } from "../words";
import { usePeopleCells, usePeoplePlace } from "./cells-hook";
import { peopleListActs, peopleListDoors, peoplePhoneSheetActs } from "./list-acts";
import { plPeopleShown } from "./shown";
import {
  usePeopleAddress,
  usePeopleFarther,
  usePeopleOpenList,
  usePeoplePin,
  usePeopleSheets,
  usePeopleView,
} from "./view-hooks";

/** What the shell hands the page: the door a row's press opens a person by, and the address's view. */
export interface PeopleRealProps {
  onOpenProfile?: (id: string) => void;
  initialSegment?: string | null;
  initialSaved?: string | null;
  initialState?: string | null;
  onNavigate?: ((to: string) => void) | null;
  newList?: boolean;
}

export function usePeopleState({
  onOpenProfile = () => undefined,
  initialSegment = null,
  initialSaved = null,
  initialState = null,
  onNavigate = null,
  newList = false,
}: PeopleRealProps) {
  const people = usePeople();
  const nav = onNavigate || ((to: string) => navigate(to));
  const rows = people.rows;
  const lists = people.lists;
  const agg = people.aggregates;
  const withCalendar = !!(people.calendar && people.calendar.state === "ok");
  // Whether deals are on here (the surface's dealsOn, 0008): the Deal column is offered, and the switch has the Pipeline,
  // only then.
  const dealsOn = !!people.dealsOn;
  const view = usePeopleView({ initialSegment, initialSaved, initialState });
  const { listId, setListId, savedId, setSavedId, tab, setTab } = view;
  const saved = people.saved || PL_NO_LISTS;
  const controls = usePlControls({
    scope: "people",
    cols: PL_COLUMNS,
    phoneCols: PL_PHONE_COLUMNS,
    colCtx: { withCalendar, dealsOn },
    people,
    sortFirst: { by: "last", dir: "desc" },
  });
  const { phone, selectMode, canExport, plFlash, sel, toggleSel, sortBy, sortDir, q } = controls;
  const sheets = usePeopleSheets(newList, savedId);
  const { listsOpen, setListsOpen } = sheets;
  // The roles ROLE_PERMS gives `approve`: owner, operator, and the partner (0012).
  const canEditLists = mayAtLeast("operator");
  usePeopleAddress(listId, savedId, tab);
  const farther = usePeopleFarther({ people, q, plFlash });
  const { found } = farther;
  const shown = useMemo(
    () => plPeopleShown({ rows, found, lists, saved, tab, listId, savedId, q, sortBy, sortDir }),
    [rows, found, lists, saved, tab, listId, savedId, q, sortBy, sortDir],
  );
  const open = usePeopleOpenList({ people, lists, saved, listId, savedId, tab, q });
  const doors = peopleListDoors({ plFlash, setListId, setSavedId, setMadeId: open.setMadeId, setListsOpen });
  const pin = usePeoplePin({ activeList: open.activeList, activeSaved: open.activeSaved, plFlash });
  const acts = peopleListActs({ ...open, setListId, setTab, setSavedId, plFlash });
  const cells = usePeopleCells({
    people,
    saved,
    activeSaved: open.activeSaved,
    canEditLists,
    columns: controls.columns,
    onOpenProfile,
    dropFromList: acts.dropFromList,
  });
  const place = usePeoplePlace({ controls, shown, tab, listId, savedId, q });
  // The rows rise as the list under the view changes (the Inbox's buckets do): a pick in the rail answers, never a hard cut.
  const swap = useSwapMotion<HTMLTableElement>(`${listId ?? ""}|${savedId ?? ""}|${tab}`, TABLE_BODIES);
  const phoneActs = peoplePhoneSheetActs({
    ...sheets,
    activeSaved: open.activeSaved,
    viewRule: open.viewRule,
    shownIds: place.shownIds,
    openMade: acts.openMade,
    setSavedId,
    plFlash,
    onOpenProfile,
  });
  // What the keyboard's one listener reads (usePlPlace): Enter opens the person, and People's own sheets.
  place.keysWith({
    open: onOpenProfile,
    canSelect: canEditLists || canExport,
    // The Lists sheet is the page's own, and closes on its own Esc. People's small jobs and the selection's sheet are the
    // kit's: in PL_OVERLAY while open, so the keys hold still behind them, and each closes on its own Esc (Base UI's).
    sheetOpen: listsOpen,
    closeSheet: null,
  });
  // Whether anyone shown is selected, or a phone's Select people is on: the bar shows then, and on a phone a tap on a row
  // selects it rather than opening the person (Gmail's way; the face is the checkbox, clients.css).
  const selecting = (phone && selectMode) || shown.some((p) => sel.has(p.id));
  cells.rowOpenRef.current = phone && selecting ? toggleSel : onOpenProfile;
  return {
    ...controls,
    ...view,
    ...sheets,
    ...doors,
    ...farther,
    ...open,
    ...pin,
    ...acts,
    ...cells,
    ...place,
    ...phoneActs,
    onOpenProfile,
    nav,
    people,
    rows,
    lists,
    agg,
    withCalendar,
    dealsOn,
    saved,
    canEditLists,
    shown,
    selecting,
    swap,
  };
}
export type PeopleState = ReturnType<typeof usePeopleState>;
