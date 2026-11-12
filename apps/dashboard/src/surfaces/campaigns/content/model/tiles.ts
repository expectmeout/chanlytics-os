/**
 * A made piece's picture at its own shape, where a line draws it small (lines.tsx, list.tsx): a video or a story tall, a post
 * as it was made. Made's grid draws squares, as the Library's does (body.tsx).
 * A module of its own and pure: the page reads it, and nothing of the page rides in here.
 */
import type { FileDto } from "@chanlytics/contracts";

/** The shapes a tile is drawn in. Files' stylesheet says the same (files.css, `data-shape`). */
export type TileShape = "tall" | "portrait" | "square" | "wide";

/** The shape nearest a file's own. One with no size yet is tall where it is a video, and square otherwise. */
export function tileShapeOf(file: Pick<FileDto, "kind" | "width" | "height">): TileShape {
  if (!file.width || !file.height) return file.kind === "video" ? "tall" : "square";
  const tall = file.height / file.width;
  if (tall >= 1.5) return "tall";
  if (tall >= 1.12) return "portrait";
  if (tall > 0.88) return "square";
  return "wide";
}
