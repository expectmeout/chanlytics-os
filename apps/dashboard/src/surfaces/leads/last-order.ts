/**
 * The order the Leads page last asked for on this device, each workspace's apart: what the next load's boot reads Leads in
 * (surface.ts leadsBootView). The frame reads Leads on every page, after the page's own surfaces, so the tab beside People
 * opens on rows the tab already holds; that is so only where the boot asked for the view the page then asks for, order and
 * all. The order is the member's own (their saved view, and on a desk the columns it shows: people/hooks/use-controls.ts),
 * which nothing can say before the page is there, and the tab's cache keeps only what the frame's own reads publish, so it
 * handed the boot its own last order back. A member in an order of their own had the queue read at every load, and their
 * Leads opened on those rows, dimmed for the 2.3 s the page took to read its own (Ruben's phone, 22 Nov 2026).
 *
 * A word and a direction for each workspace, no row of anyone's and no workspace's name: kept past a deploy and a day,
 * where a snapshot is not, and not among what a sign-out clears (client/kept-on-device.ts), as the device's copy of a saved
 * view is not.
 */
import { LEAD_VIEW_SORTS } from "@chanlytics/contracts";

/** An order a view of Leads opens in: one of the orders a person picks, never the pile's own. */
export interface LeadViewOrder {
  sort: (typeof LEAD_VIEW_SORTS)[number];
  dir: "asc" | "desc";
}

/** The one slot they are kept in, the workspace asked in last at its end. */
const LAST_ORDER_SLOT = "chanlytics-leads-order";
/** How many workspaces' orders a device keeps: a partner walks many on one. */
const MOST_ORDERS_KEPT = 20;

/** The largest prime under 2^32: the room the slot's words for a workspace are made in. */
const SLOT_WORD_ROOM = 4_294_967_291;

/** A workspace's order as the slot holds it: the workspace as its word (slotWordOf), never its name. */
type KeptOrder = readonly [word: string, sort: unknown, dir: unknown];

/**
 * A workspace as the slot says it: a short word made from its name, the same every time. The slot outlives a sign-out, and
 * with the names in it a partner's device would list their clients to whoever opened it next.
 */
function slotWordOf(workspace: string): string {
  let word = 0;
  for (let at = 0; at < workspace.length; at += 1) word = (word * 31 + workspace.charCodeAt(at)) % SLOT_WORD_ROOM;
  return word.toString(36);
}

/** An order as a view may be asked in it; null for the pile's, and for one the server does not know. */
export function viewOrderOf(sort: unknown, dir: unknown): LeadViewOrder | null {
  const by = LEAD_VIEW_SORTS.find((known) => known === sort);
  return by && (dir === "asc" || dir === "desc") ? { sort: by, dir } : null;
}

/** Every workspace's order the slot holds, read with care: nothing where there is none, or storage refuses. */
function keptOrders(): KeptOrder[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(LAST_ORDER_SLOT) || "[]");
    if (!Array.isArray(kept)) return [];
    return kept.filter((entry): entry is KeptOrder => Array.isArray(entry) && typeof entry[0] === "string");
  } catch {
    return []; // private mode, or a slot that does not parse: the boot reads as it did before one was kept
  }
}

/** The order Leads was last asked for in this workspace on this device, or null where it never was. */
export function lastOrderOf(workspace: string): LeadViewOrder | null {
  const mine = slotWordOf(workspace);
  const entry = keptOrders().find(([word]) => word === mine);
  return entry ? viewOrderOf(entry[1], entry[2]) : null;
}

/** An order the page asked in, kept for the next load: nothing written where it is what is kept, or is no view's. */
export function keepLastOrder(workspace: string, order: { sort: unknown; dir: unknown }): void {
  const latest = viewOrderOf(order.sort, order.dir);
  if (!workspace || !latest) return;
  const kept = lastOrderOf(workspace);
  if (kept && kept.sort === latest.sort && kept.dir === latest.dir) return;
  try {
    const mine = slotWordOf(workspace);
    const others = keptOrders().filter(([word]) => word !== mine);
    const orders = [...others, [mine, latest.sort, latest.dir]].slice(-MOST_ORDERS_KEPT);
    localStorage.setItem(LAST_ORDER_SLOT, JSON.stringify(orders));
  } catch {
    /* storage refused or full: the next boot reads the snapshot's order */
  }
}
