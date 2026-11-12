/**
 * Settings › Files (decision 0099): every photo the business has, one page, whichever road brought it. A grid a person can
 * scan, shelves that are filters over what each file says it shows, and a sheet for what a person says of one: its name, its
 * shelf, who is in it. Each is looked at once by a small model, so the name and the shelf arrive by themselves; a person's
 * word stays over the model's. What was found for them waits in the Inbox, which the page opens on and one press clears. A shelf
 * comes a page at a time, and the server says how the whole library stands (surface.ts).
 *
 * Settings loads no Base UI popup, so the sheet and the shelf's list are the house's (kit/record/sheet, kit/more-menu): a page
 * that newly imports the kit's pays for it on every tab. Whoever may add a photo or a video adds them, an operator too; a member
 * who may not change a file reads it, with nothing dead to press. The presses are verbs.ts's, which the doors check again; what is on its way is sending.ts's. The words are contracts'
 * (FILE_WORDS), the parts the kit's. This module is the page; photo.tsx its tiles, file-sheet.tsx one file opened.
 *
 * With nothing here the page is the grid with nothing in it: empty tiles at the size a photo draws, what to do under them, and the first
 * photos land in those same squares, so nothing jumps. A desk can bring photos to the whole page, by dragging or pasting them, as well as
 * pick them (kit/drop).
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  FILE_SHELVES,
  FILE_WORDS as W,
  filesSayOf,
  inboxCleanOf,
  videoPreviewOf,
  type FileDto,
  type FileShelf,
  type FilesPageDto,
  type FilesTally,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { usePageTakesFiles } from "../kit/drop/drop";
import { EmptyState } from "../kit/empty/empty";
import { LineFiles } from "../kit/line/line";
import { Notice } from "../kit/notice/notice";
import { Press } from "../kit/press";
import { Segmented } from "../kit/segmented/segmented";
import { useHeightGlide } from "../kit/motion/use-height-glide";
import { useRowOpens } from "../kit/motion/use-row-opens";
import { useSwapMotion } from "../kit/motion/use-swap-motion";
import { doAsked } from "../kit/sheet/back";
import { canDo, gate, refreshSurface, type FrameFlash } from "../frame-verbs";
import { useSurface } from "../use-surface";
import { followFileAsked } from "./file-asked";
import { FileSheet } from "./file-sheet";
import { InboxPress } from "./inbox-press";
import { Photo, PhotosOnTheirWay } from "./photo";
import { addPhotos, clearSaid, inLandedOrder, isVideoFile, stillGoing, useSending, type SendingPhoto } from "./sending";
import { showFilesShelf, showMoreFiles } from "./surface";
import { FILE_PICKS, FILE_PICKS_WITH_VIDEO, fileVerbs } from "./verbs";
import "./files.css";

/**
 * Whether the workspace takes videos (`features.video_preview`, contracts videoPreviewOf: Ruben's to set per workspace while
 * stage B is tried), read off the settings surface Settings opens on, so it draws again when that read lands.
 */
function useVideosTaken(): boolean {
  const settings = useSurface("settings");
  return videoPreviewOf(settings?.settings?.config);
}

/** The shelves drawn: Kept first, then each that holds something, with how many. */
function shelvesOf(tally: FilesTally) {
  return FILE_SHELVES.filter((s) => s === "all" || tally.shelves[s]).map((s) => ({
    value: s,
    label: s === "all" ? W.shelves[s] : `${W.shelves[s]} ${tally.shelves[s] ?? 0}`,
    testid: `fl-shelf-${s}`,
  }));
}

/**
 * The file a sheet holds: the page's own where it stands on the shelf on show, and otherwise read by itself, again as the list is, since
 * a link, a post's photo or Ask can name one on another shelf or further down this one. One that is gone is no sheet.
 */
function useFileOpen(id: string | null, files: readonly FileDto[], readAt: number): FileDto | undefined {
  const listed = id ? files.find((f) => f.id === id) : undefined;
  const [alone, setAlone] = useState<FileDto | null>(null);
  const toRead = id && !listed ? id : null;
  useEffect(() => {
    if (!toRead) return undefined;
    let live = true;
    void fileVerbs.record(toRead).then((r) => {
      if (live) setAlone(r.ok ? r.data.file : null);
    });
    return () => {
      live = false;
    };
  }, [toRead, readAt]);
  return listed ?? (alone?.id === id ? alone : undefined);
}

/** The rest of a shelf: as it comes near, where a browser can say so, and a press for one that can't, or a read that failed. */
function MoreFiles({ more, busy, shown }: { more: () => void; busy: boolean; shown: number }) {
  const mark = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const at = mark.current;
    if (!at || typeof IntersectionObserver === "undefined") return undefined;
    const near = new IntersectionObserver((seen) => {
      if (seen.some((e) => e.isIntersecting)) more();
    }, MORE_NEAR);
    near.observe(at);
    return () => near.disconnect();
    // Watched afresh as what is shown grows, so a tall screen the next page did not fill still reads another.
  }, [more, shown]);
  return (
    <div ref={mark} className="files-more">
      <Button size="sm" variant="quiet" onClick={more} disabled={busy} data-testid="fl-more">
        {W.showMore}
      </Button>
    </div>
  );
}

/** How near the end of a shelf the next page is asked for: a thumb's flick away, so it is there as they arrive. */
const MORE_NEAR: IntersectionObserverInit = { rootMargin: "800px 0px" };

/** The empty tiles an empty page draws, which its stylesheet holds to the one row the grid's width fits. */
const BLANK_TILES = [0, 1, 2, 3, 4, 5];

/** What the head says: how the library stands, or a first batch as it lands, since the tally has none of them until the list is read. */
function headingOf(tally: FilesTally, going: readonly SendingPhoto[], videos: boolean): string {
  if (tally.total > 0) return filesSayOf(tally);
  const arrived = going.filter((p) => p.id);
  if (arrived.length > 0)
    return filesSayOf({
      kept: arrived.length,
      videos: arrived.filter((p) => isVideoFile(p.file)).length,
      waiting: 0,
      looking: 0,
    });
  return videos ? W.video.emptyTitle : W.emptyTitle;
}

/** What the head's Add says: what is dropped, how a run stands, or what it adds. */
const addWordsOf = (dropping: boolean, left: number, finished: number, videos: boolean): string =>
  dropping ? W.dropToAdd : left > 0 ? W.adding(finished + 1, finished + left) : videos ? W.video.add : W.add;

/** The list as the grid draws it: what still stands under a tile of its own left out, and in the Inbox what the look found nothing against first. */
function shownOf(files: readonly FileDto[], shelf: FileShelf, standing: ReadonlySet<string>): readonly FileDto[] {
  const listed = inLandedOrder(files).filter((f) => !standing.has(f.id));
  return shelf === "inbox" ? [...listed.filter(inboxCleanOf), ...listed.filter((f) => !inboxCleanOf(f))] : listed;
}

/** Nothing here yet: what to do, under the empty tiles. A person who can't add a photo is told what the page is for, with nothing dead to press. */
function NothingYet({
  may,
  dropping,
  add,
  videos,
}: {
  may: boolean;
  dropping: boolean;
  add: () => void;
  videos: boolean;
}) {
  return (
    <div className="files-none" data-testid="fl-empty">
      <p className="files-none-says">{videos ? W.video.emptyBody : W.emptyBody}</p>
      {may && (
        <span className="files-none-acts">
          <Button size="sm" variant="primary" onClick={add} data-testid="fl-empty-add">
            {dropping ? W.dropToAdd : videos ? W.video.add : W.add}
          </Button>
          <span className="files-or-drop">{W.orDrop}</span>
        </span>
      )}
    </div>
  );
}

/**
 * Where the library is drawn: a card of Settings, with a sheet of its own for an open file, or Campaigns › Content's library
 * (its stage 2), in Content's own pane, where a file opens in Content's viewer (`setOpenId` is Content's) and no sheet is drawn.
 */
interface LibraryPlace {
  className: string;
  testid: string;
  sheet: boolean;
}
const LIBRARY_IN_SETTINGS: LibraryPlace = {
  className: "rec-card set-card files-page",
  testid: "rec-card-files",
  sheet: true,
};
const LIBRARY_IN_CONTENT: LibraryPlace = { className: "files-page cnv-library", testid: "cnv-library", sheet: false };

/** What the library is drawn from, and where. */
interface FilesLibraryProps {
  dto: FilesPageDto;
  readAt: number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  flash: (f: FrameFlash) => void;
  place?: LibraryPlace;
}

/** The library as it stands, and what can be done to it. The shelf's read and what a press changes stand on what the page was last told. */
function FilesLibrary({ dto, readAt, openId, setOpenId, flash, place = LIBRARY_IN_SETTINGS }: FilesLibraryProps) {
  const { files, shelf, next, tally } = dto;
  const sending = useSending();
  const going = sending.photos;
  // A shelf pressed, until its read is in: what it holds stands until then, and the press answers at once.
  const [pressed, setPressed] = useState<FileShelf | null>(null);
  const [gettingMore, setGettingMore] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const open = useFileOpen(openId, files, readAt);
  // A shelf answers its press with a short fade of the grid where it stands, as every list that changes under one view does.
  const grid = useSwapMotion(shelf);
  // Once a first photo or a batch has changed what the card holds, it goes to each new height rather than jumping there. A long library,
  // which only a shelf's press resizes, is left to stand.
  const glide = useHeightGlide();
  const [glides, setGlides] = useState(false);
  if (!glides && (tally.total === 0 || going.length > 0)) setGlides(true);
  // The shelves come with the first read that holds a photo: where this visit saw that, they open, and the grid goes down with them.
  const [startedEmpty] = useState(tally.total === 0);
  const shelvesOpen = useRowOpens(startedEmpty);
  const videos = useVideosTaken();
  const heading = headingOf(tally, going, videos);
  const headingFades = useSwapMotion<HTMLHeadingElement>(heading);
  const may = canDo("settings");
  const mayAdd = canDo("add_files");
  const here = pressed ?? shelf;
  const choose = (s: FileShelf) => {
    setPressed(s);
    void showFilesShelf(s)
      .catch(() => flash({ tone: "danger", msg: <>{W.failedRead}</> }))
      .finally(() => setPressed((was) => (was === s ? null : was)));
  };
  const addAll = (list: File[]) => {
    if (!list.length) return;
    // A photo added is a kept one: they land on the shelf that shows them, never one they would leave as the list is read.
    if (here !== "all") choose("all");
    addPhotos(list, flash);
  };
  const dropping = usePageTakesFiles(addAll, mayAdd);
  const more = useCallback(() => {
    if (gettingMore) return;
    setGettingMore(true);
    void showMoreFiles()
      .catch(() => flash({ tone: "danger", msg: <>{W.failedRead}</> }))
      .finally(() => setGettingMore(false));
  }, [flash, gettingMore]);
  const left = going.filter(stillGoing).length;
  // What has arrived stands where it is, under the tile it has, until the list has taken them all over.
  const standing = new Set(going.flatMap((p) => (p.id ? [p.id] : [])));
  const shown = shownOf(files, shelf, standing);
  // Nothing here yet: the one thing to do stands where the eye is, and not again in the corner.
  const emptyPage = tally.total === 0 && going.length === 0;
  const add = () => picker.current?.click();
  const chosen = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = "";
    addAll(list);
  };
  // The sheet hands focus back to what opened it; if a change took that photo off the grid, focus has nowhere to go.
  const closeSheet = () => {
    setOpenId(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) addRef.current?.focus();
    });
  };
  return (
    <section
      ref={glides ? glide : undefined}
      className={place.className}
      data-testid={place.testid}
      data-glides={glides || undefined}
      data-dropping={dropping || undefined}
    >
      <div className="rec-card-head files-head" data-adding={left > 0 || undefined}>
        <h2 ref={headingFades} className="rec-card-title files-heading">
          {heading}
        </h2>
        {/* Unseen on an empty page, whose one press stands under its tiles, but holding its place: the tiles don't move as it comes. */}
        <span className="files-head-act" data-away={emptyPage || undefined}>
          <Button ref={addRef} size="sm" onClick={add} {...gate("add_files")} data-testid="fl-add">
            {addWordsOf(dropping, left, sending.finished, videos)}
          </Button>
        </span>
      </div>
      <LineFiles
        ref={picker}
        accept={videos ? FILE_PICKS_WITH_VIDEO : FILE_PICKS}
        multiple
        onChange={chosen}
        data-testid="fl-picker"
      />
      {sending.said && (
        <Notice
          label={sending.said}
          fact={sending.said}
          line
          dismiss={{ label: W.close, onDismiss: clearSaid }}
          testid="fl-said"
        />
      )}
      {tally.total > 0 && (
        <div ref={shelvesOpen} className="files-shelves">
          <Segmented
            className="files-shelves-row"
            label={W.title}
            value={here}
            onValueChange={choose}
            options={shelvesOf(tally)}
          />
        </div>
      )}
      {shelf === "inbox" && may && <InboxPress inbox={files} flash={flash} />}
      {tally.total > 0 && shown.length === 0 && going.length === 0 && (
        <p className="files-says files-issues" data-testid="fl-none-filed">
          {W.noneFiled}
        </p>
      )}
      <div className="files-wall">
        <div className="files-blanks" data-on={tally.total === 0 || undefined} aria-hidden="true">
          {BLANK_TILES.map((tile) => (
            <span key={tile} className="files-blank" />
          ))}
        </div>
        {/* A hand reaches for the empty squares. The press below is the same one, for a key and a screen reader. */}
        {emptyPage && mayAdd && <Press className="files-open" tabIndex={-1} aria-hidden="true" onClick={add} />}
        <div ref={grid} className="files-grid" data-testid="fl-grid" aria-busy={pressed !== null || undefined}>
          <PhotosOnTheirWay photos={going} flash={flash} onOpen={setOpenId} />
          {shown.map((f) => (
            <Photo key={f.id} file={f} onOpen={() => setOpenId(f.id)} />
          ))}
        </div>
      </div>
      {next && <MoreFiles more={more} busy={gettingMore} shown={files.length} />}
      {emptyPage && <NothingYet may={mayAdd} dropping={dropping} add={add} videos={videos} />}
      {open && place.sheet && (
        <FileSheet key={open.id} file={open} onClose={closeSheet} open={setOpenId} flash={flash} />
      )}
    </section>
  );
}

export function PaneFiles({ flash }: { flash: (f: FrameFlash) => void }) {
  const held = useSurface("files");
  // A file the address names (`?do=file:<id>`: a reload, a link, Back into it) opens as the page does; one asked for from
  // another page, or while this one stands, opens as the ask lands (file-asked.ts).
  const [openId, setOpenId] = useState<string | null>(() => doAsked("file"));
  useEffect(() => followFileAsked(setOpenId), []);
  if (held === undefined)
    return <EmptyState kind="card" glyph="image" title={W.title} body={W.reading} testid="fl-reading" />;
  if (held === null)
    return (
      <EmptyState
        kind="card"
        glyph="alert"
        tone="warn"
        title={W.title}
        body={W.failedRead}
        action={{ label: W.retry, onClick: () => void refreshSurface("files"), testid: "fl-retry" }}
        testid="fl-unread"
      />
    );
  return <FilesLibrary dto={held.dto} readAt={held.fetchedAt} openId={openId} setOpenId={setOpenId} flash={flash} />;
}

/**
 * Campaigns › Content's library (the content redesign's stage 2): the same library, its adding, its shelves and its inbox, in
 * Content's list pane; a file opens in Content's viewer by its address, and Settings › Files lands here (contracts
 * retiredRouteOf). The page reads it as Settings' did, through the files surface.
 */
export function LibraryInContent({ flash, onOpen }: { flash: (f: FrameFlash) => void; onOpen: (id: string) => void }) {
  const held = useSurface("files");
  if (held === undefined)
    return <EmptyState kind="page" glyph="image" title={W.title} body={W.reading} testid="fl-reading" />;
  if (held === null)
    return (
      <EmptyState
        kind="page"
        glyph="alert"
        tone="warn"
        title={W.title}
        body={W.failedRead}
        action={{ label: W.retry, onClick: () => void refreshSurface("files"), testid: "fl-retry" }}
        testid="fl-unread"
      />
    );
  return (
    <FilesLibrary
      dto={held.dto}
      readAt={held.fetchedAt}
      openId={null}
      setOpenId={(id) => {
        if (id) onOpen(id);
      }}
      flash={flash}
      place={LIBRARY_IN_CONTENT}
    />
  );
}
