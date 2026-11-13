/**
 * What stands over both of Content's lists, the same on Made and on the Library (Ruben, 12 Nov 2026: one way for both): one
 * line to find by words, one amber line for what waits on the owner, a head with the way back to All where a list shows what
 * was set aside or what waits, and a quiet press at the foot of All for what was set aside.
 */
import type { ReactNode } from "react";
import { CONTENT_WORDS as W, FILE_WORDS, type ContentPageDto, type FilesPageDto } from "@chanlytics/contracts";
import { canDo, refreshSurface } from "../../frame-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Press } from "../../kit/press";
import { FindWords } from "../../files/library-views";
import { showFiles, type FilesView } from "../../files/surface";
import { useSurface } from "../../use-surface";
import { askContentFind } from "./surface";

/**
 * One amber line over a list while something waits on the owner (the content canvas's "1 post didn't go out · Try again"):
 * what, and the one thing to do, the whole line one press. Made says what did not go out; the Library, what was found and
 * waits for a yes.
 */
export function OwedLine({
  said,
  act,
  onPress,
  testid,
}: {
  said: string;
  act: string;
  onPress: () => void;
  testid: string;
}) {
  return (
    <Press className="cnv-needs" onClick={onPress} data-testid={testid}>
      <span className="cnv-dot" aria-hidden="true" />
      <span className="cnv-needs-words">{said}</span>
      <span className="cnv-needs-act">
        {act}
        <Icon name="chevron" size={11} />
      </span>
    </Press>
  );
}

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
  const held = useLibraryView();
  return !held || held.dto.tally.total === 0 ? null : <>{children}</>;
}

/** Made's search: All found by its words, read again as they change. Over All alone, as the Library's is over all it keeps. */
function MadeFind({ dto }: { dto: ContentPageDto }) {
  return (
    <FindWords
      about={dto.about}
      onFind={(about) => {
        if (askContentFind(about)) void refreshSurface("content");
      }}
      placeholder={W.find}
      testid="cnv-find"
    />
  );
}

/** The Library's search, over all it keeps: what waits or was set aside says where it is instead. */
function LibraryFind() {
  const held = useLibraryView();
  if (!held || held.view.shelf !== "all" || held.dto.tally.total === 0) return null;
  const { view } = held;
  return (
    <FindWords
      about={view.about}
      onFind={(about) => void showFiles({ ...view, about }).catch(() => undefined)}
      placeholder={FILE_WORDS.find}
      testid="fl-find"
    />
  );
}

/** The one search line under the bar, the list's own: Made's over All, the Library's over all it keeps. */
export function ContentFind({ library, made }: { library: boolean; made: ContentPageDto | null | undefined }) {
  if (library) return <LibraryFind />;
  if (!made || made.view !== "all" || (made.tally.made === 0 && !made.about)) return null;
  return <MadeFind dto={made} />;
}

/** The Library's amber line: what was found on the website or Google and waits for a yes, with Look. Not while it is searched. */
export function LibraryOwed() {
  const held = useLibraryView();
  if (!held || !canDo("settings")) return null;
  const { view, dto } = held;
  if (view.shelf !== "all" || view.about || dto.tally.waiting === 0) return null;
  return (
    <OwedLine
      said={FILE_WORDS.waitingLine(dto.tally.waiting)}
      act={FILE_WORDS.look}
      onPress={() => void showFiles({ shelf: "inbox", kind: null, about: null }).catch(() => undefined)}
      testid="fl-waiting"
    />
  );
}
