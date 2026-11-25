/**
 * Content, readied while another view of Campaigns is shown (campaigns/home/route.tsx), as Sequences and Messages are: its page
 * read, and the pictures of its first screen asked for at the size the page draws them, so the tab, pressed, shows its pieces
 * at once rather than "Reading…" and then each picture fading in (Ruben, 12 Nov 2026). Its own chunk with the page's, asked
 * for once the frame is idle: nothing of it rides the route.
 *
 * It answers once the read is in, and the pictures come in behind it. The route drew Content hidden only once all twelve
 * had come, which is a dozen resized posters: a swipe a second or two after landing on Campaigns found it not drawn, the
 * page under the strip blank, then Reading…, then its counts, its tiles and their pictures one by one (Ruben's recording,
 * 17 Nov 2026). Drawn on its read, the page is whole as it is shown, and a picture is the one thing that can still arrive.
 */
import type { ContentPageDto } from "@chanlytics/contracts";
import { refreshSurface } from "../../frame-verbs";
import { rowPictureOf, smallPictureOf, warmPicture } from "../../files/photo";
import { surfaceValue } from "../../surface-values";
import { libraryCode } from "../parts/library-code";
import { cmPhoneNow } from "../parts/phone-query";
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

/**
 * The Library, readied while Made is shown (page.tsx): its code, its read, and its first screen's pictures, so a press on
 * Library shows it whole. Pressed cold, the page under the bar went blank, the search, the filter and the coral act with it,
 * for 0.6 s, then drew its tiles with no pictures, then the Add (Ruben's recordings, 22 and 24 Nov 2026).
 */
export async function warmLibrary(): Promise<void> {
  libraryCode.warm();
  if (surfaceValue("files") === undefined) await refreshSurface("files");
  const dto = surfaceValue("files")?.dto;
  if (!dto) return;
  const pictureOf = contentLayoutNow(cmPhoneNow()) === "list" ? rowPictureOf : smallPictureOf;
  for (const file of dto.files.slice(0, FIRST_SCREEN)) void warmPicture(pictureOf(file.id));
}

/** Content's page read, where it has not been, and its first screen's pictures asked for. Answers once the read is in. */
export async function warmContent(): Promise<void> {
  if (surfaceValue("content") === undefined) await refreshSurface("content");
  const dto = surfaceValue("content")?.dto;
  if (!dto) return;
  for (const src of firstPicturesOf(dto, contentLayoutNow(cmPhoneNow()))) void warmPicture(src);
}
