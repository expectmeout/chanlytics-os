/**
 * What a member does on the Pipeline's page, beside the hooks (moved from legacy/pages/pipeline-scope.jsx PipelineScope,
 * decision 0015): a view picked, a card dropped or moved to another column, New proposal opened, picked from and added
 * to. Plain functions over the page's state, drawn again with it; none keeps state of its own.
 */
import type { PipelineGroupKey, PipelineRowVM, PipelineView } from "@chanlytics/contracts";
import { openDealSheet } from "../../legacy-verbs";
import { plAddPerson, plAddedWords } from "../lists/doors";
import { EMPTY_ADD } from "./scope-state";
import type { PipelineFrame, PipelineRows, PipelineUi } from "./scope-state";
import { P, dealSheetOffered } from "./pipe";
import type { PipelineSection } from "./pipe";
import { pipeHoldFocus } from "./row";

/** What the acts read of the page: the address it moves, its state and its rows. */
interface ActsIn {
  f: PipelineFrame;
  ui: PipelineUi;
  r: PipelineRows;
  closeSheets: () => void;
}

/** A view is a new place: the rail's pick, or a warn part of the line, pushes its address; the picked one again goes back to the whole Pipeline (the rail kit's railToggle). */
export const pipelinePickView =
  ({ f, closeSheets }: ActsIn) =>
  (v: PipelineView) => {
    closeSheets();
    f.nav(P.route({ view: v === f.view ? "all" : v }));
  };

/** The board: every group as a column, those with nobody in them too, so a card has somewhere to drop. */
export const pipelineBoardColumns = (r: PipelineRows): PipelineSection[] | null =>
  r.board
    ? (Object.keys(P.words.groups) as PipelineGroupKey[]).map(
        (key) =>
          r.sections.find((s) => s.key === key) || {
            key,
            label: P.words.groups[key],
            meta: null,
            rows: [],
            collapsed: false,
            onToggle: null,
            toggle: null,
          },
      )
    : null;

/** The board's drags and moves: a drop asks the one sheet for the move, and the sheet records it. */
export function pipelineBoardActs({ ui }: Pick<ActsIn, "ui">) {
  const { drag, setDrag, setOver } = ui;
  const moveOf = P.move;
  const dragEnd = () => {
    setDrag(null);
    setOver(null);
  };
  // A drop asks the one sheet for the move; the sheet records it, and the rows follow the record (the door's answer
  // lands on the row at once, People is read again behind it).
  const drop = (to: PipelineGroupKey) => {
    const d = drag;
    dragEnd();
    const mv = d ? moveOf(d.from, to, d.row) : null;
    if (mv && d && dealSheetOffered()) openDealSheet({ personId: d.id, mode: mv.mode, dealId: mv.dealId });
  };
  // A card's Move to asks for the sheet a drop would, the card holding focus first so closing the sheet lands on it.
  const moveTo = (row: PipelineRowVM, from: PipelineGroupKey, to: PipelineGroupKey) => {
    const mv = moveOf(from, to, row);
    if (!mv || !dealSheetOffered()) return;
    pipeHoldFocus(row.id);
    openDealSheet({ personId: row.id, mode: mv.mode, dealId: mv.dealId });
  };
  return { moveOf, dragEnd, drop, moveTo };
}

/** New proposal: who it is for, then the one deal sheet in its propose mode. Someone added is People's own add. */
export function pipelineNewActs({ ui, f }: Pick<ActsIn, "ui" | "f">) {
  const { newAdd, setNewOpen, setNewQ, setNewAdd, setNewFocus } = ui;
  const openNew = () => {
    setNewQ("");
    setNewAdd(EMPTY_ADD);
    setNewFocus({ row: "search" });
    setNewOpen(true);
  };
  const pickForNew = (id: string) => {
    setNewOpen(false);
    setNewAdd(EMPTY_ADD);
    if (dealSheetOffered()) openDealSheet({ personId: id, mode: "propose" });
  };
  const addForNew = async () => {
    const d = newAdd;
    if (d.busy || !d.phone.trim()) return;
    setNewAdd({ ...d, busy: true, error: null });
    const r = await plAddPerson(d);
    if (!r.ok) {
      setNewAdd((x) => ({ ...x, busy: false, error: r.error }));
      return;
    }
    f.controls.plFlash({ msg: plAddedWords(d, r.existed) });
    pickForNew(r.id);
  };
  return { openNew, pickForNew, addForNew };
}
