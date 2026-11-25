/**
 * The pieces after the one that is open, asked for before they are shown, so a walk to the next lands drawn: the picture the
 * stage draws (a made post at its portrait shape, a video's poster), by an image the browser keeps. Two at most, each once a
 * visit (model/piece-open.ts piecesToReadAhead says which). A video's film is asked for only when it is played.
 */
import { fileViewOf, type ContentMadeDto } from "@chanlytics/contracts";
import { readRecordAhead } from "../../files/post-record";
import { postShapeAddress } from "../../files/post-shapes";
import { piecesToReadAhead } from "./model/piece-open";

const readAlready = new Set<string>();

/** The address the stage draws a piece at. */
const stagedAt = (file: ContentMadeDto["file"]): string =>
  file.kind === "video" ? `${fileViewOf(file.id)}?w=1280` : postShapeAddress(file.id, "portrait");

/**
 * Ask for them: each one's picture, and its record (files/post-record.ts), so its line, where it stands and its coral act are
 * there as it lands. Nothing waits on it, and one that fails is asked for again when it is opened.
 */
export function readAhead(pieces: readonly ContentMadeDto[], openId: string): void {
  if (typeof Image !== "function") return;
  const byId = new Map(pieces.map((m) => [m.file.id, m]));
  for (const id of piecesToReadAhead(pieces, openId, readAlready)) {
    const piece = byId.get(id);
    if (!piece) continue;
    readAlready.add(id);
    new Image().src = stagedAt(piece.file);
    readRecordAhead(piece.file, piece.posts);
  }
}
