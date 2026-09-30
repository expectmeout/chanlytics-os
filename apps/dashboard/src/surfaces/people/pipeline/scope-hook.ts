/**
 * PipelineScope's hooks in the order the one function called them, and the acts drawn from them (moved from
 * legacy/pages/pipeline-scope.jsx PipelineScope, decision 0015). `usePipelineState` is the whole of its state and what
 * the elements are drawn from; scope-screen.tsx draws them.
 */
import { P } from "./pipe";
import { pipelineBoardActs, pipelineBoardColumns, pipelineNewActs, pipelinePickView } from "./scope-acts";
import {
  usePipelineAddress,
  usePipelineAsk,
  usePipelineBoardFocus,
  usePipelineColumns,
  usePipelineDoors,
  usePipelineFrame,
  usePipelinePeekDoors,
  usePipelinePeekReads,
  usePipelinePeekRow,
  usePipelinePerson,
  usePipelinePlace,
  usePipelineRows,
  usePipelineUi,
} from "./scope-state";
import type { PipelineScopeProps } from "./scope-state";
import { plScopeRoute } from "../words";
import { gate } from "../../legacy-verbs";

export function usePipelineState(props: PipelineScopeProps) {
  const { onOpenProfile = () => undefined } = props;
  const f = usePipelineFrame(props);
  const ui = usePipelineUi();
  const r = usePipelineRows(f, ui);
  usePipelineAsk(r);
  // Each view keeps its own place (the words in the box, the cursor, the scroll), as each of People's lists does.
  const place = usePipelinePlace(f.controls, r);
  const doors = usePipelinePeekDoors(r, ui, place);
  const { setListsOpen, setNewOpen } = ui;
  const closeSheets = () => {
    setListsOpen(false);
    setNewOpen(false);
  };
  // What the keyboard's one listener reads: Enter opens the peek for the person under the cursor, Esc closes it, and
  // J and K keep walking the rows behind it. Nothing here selects. A phone's sheet holds the keys while it is up.
  place.keysWith({
    open: doors.openPeek,
    canSelect: r.selectable,
    sheetOpen: ui.listsOpen || ui.newOpen,
    closeSheet: closeSheets,
    peekOpen: !!ui.peekId,
    closePeek: doors.closePeek,
  });
  usePipelinePeekReads(ui, place, doors);
  const pk = usePipelinePeekRow(r, ui, f);
  const tableColumns = usePipelineColumns(f, pk);
  usePipelineBoardFocus(r, ui, place);
  // The people picked, as the rows shown say them: a person a view no longer shows is not acted on.
  const picked = r.selectable ? r.shown.filter((row) => f.controls.sel.has(row.id)).map((row) => row.person) : [];
  usePipelineAddress(f, ui, doors);
  const d = usePipelineDoors(f, r, doors, onOpenProfile);
  const pickView = pipelinePickView({ f, ui, r, closeSheets });
  const boardColumns = pipelineBoardColumns(r);
  const boardActs = pipelineBoardActs({ ui });
  const newActs = pipelineNewActs({ ui, f });
  const newGate = gate("approve", "start a proposal");
  const emptyWords = r.all.empty
    ? { title: P.words.empty.title, body: P.words.empty.body }
    : r.inView.empty
      ? { title: P.words.board.nobody, action: { label: P.words.rail.all, onClick: () => pickView("all") } }
      : null;
  const onScope = (to: string) => f.nav(plScopeRoute(to));
  const person = usePipelinePerson(r, ui, pk);
  const line = r.loaded ? [...r.all.line, { words: r.loaded, view: null, tone: null }] : r.all.line;
  return {
    f,
    ui,
    r,
    place,
    doors,
    closeSheets,
    pk,
    tableColumns,
    picked,
    d,
    pickView,
    boardColumns,
    boardActs,
    newActs,
    newGate,
    emptyWords,
    onScope,
    person,
    line,
  };
}
export type PipelineState = ReturnType<typeof usePipelineState>;
