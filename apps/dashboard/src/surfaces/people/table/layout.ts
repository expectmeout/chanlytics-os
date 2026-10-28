/**
 * How wide each column of the table is, for People, Leads and the Pipeline alike. A column declares what it wants
 * (`ColumnWidth`: where it starts, the least it is squeezed to, the most a share of spare room takes it to, and how
 * big a share it asks for); this module settles every width from that, the room the table has and the widths a member
 * dragged, so no width is a class on a cell or a cap in `ch`, and no column is a sponge by accident.
 *
 * Pure: no React and no DOM, so the sums are tested as sums (tooling/scripts/tests/people/table-layout.test.mjs). The
 * table draws what it returns as `<col width>` under `table-layout: fixed` (table.tsx), and the page keeps a member's
 * choices in the view it saves (hooks/use-controls.ts), through `plLayoutChoices` here.
 */

/** What a column asks of the room. Every number is a width in CSS pixels. */
export interface ColumnWidth {
  /** Where it starts: the width it has when nobody set one and the table has no room to spare. */
  base: number;
  /** The least a column that takes a share (`grow`) gives way to before the table scrolls sideways instead; one with no share stays at `base`. Defaults to `base`. */
  min?: number;
  /** The most a share of spare room takes it to, while another column can still take the room. */
  max?: number;
  /** Its share of spare room, against the other columns' shares. None (the default) is a column that stays at `base`. */
  grow?: number;
}

/** What the sums need of a column. */
export interface SizedColumn {
  key: string;
  width?: ColumnWidth;
}

/** A column that declares nothing is this wide, and stays so. */
const PL_DEFAULT_WIDTH: ColumnWidth = { base: 120 };
/** The narrowest a member may drag any column to, and the widest. */
export const PL_DRAG_MIN_PX = 56;
export const PL_DRAG_MAX_PX = 1200;
/**
 * A width as a drag or a key may leave it: whole pixels between the least and the most, the most being wherever the column
 * already stands where that is wider (a column a wide window made wide must not shrink to the limit at the first pixel).
 */
export const plClampWidth = (px: number, standing: number = 0): number =>
  Math.min(Math.max(PL_DRAG_MAX_PX, Math.round(standing)), Math.max(PL_DRAG_MIN_PX, Math.round(px)));

/** A step of the keyboard on a column's edge, and a bigger one with Shift. */
export const PL_NUDGE_PX = 16;
export const PL_NUDGE_BIG_PX = 64;

interface ResolvedWidths {
  /** One width a column, in the order given. */
  widths: number[];
  /** What they add up to: more than the room means the table scrolls sideways. */
  total: number;
  scrolls: boolean;
}

const specOf = (c: SizedColumn): Required<Pick<ColumnWidth, "base" | "min" | "grow">> & { max: number } => {
  const w = c.width ?? PL_DEFAULT_WIDTH;
  return { base: w.base, min: Math.min(w.min ?? w.base, w.base), max: w.max ?? Infinity, grow: w.grow ?? 0 };
};

/** A width a member dragged to, as a width: a finite number inside the drag's bounds, else nothing. */
const draggedOf = (user: Readonly<Record<string, number>>, key: string): number | null => {
  const v = user[key];
  return typeof v === "number" && Number.isFinite(v)
    ? Math.min(PL_DRAG_MAX_PX, Math.max(PL_DRAG_MIN_PX, Math.round(v)))
    : null;
};

/**
 * The most a fit takes a column to: what it holds, never past the most the column asks for (Person holds every word a
 * person wrote, and fitted to them it stood 1111px wide), nor outside a drag's bounds.
 */
export const plFitWidth = (measured: number, width?: ColumnWidth): number =>
  Math.min(width?.max ?? PL_DRAG_MAX_PX, PL_DRAG_MAX_PX, Math.max(PL_DRAG_MIN_PX, Math.round(measured)));

/**
 * A column while its width is settled: where it stands now, what it asks, whether it takes a share of spare room, and
 * whether a member dragged it (`dragged`: its min is then the less of the column's and the width they chose).
 */
interface Cell {
  width: number;
  grow: number;
  min: number;
  max: number;
  takes: boolean;
  dragged: boolean;
}

/**
 * Spread `free` pixels over the columns that take a share, by their shares, none past its `max` while another can still
 * take the room. When every one is at its max the rest goes to them by their shares all the same, so the table is as wide
 * as its room and the browser has none left to hand to the columns that were meant to stay put.
 */
function spread(takers: readonly Cell[], free: number): void {
  let open = takers.filter((t) => t.width < t.max);
  let left = free;
  while (left > 0.5 && open.length) {
    const shares = open.reduce((sum, t) => sum + t.grow, 0);
    let spent = 0;
    for (const t of open) {
      const give = Math.min((left * t.grow) / shares, t.max - t.width);
      t.width += give;
      spent += give;
    }
    left -= spent;
    open = open.filter((t) => t.width < t.max - 0.01);
  }
  if (left > 0.5 && takers.length) {
    const shares = takers.reduce((sum, t) => sum + t.grow, 0);
    for (const t of takers) t.width += (left * t.grow) / shares;
  }
}

/** Take `deficit` pixels back from the columns that take a share, by how much each can still give up, none below its min. */
function squeeze(takers: readonly Cell[], deficit: number): void {
  const room = takers.reduce((sum, t) => sum + Math.max(0, t.width - t.min), 0);
  if (room <= 0) return;
  const take = Math.min(deficit, room);
  for (const t of takers) t.width -= (take * Math.max(0, t.width - t.min)) / room;
}

/**
 * Every column's width. `available` is the room the table has (its box's width), or null before it is measured, when each
 * column is where it starts. The columns nobody dragged start at `base`, share the room left over by their `grow` and give
 * way down to their `min` before the table scrolls. A width a member dragged is theirs: it never grows, and where the room
 * is short it gives way last, after every other column has, down to the column's min (or the width they chose, where that
 * is less). It once held whatever the room: a Person dragged or fitted wide on one screen covered the whole box on a
 * smaller one, pinned over every other column, which no scroll could then reach (27 Oct 2026, 979px in an 888px box).
 * Whole pixels, and together exactly the room when they fit, so the browser has nothing left to redistribute.
 */
export function resolveColumnWidths(
  columns: readonly SizedColumn[],
  user: Readonly<Record<string, number>>,
  available: number | null,
): ResolvedWidths {
  const cells: Cell[] = columns.map((c) => {
    const spec = specOf(c);
    const dragged = draggedOf(user, c.key);
    return {
      width: dragged ?? spec.base,
      grow: spec.grow,
      min: dragged === null ? spec.min : Math.min(spec.min, dragged),
      max: spec.max,
      takes: dragged === null && spec.grow > 0,
      dragged: dragged !== null,
    };
  });
  const takers = cells.filter((c) => c.takes);
  const sum = (): number => cells.reduce((x, c) => x + c.width, 0);
  // The columns whose widths were worked out to make the room: the takers, and the dragged ones once they gave way.
  let flex = takers;
  if (available !== null && available > 0) {
    const now = sum();
    if (now < available) spread(takers, available - now);
    else if (now > available) {
      squeeze(takers, now - available);
      const short = sum() - available;
      const dragged = cells.filter((c) => c.dragged);
      if (short > 0.01 && dragged.length) {
        squeeze(dragged, short);
        flex = [...takers, ...dragged];
      }
    }
  }
  // Rounding leaves a pixel or two either way (half a pixel a column at most): the widest of the columns that made the
  // room keeps the difference, so the sum is the room. Only where the widths made the room: past every min they are wider
  // than it and the table scrolls, and no column is taken under its min to round that.
  const made = available !== null && Math.abs(sum() - available) < 0.01;
  const whole = cells.map((c) => ({ taker: flex.includes(c), px: Math.round(c.width) }));
  const total = whole.reduce((x, c) => x + c.px, 0);
  const off = available === null ? 0 : Math.round(available) - total;
  const widest = whole.reduce<{ px: number } | null>((x, c) => (c.taker && (x === null || c.px > x.px) ? c : x), null);
  if (made && off !== 0 && widest) widest.px += off;
  const widths = whole.map((c) => c.px);
  const room = widths.reduce((x, y) => x + y, 0);
  return { widths, total: room, scrolls: available !== null && room > Math.round(available) };
}

/** The columns in a member's order: the keys they put in order first, then the rest as the page lists them. */
export function plOrdered<C extends { key: string; pinned?: boolean; fixed?: boolean }>(
  columns: readonly C[],
  order: readonly string[],
): C[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  const place = (c: C): number => (c.pinned ? -1 : c.fixed ? Infinity : (rank.get(c.key) ?? order.length));
  return columns
    .map((c, i) => ({ c, i }))
    .sort((a, b) => place(a.c) - place(b.c) || a.i - b.i)
    .map((x) => x.c);
}

/** How tall a row stands: the member's choice, saved with the rest of the view. */
export type Density = "comfortable" | "compact";

/** What a member chose of the table's layout, as the view keeps it: only what differs from the page's own. */
export interface LayoutChoices {
  widths: Record<string, number>;
  order: string[];
  density: Density;
}

/** A saved layout, read with care: widths of columns that can be dragged, in bounds; keys of columns that exist; a density. */
export function plLayoutChoices(
  columns: readonly { key: string; pinned?: boolean; fixed?: boolean }[],
  raw: { widths?: unknown; order?: unknown; density?: unknown },
): LayoutChoices {
  const widths: Record<string, number> = {};
  if (raw.widths && typeof raw.widths === "object" && !Array.isArray(raw.widths)) {
    for (const c of columns) {
      const v = (raw.widths as Record<string, unknown>)[c.key];
      if (!c.fixed && typeof v === "number" && Number.isFinite(v))
        widths[c.key] = draggedOf({ [c.key]: v }, c.key) ?? v;
    }
  }
  const known = new Set(columns.filter((c) => !c.pinned && !c.fixed).map((c) => c.key));
  const order: string[] = [];
  if (Array.isArray(raw.order))
    for (const k of raw.order) if (typeof k === "string" && known.has(k) && !order.includes(k)) order.push(k);
  const density: Density = raw.density === "compact" ? "compact" : "comfortable";
  return { widths, order, density };
}

/** The columns a member may move, as they stand now: their order, over the keys of those drawn. */
const standing = (order: readonly string[], movable: readonly string[]): string[] =>
  plOrdered(
    movable.map((k) => ({ key: k })),
    order,
  ).map((c) => c.key);

/** The order with `key` one place earlier (`-1`) or later (`1`) among the columns a member may move: unchanged at an end. */
export function plMoved(order: readonly string[], movable: readonly string[], key: string, by: -1 | 1): string[] {
  const now = standing(order, movable);
  const at = now.indexOf(key);
  const to = at + by;
  if (at < 0 || to < 0 || to >= now.length) return [...order];
  const next = [...now];
  const here = next[at];
  const there = next[to];
  if (here === undefined || there === undefined) return [...order];
  next[at] = there;
  next[to] = here;
  return next;
}

/** The order with `key` where `target` stands: before it when it came from the right, after it when from the left. */
export function plMovedTo(order: readonly string[], movable: readonly string[], key: string, target: string): string[] {
  const now = standing(order, movable);
  const from = now.indexOf(key);
  const to = now.indexOf(target);
  if (from < 0 || to < 0 || from === to) return [...order];
  const next = now.filter((k) => k !== key);
  next.splice(to, 0, key);
  return next;
}
