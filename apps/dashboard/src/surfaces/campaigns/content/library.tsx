/**
 * Content's library (the content redesign's stage 2): Files' own library, its adding, its shelves and its inbox, standing in
 * Content's list pane (files/pane.tsx LibraryInContent), a file opening in Content's viewer. A chunk of its own, asked for the
 * first time Library is shown, so Made's first load carries none of it. It tells the page which files it shows, in their
 * order, so the viewer walks them as it walks what was made.
 */
import { useEffect } from "react";
import type { ContentMadeDto } from "@chanlytics/contracts";
import type { FrameFlash } from "../../frame-verbs";
import { LibraryInContent } from "../../files/pane";
import { useSurface } from "../../use-surface";

export default function ContentLibrary({
  flash,
  onOpen,
  onPieces,
}: {
  flash: (f: FrameFlash) => void;
  onOpen: (id: string) => void;
  /** The files the library shows, as pieces with no posts: what the viewer walks from one to the next. A state's setter. */
  onPieces: (pieces: ContentMadeDto[] | null) => void;
}) {
  const held = useSurface("files");
  const files = held ? held.dto.files : null;
  useEffect(() => {
    onPieces(files ? files.map((file) => ({ file, posts: [] })) : null);
  }, [files, onPieces]);
  return <LibraryInContent flash={flash} onOpen={onOpen} />;
}
