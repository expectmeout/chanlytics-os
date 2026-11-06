/**
 * One row of a table is in the tab order on a desk (rows.tsx): the cursor's. Every other row's controls are taken out of
 * it, and each is still a pointer's to press.
 */

/** What in a row a Tab stops at: its controls, and anything a cell put in the order itself. */
const ROW_STOPS = "button, a[href], input, select, textarea, [tabindex]";

/** A control of a row, as much of it as its place in the tab order is read and written by. */
interface RowStop {
  dataset: Record<string, string | undefined>;
  getAttribute: (name: string) => string | null;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
}

/**
 * A row's controls in the tab order, or out of it (the table review of 5 Nov 2026): a lead's row held up to nine
 * stops, so a list of thirty was 270 presses of Tab to cross. Out of it, each control keeps what it had beside it
 * (`data-tab`), which is put back as the cursor reaches its row. A press on one still lands: focus then takes the cursor
 * to its row (the row's onFocus), and the row is in the order from that draw on.
 */
export const setRowTabs = (
  row: { querySelectorAll?: (q: string) => Iterable<RowStop> } | null,
  inOrder: boolean,
): void => {
  // An element that cannot be asked for what it holds (a stand-in for the document, a test's) has nothing to order.
  if (!row || typeof row.querySelectorAll !== "function") return;
  for (const stop of row.querySelectorAll(ROW_STOPS)) {
    const kept = stop.dataset.tab;
    if (inOrder) {
      if (kept === undefined) continue;
      if (kept === "") stop.removeAttribute("tabindex");
      else stop.setAttribute("tabindex", kept);
      delete stop.dataset.tab;
    } else if (kept === undefined) {
      stop.dataset.tab = stop.getAttribute("tabindex") ?? "";
      stop.setAttribute("tabindex", "-1");
    }
  }
};
