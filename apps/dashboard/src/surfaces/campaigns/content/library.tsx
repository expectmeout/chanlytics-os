/**
 * Content's library (the content redesign's stage 2): Files' own library, its adding, its shelves and its inbox, standing in
 * Content's list pane (files/pane.tsx LibraryInContent), a file opening in Content's viewer. A chunk of its own, asked for the
 * first time Library is shown, so Made's first load carries none of it. It tells the page which files it shows, in their
 * order, so the viewer walks them as it walks what was made.
 */
import { useEffect } from "react";
import type { ContentMadeDto } from "@chanlytics/contracts";
import type { FrameFlash } from "../../frame-verbs";
import { FolderLine } from "../../files/footage/line";
import { LibraryInContent } from "../../files/pane";
import { useSurface } from "../../use-surface";
import { FileLines } from "./lines";
import { FoundCard } from "./found-card";
import type { ContentLayout } from "./views";

export default function ContentLibrary({
  flash,
  onOpen,
  onPieces,
  onAdder,
  layout,
}: {
  flash: (f: FrameFlash) => void;
  onOpen: (id: string) => void;
  /** The files the library shows, as pieces with no posts: what the viewer walks from one to the next. A state's setter. */
  onPieces: (pieces: ContentMadeDto[] | null) => void;
  /** The library's Add, for the page's head to draw coral (the content canvas: Make on Made, Add on the Library). */
  onAdder: (add: (() => void) | null) => void;
  /** Squares or rows, as Made shows: one choice for both lists (views.tsx useContentLayout). */
  layout: ContentLayout;
}) {
  const held = useSurface("files");
  const files = held ? held.dto.files : null;
  // Where Ask looked for photos and videos, read with the library's own read while it holds nothing: its empty page's card.
  const sources = held?.dto.sources ?? null;
  useEffect(() => {
    onPieces(files ? files.map((file) => ({ file, posts: [] })) : null);
  }, [files, onPieces]);
  return (
    <>
      {/* A watched folder's news, over the list; an empty Library says it on its own card (FoundCard). */}
      {files && files.length > 0 ? <FolderLine /> : null}
      <LibraryInContent
        flash={flash}
        onOpen={onOpen}
        onAdder={onAdder}
        rows={layout === "list" ? (shown, open) => <FileLines files={shown} onOpen={open} /> : null}
        empty={
          sources
            ? ({ add, videos }) => (
                <FoundCard sources={sources} videos={videos} onAdd={add} onLibrary={null} surface="files" />
              )
            : null
        }
      />
    </>
  );
}
