/**
 * The hover vocabulary (D5), moved from legacy/pages/leads-cells.jsx (decision 0015). Two tiers only. A tip is a chip of a
 * line or two you can never click; a card is raised, holds links and buttons, and stays open while the pointer is inside
 * it. Both are in the DOM always (so a test reads them and a screen reader can reach them through aria-describedby) and
 * shown by CSS on the trigger's :hover and :focus-within -- tips after 200ms, cards after 400ms, one at a time by nature,
 * and hidden while the list scrolls (the page marks its scroller data-scrolling). Nothing a person must act on hides in
 * either: a hover only confirms what the row already said.
 */
import type { ReactNode, SyntheticEvent } from "react";

export const LeadTip = ({ id, children, testid }: { id: string; children?: ReactNode; testid?: string }) => (
  <span className="ld-tip" role="tooltip" id={id} data-testid={testid}>
    {children}
  </span>
);

export const LeadCard = ({
  id,
  label,
  children,
  testid,
}: {
  id?: string;
  label: string;
  children?: ReactNode;
  testid?: string;
}) => (
  <div
    className="ld-card"
    role="group"
    id={id}
    aria-label={label}
    data-testid={testid}
    onClick={(e) => e.stopPropagation()}
  >
    {children}
  </div>
);

/**
 * Where a pop hangs. It hangs below its row, and the table's pane cuts off whatever reaches past its bottom edge: the
 * name card on the last row in view lost 173px. So each hover looks where it is as the pointer or focus arrives, and
 * hangs its pop above the row when there is not room for it below and there is more room above. A pop is out of the
 * layout until it shows, so its height cannot be read on arrival; these are the most each kind runs to.
 */
const LD_POP_ROOM = { card: 250, tip: 56 };

export const ldPlacePop = (e: SyntheticEvent<HTMLElement> | null | undefined) => {
  const el = e && e.currentTarget;
  if (!el || typeof el.getBoundingClientRect !== "function" || typeof el.closest !== "function" || !el.classList)
    return;
  const pane = el.closest(".pl-table-scroll") || el.closest(".pl-main");
  if (!pane) return;
  const box = pane.getBoundingClientRect();
  const at = el.getBoundingClientRect();
  // The header sticks to the pane's top, so the room above a row ends at the header, not at the pane.
  const head = pane.classList.contains("pl-table-scroll")
    ? (pane.querySelector<HTMLElement>("thead") || { offsetHeight: 0 }).offsetHeight || 0
    : 0;
  const need = el.querySelector(":scope > .ld-card") ? LD_POP_ROOM.card : LD_POP_ROOM.tip;
  const below = box.bottom - at.bottom;
  const above = at.top - (box.top + head);
  el.classList.toggle("ld-up", below < need && above > below);
};
