/**
 * The hover vocabulary (D5), moved from legacy/pages/leads-cells.jsx (decision 0015). Two tiers only. A tip is a chip of a
 * line or two you can never click; a card is raised, holds links and buttons, and stays open while the pointer is inside
 * it. A tip is in the DOM always, and a card from when a pointer, focus or a finger first reaches its trigger (LeadHover);
 * a screen reader reaches either through aria-describedby. Both are shown by CSS on the trigger's :hover and :focus-within -- tips after 200ms, cards after 400ms, one at a time by nature,
 * and hidden while the list scrolls (the page marks its scroller data-scrolling). Nothing a person must act on hides in
 * either: a hover only confirms what the row already said.
 */
import { createElement, useState } from "react";
import type { HTMLAttributes, ReactNode, SyntheticEvent } from "react";

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
    className="ld-card panel panel-pop"
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
 * A hover's trigger whose card is drawn once a pointer, focus or a finger first reaches it, and kept from then on, so
 * the CSS shows it as before. Drawn on every row, the cards were most of a lead's row: 59 elements to a lead's row and
 * 31 to a person's, with a second Call menu in the name's card, on every row of a switch to Leads (5 Oct 2026). The
 * trigger is the page's own element (`as`, its class and test id); `card` is what it shows; a screen reader's
 * description is there by the time the focus that reached it is said.
 */
export function LeadHover({
  as,
  card,
  children,
  ...props
}: { as: "td" | "div"; card: ReactNode; children?: ReactNode; "data-testid"?: string } & HTMLAttributes<HTMLElement>) {
  const [reached, setReached] = useState(false);
  const reach = (e: SyntheticEvent<HTMLElement>) => {
    ldPlacePop(e, "card");
    if (!reached) setReached(true);
  };
  return createElement(
    as,
    { ...props, onMouseEnter: reach, onFocus: reach, onTouchStart: () => setReached(true) },
    children,
    reached ? card : null,
  );
}

/**
 * Where a pop hangs. It hangs below its row, and the table's pane cuts off whatever reaches past its bottom edge: the
 * name card on the last row in view lost 173px. So each hover looks where it is as the pointer or focus arrives, and
 * hangs its pop above the row when there is not room for it below and there is more room above. A pop is out of the
 * layout until it shows, so its height cannot be read on arrival; these are the most each kind runs to.
 */
const LD_POP_ROOM = { card: 250, tip: 56 };

export const ldPlacePop = (e: SyntheticEvent<HTMLElement> | null | undefined, kind?: "card" | "tip") => {
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
  // A card drawn on arrival (LeadHover) is not there yet to be found: its trigger says which it is.
  const need = LD_POP_ROOM[kind ?? (el.querySelector(":scope > .ld-card") ? "card" : "tip")];
  const below = box.bottom - at.bottom;
  const above = at.top - (box.top + head);
  el.classList.toggle("ld-up", below < need && above > below);
};
