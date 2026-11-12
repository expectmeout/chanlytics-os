/**
 * The pieces after the one that is open, asked for before they are shown, so a walk to the next lands drawn: the picture the
 * stage draws (a made post at its portrait shape, a video's poster), by an image the browser keeps. Two at most, each once a
 * visit (model/piece-open.ts piecesToReadAhead says which). A video's film is asked for only when it is played.
 */
import { fileViewOf, type ContentMadeDto } from "@chanlytics/contracts";
import { postShapeAddress } from "../../files/post-shapes";
import { piecesToReadAhead } from "./model/piece-open";

const readAlready = new Set<string>();

/** The address the stage draws a piece at. */
const stagedAt = (file: ContentMadeDto["file"]): string =>
  file.kind === "video" ? `${fileViewOf(file.id)}?w=1280` : postShapeAddress(file.id, "portrait");

/** Ask for them. Nothing waits on it, and one that fails is asked for again when it is opened. */
export function readAhead(pieces: readonly ContentMadeDto[], openId: string): void {
  if (typeof Image !== "function") return;
  const byId = new Map(pieces.map((m) => [m.file.id, m.file]));
  for (const id of piecesToReadAhead(pieces, openId, readAlready)) {
    const file = byId.get(id);
    if (!file) continue;
    readAlready.add(id);
    new Image().src = stagedAt(file);
  }
}
