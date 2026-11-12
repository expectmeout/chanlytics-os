/**
 * A made piece's tile, at its own shape (the content canvas, "The home"): a video or a story tall, a post as it was made.
 * A module of its own and pure: the page reads it, and nothing of the page rides in here.
 */
import type { FileDto } from "@chanlytics/contracts";

/** The shapes a tile is drawn in. Files' stylesheet says the same (files.css, `data-shape`). */
export type TileShape = "tall" | "portrait" | "square" | "wide";

/** How tall each stands for its width. */
const TILE_HEIGHT_OF = { tall: 16 / 9, portrait: 5 / 4, square: 1, wide: 3 / 4 } as const satisfies Record<
  TileShape,
  number
>;

/** The shape nearest a file's own. One with no size yet is tall where it is a video, and square otherwise. */
export function tileShapeOf(file: Pick<FileDto, "kind" | "width" | "height">): TileShape {
  if (!file.width || !file.height) return file.kind === "video" ? "tall" : "square";
  const tall = file.height / file.width;
  if (tall >= 1.5) return "tall";
  if (tall >= 1.12) return "portrait";
  if (tall > 0.88) return "square";
  return "wide";
}

/** What stands under a tile's picture, as a share of its width: its name and where it stands. */
const TILE_WORDS = 0.28;

/** The pieces dealt into columns, each to the shortest so far, in the order given, so the newest read across the top. */
export function contentColumnsOf<T>(pieces: readonly T[], count: number, shapeOf: (piece: T) => TileShape): T[][] {
  const columns: T[][] = Array.from({ length: Math.max(1, count) }, () => []);
  const heights = columns.map(() => 0);
  for (const piece of pieces) {
    let at = 0;
    for (let i = 1; i < heights.length; i += 1) if ((heights[i] ?? 0) < (heights[at] ?? 0) - 1e-9) at = i;
    columns[at]?.push(piece);
    heights[at] = (heights[at] ?? 0) + TILE_HEIGHT_OF[shapeOf(piece)] + TILE_WORDS;
  }
  return columns;
}
