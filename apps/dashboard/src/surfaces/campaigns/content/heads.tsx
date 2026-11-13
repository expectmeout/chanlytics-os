/**
 * What stands over both of Content's lists, the same on Made and on the Library (Ruben, 12 Nov 2026: one way for both): one
 * line to find by words, a head with the way back to All where a list shows what was set aside or what waits, and a quiet
 * press at the foot of All for what was set aside. What waits on the owner is each list's first group, under its heading
 * (body.tsx MadeGroups, files/library-groups.tsx), where an amber line led to it.
 */
import type { ReactNode, Ref } from "react";
import { CONTENT_WORDS as W, FILE_WORDS, type ContentPageDto, type FilesPageDto } from "@chanlytics/contracts";
import { refreshSurface } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { FindWords } from "../../files/library-views";
import { showFiles, type FilesView } from "../../files/surface";
import { useSurface } from "../../use-surface";
import { askContentFind } from "./surface";

/** Where a list stands apart from All (what was set aside, what waits): the way back, and what it is, with how many. */
export function BackHead({
  said,
  back,
  onBack,
  testid,
}: {
  said: string;
  back: string;
  onBack: () => void;
  testid: string;
}) {
  return (
    <div className="files-shelf-head" data-testid={testid}>
      <Button size="sm" variant="quiet" onClick={onBack} data-testid={`${testid}-back`}>
        {back}
      </Button>
      <span className="files-shelf-said">{said}</span>
    </div>
  );
}

/** A quiet press at the foot of a list: what was set aside, which opens it. */
export function QuietMore({ said, onPress, testid }: { said: string; onPress: () => void; testid: string }) {
  return (
    <div className="files-more">
      <Button size="sm" variant="quiet" onClick={onPress} data-testid={testid}>
        {said}
      </Button>
    </div>
  );
}

/** The Library as it is read: what it shows, and its tally; nothing until read. */
function useLibraryView(): { view: FilesView; dto: FilesPageDto } | null {
  const held = useSurface("files");
  if (!held) return null;
  const { dto } = held;
  return { view: { shelf: dto.shelf, kind: dto.kind, about: dto.about }, dto };
}

/**
 * What stands over the Library only while it holds something: an empty Library's own page leads with its own Add photos (files
 * pane.tsx), so the head's coral Add and the Squares or List choice wait for its first file. Nothing until it is read: a coral
 * Add that vanishes as the read lands would be a press promised and taken back.
 */
export function WhileLibraryHolds({ children }: { children: ReactNode }) {
  return useLibraryHolds() ? <>{children}</> : null;
}

/** Whether the Library holds anything, as its own read says: not until it is read. */
export function useLibraryHolds(): boolean {
  const held = useLibraryView();
  return !!held && held.dto.tally.total > 0;
}

/** How a find line is drawn: on a phone folded while it holds no words, its field the bar's glyph puts the caret in. */
interface FindDrawn {
  inputRef?: Ref<HTMLTextAreaElement>;
  folds?: boolean;
}

/** The find line of the list shown: the words it holds, what it is called, and what finding does. */
export interface ContentFindLine {
  about: string | null;
  label: string;
  testid: string;
  onFind: (about: string | null) => void;
}

/**
 * The find line of the list shown, or null where the list draws none: Made's over All, where anything was made or a search
 * stands; the Library's over all it keeps, where it keeps anything (what waits or was set aside says where it is instead).
 * Asked once, by the page: a phone's bar shows the search's glyph while the line holds no words, as People's and the Inbox's
 * do, and the line is drawn from the same answer (ContentFind), so the two never differ.
 */
export function useContentFind(library: boolean, made: ContentPageDto | null | undefined): ContentFindLine | null {
  const files = useLibraryView();
  if (library) {
    if (!files || files.view.shelf !== "all" || files.dto.tally.total === 0) return null;
    const { view } = files;
    return {
      about: view.about,
      label: FILE_WORDS.find,
      testid: "fl-find",
      onFind: (about) => void showFiles({ ...view, about }).catch(() => undefined),
    };
  }
  if (!made || made.view !== "all" || (made.tally.made === 0 && !made.about)) return null;
  return {
    about: made.about,
    label: W.find,
    testid: "cnv-find",
    // All found by its words, read again as they change.
    onFind: (about) => {
      if (askContentFind(about)) void refreshSurface("content");
    },
  };
}

/** The one search line under the bar, the list's own (useContentFind); nothing where the list draws none. */
export function ContentFind({ find, drawn = {} }: { find: ContentFindLine | null; drawn?: FindDrawn }) {
  if (!find) return null;
  return <FindWords about={find.about} onFind={find.onFind} placeholder={find.label} testid={find.testid} {...drawn} />;
}
