/**
 * Content, readied while another view of Campaigns is shown (campaigns/home/route.tsx), as Sequences and Messages are: its page
 * read, and the pictures of its first screen asked for at the size the page draws them, so the tab, pressed, shows its pieces
 * at once rather than "Reading…" and then each picture fading in (Ruben, 12 Nov 2026). Its own chunk with the page's, asked
 * for once the frame is idle: nothing of it rides the route.
 */
import type { ContentPageDto } from "@chanlytics/contracts";
import { refreshSurface } from "../../frame-verbs";
import { rowPictureOf, smallPictureOf, warmPicture } from "../../files/photo";
import { surfaceValue } from "../../surface-values";
import { cmPhoneNow } from "../parts/split";
import { contentLayoutNow, type ContentLayout } from "./views";

/** How many pieces a first screen shows at most: four rows of three on a phone, a desk's first rows of tiles. */
const FIRST_SCREEN = 12;

/**
 * The pictures the first screen of All draws, in the order its groups stand (model/groups.ts): what needs the owner, what is
 * being made, then what was made, each once, at the size its rows or its squares draw it (files/photo.tsx).
 */
function firstPicturesOf(dto: ContentPageDto, layout: ContentLayout): string[] {
  const ids = new Set([
    ...dto.lines.map((line) => line.file.id),
    ...dto.making.flatMap((m) => (m.first_picture ? [m.first_picture] : [])),
    ...dto.made.map((m) => m.file.id),
  ]);
  return [...ids].slice(0, FIRST_SCREEN).map(layout === "list" ? rowPictureOf : smallPictureOf);
}

/** Content's page read, where it has not been, and its first screen's pictures in. Answers once both are; never refuses. */
export async function warmContent(): Promise<void> {
  if (surfaceValue("content") === undefined) await refreshSurface("content");
  const dto = surfaceValue("content")?.dto;
  if (!dto) return;
  await Promise.all(firstPicturesOf(dto, contentLayoutNow(cmPhoneNow())).map(warmPicture));
}
