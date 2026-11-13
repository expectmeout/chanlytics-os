/**
 * All the Library keeps, under its headings (Ruben, 12 Nov 2026: Content's lists stand under headings, as Sequences',
 * Messages' and the Pipeline's do): what was found online and waits for a yes, first, then what was added this week and
 * earlier (time-groups.ts). Found online is the amber line that stood over the Library, opened: its photos are there to
 * look at, with Keep and Not mine for all of them, where the line took a press to reach them. A few of them: a website
 * can bring thirty, and the Library is under them, so the rest are one press away, in their own view.
 *
 * Squares or rows under each heading, as the page chose (pane.tsx `rows`). Photos on their way stand with this week's.
 */
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { FILE_WORDS as W, type FileDto, type FilesPageDto } from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import type { FrameFlash } from "../frame-verbs";
import { Button } from "../kit/button/button";
import { GroupHead } from "../kit/head/group-head";
import { InboxPress } from "./inbox-press";
import { Photo, PhotosOnTheirWay } from "./photo";
import type { SendingPhoto } from "./sending";
import { readFilesWaiting, type FilesView } from "./surface";
import { timeGroupsOf } from "./time-groups";

/** How many of what was found online stand over the Library: two rows of squares on a phone, or three lines. */
const FOUND_SQUARES = 6;
const FOUND_ROWS = 3;

/** Whether the Library is drawn under headings: over all it keeps, where nothing is searched for. A search is one flat list. */
export const libraryGroups = (dto: FilesPageDto): boolean => dto.shelf === "all" && !dto.about;

/**
 * What was found online and waits, while all the Library keeps is on show and anything waits: read beside the page's own
 * read, and again as the page's counts move (a photo kept, set aside or found), so it leaves or joins; never for a next
 * page of the same list, or a read that changed nothing. Nothing while none waits.
 */
export function useWaitingFiles(dto: FilesPageDto, on: boolean): readonly FileDto[] {
  const [held, setHeld] = useState<readonly FileDto[]>([]);
  const asks = on && dto.tally.waiting > 0;
  useEffect(() => {
    if (!asks) return undefined;
    let live = true;
    void readFilesWaiting()
      .then((waiting) => {
        if (live) setHeld(waiting.files);
      })
      // A read that failed leaves what was shown: the group stands as it was, and the next read of the page asks again.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [asks, dto.tally.waiting, dto.tally.total]);
  return asks ? held : [];
}

/** How a run of files is drawn under its heading: the page's rows, or squares. */
type Draw = (files: readonly FileDto[], lead?: ReactNode) => ReactNode;

/**
 * Found online: its heading with how many wait, what they are and the two presses for all of them, then the first few.
 * The heading stands as soon as the page says any wait: its photos join it as their read lands, and where that read
 * failed, or more wait than stand here, See all is the way to them. An amber line led there once; with it gone, nothing
 * that waits may go unsaid.
 */
function FoundOnline(p: {
  waiting: readonly FileDto[];
  total: number;
  shows: number;
  draw: Draw;
  flash: (f: FrameFlash) => void;
  go: (view: FilesView) => void;
}) {
  const { waiting, total } = p;
  return (
    <section className="cnv-group" aria-label={W.shelves.inbox} data-testid="fl-group-found">
      <GroupHead label={W.shelves.inbox} count={total} needs />
      <InboxPress inbox={waiting} flash={p.flash} />
      {p.draw(waiting.slice(0, p.shows))}
      {total > Math.min(waiting.length, p.shows) ? (
        <div className="files-more">
          <Button
            size="sm"
            variant="quiet"
            onClick={() => p.go({ shelf: "inbox", kind: null, about: null })}
            data-testid="fl-found-all"
          >
            {W.seeAllWaiting(total)}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

export function LibraryGroups(p: {
  dto: FilesPageDto;
  /** The files as the wall draws them (pane.tsx shownOf), newest first. */
  shown: readonly FileDto[];
  /** What was found online and waits (useWaitingFiles), as far as it has been read. */
  waiting: readonly FileDto[];
  /** How many wait, as the page's own read says; 0 where this person may not keep them, or a kind is picked: no group. */
  waitingCount: number;
  going: readonly SendingPhoto[];
  rows: ((files: readonly FileDto[], open: (id: string) => void) => ReactNode) | null;
  grid: Ref<HTMLDivElement>;
  busy: boolean;
  flash: (f: FrameFlash) => void;
  setOpenId: (id: string | null) => void;
  go: (view: FilesView) => void;
}) {
  const { dto, rows, going, flash, setOpenId } = p;
  const groups = timeGroupsOf(p.shown, (file) => file.created_at, {
    zone: pageClock().zone(),
    nowMs: Date.now(),
    more: dto.next !== null,
  });
  const onTheirWay = going.length > 0 ? <PhotosOnTheirWay photos={going} flash={flash} onOpen={setOpenId} /> : null;
  const draw: Draw = (files, lead = null) =>
    rows ? (
      <>
        {lead ? <div className="files-grid">{lead}</div> : null}
        {rows(files, setOpenId)}
      </>
    ) : (
      <div className="files-grid">
        {lead}
        {files.map((file) => (
          <Photo key={file.id} file={file} onOpen={() => setOpenId(file.id)} />
        ))}
      </div>
    );
  // Photos on their way are this week's: with its squares where it is there, else under no heading, over the rest.
  const week = groups.find((group) => group.key === "week");
  return (
    <div ref={p.grid} className="cnv-groups" data-testid="fl-grid" aria-busy={p.busy || undefined}>
      {p.waitingCount > 0 ? (
        <FoundOnline
          waiting={p.waiting}
          total={p.waitingCount}
          shows={rows ? FOUND_ROWS : FOUND_SQUARES}
          draw={draw}
          flash={flash}
          go={p.go}
        />
      ) : null}
      {onTheirWay && !week ? <div className="files-grid">{onTheirWay}</div> : null}
      {groups.map((group) => (
        <section key={group.key} className="cnv-group" aria-label={group.label} data-testid={`fl-group-${group.key}`}>
          <GroupHead label={group.label} count={group.count} />
          {draw(group.items, group.key === "week" ? onTheirWay : null)}
        </section>
      ))}
    </div>
  );
}
