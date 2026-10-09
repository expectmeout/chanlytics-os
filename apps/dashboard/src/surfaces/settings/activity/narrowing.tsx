/**
 * What the log is narrowed to, and the small parts of the filters the page draws on its own chunk: the shape of a
 * narrowing, the phone's one control, and the loader for the boxes themselves.
 *
 * The boxes (filters.tsx) stand on the kit's Select, Combobox and date picker, which stand on Base UI. Imported with
 * the pane they rode on every Settings tab's load: 76 KB gzipped more on the page's own JS (CI's build, 9 October
 * 2026), for four boxes one tab draws. So the pane asks for them as it is first drawn (`loadBoxes`, the Leads map's
 * own way of loading what it draws late) and draws the row's shape until they land; a test loads them once before it
 * draws, so the pane finds them at its first draw, as the browser does from the second visit on.
 */
import { ACTIVITY_PAGE_WORDS as W, type ActivitySpan } from "@chanlytics/contracts";
import { holdStill } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { ActivityFilters } from "./filters";

export type Person = { id: string; name: string };

/** What the log is narrowed to, as the boxes hold it. */
export interface Narrowing {
  /** The kind box: nothing, `only:problems`, `family:<family>` or `kind:<kind>`. */
  pick: string;
  /** Who did it: nobody picked, a member's id, `receptionist` or `system`. */
  who: string;
  /** When: any time, one of the spans, or `day` for the one day in `day`. */
  when: "" | ActivitySpan | "day";
  /** The day picked, "YYYY-MM-DD", read only while `when` is `day`. */
  day: string;
  person: Person | null;
}

export const NO_NARROWING: Narrowing = { pick: "", who: "", when: "", day: "", person: null };

/**
 * How many of the four are set, for the phone's one control and the way back to the whole log. One day with no day
 * picked yet counts: the box says it, its picker stands beside it, and a reader who went that far is offered the way
 * back (it counted only a day picked, so Clear stood hidden while the row showed two boxes more).
 */
export const narrowedCount = (n: Narrowing): number => [n.pick, n.who, n.when, n.person].filter(Boolean).length;

/** The boxes' row, as filters.tsx draws it. */
export type Boxes = typeof ActivityFilters;

let boxes: Boxes | null = null;

/** The boxes, once they have come; null until then. */
export const boxesLoaded = (): Boxes | null => boxes;

/** Asks for the boxes' chunk, once; the pane draws them the moment it resolves. */
export const loadBoxes = async (): Promise<Boxes> => {
  if (!boxes) {
    const { ActivityFilters: row } = await import("./filters");
    boxes = row;
  }
  return boxes;
};

/** Where the boxes stand while their chunk is on its way: the row at the boxes' height, so the log does not move. */
export function BoxesWaiting({ open }: { open: boolean }) {
  return (
    <div className={`set-filters${open ? " open" : ""}`} aria-hidden="true" data-testid="act-filters-waiting">
      <span className="set-filters-waiting" />
    </div>
  );
}

/**
 * The phone's one control: the boxes stand between a reader and the log there, so they wait behind it until asked
 * for, and it says how many are set. The card draws it at the end of its head, beside the way back to the whole log,
 * so the head is one height whatever is set (under the head, on a line of its own, it pushed the log a row down). A
 * desktop does not draw it.
 */
export function FiltersAsk({ narrowed, open, onToggle }: { narrowed: number; open: boolean; onToggle: () => void }) {
  return (
    <Button
      variant="quiet"
      size="sm"
      className="set-filters-ask"
      aria-expanded={open}
      onClick={(e) => holdStill(e.currentTarget, onToggle)}
      data-testid="act-filters-ask"
    >
      <Icon name="filter" size={12} />
      {W.narrow}
      {narrowed > 0 && <span className="set-filters-ask-n">{narrowed}</span>}
    </Button>
  );
}
