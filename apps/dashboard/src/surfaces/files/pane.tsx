/**
 * Campaigns › Content's Library (decision 0099; Settings › Files lands here): every photo the business has, one page,
 * whichever road brought it. A grid a person can scan, shelves that are filters over what each file says it shows, and a file
 * opened in Content's viewer, where its name, its shelf and its posts are (one sheet for a post: Post it). Each is looked at
 * once by a small model, so the name and the shelf arrive by themselves; a person's word stays over the model's. What was found
 * online waits for a look, which one press clears. A shelf comes a page at a time, and the server says how the whole library
 * stands (surface.ts).
 *
 * Whoever may add a photo or a video adds them, an operator too; a member who may not change a file reads it, with nothing
 * dead to press. The presses are verbs.ts's, which the doors check again; what is on its way is sending.ts's. The words are
 * contracts' (FILE_WORDS), the parts the kit's. This module is the library; photo.tsx its tiles.
 *
 * With nothing here the page is the grid with nothing in it: empty tiles at the size a photo draws, what to do under them, and the first
 * photos land in those same squares, so nothing jumps. A desk can bring photos to the whole page, by dragging or pasting them, as well as
 * pick them (kit/drop).
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from "react";
import {
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
import { useHeightGlide } from "../kit/motion/use-height-glide";
import { useRowOpens } from "../kit/motion/use-row-opens";
import { useSwapMotion } from "../kit/motion/use-swap-motion";
import { canDo, gate, refreshSurface, type FrameFlash } from "../frame-verbs";
import { useSurface } from "../use-surface";
import { InboxPress } from "./inbox-press";
import { ALL_FILES, FindLine, KindTabs, SetAsideLine, ShelfHead, WaitingLine } from "./library-views";
import { Photo, PhotosOnTheirWay } from "./photo";
import { addPhotos, clearSaid, inLandedOrder, isVideoFile, stillGoing, useSending, type SendingPhoto } from "./sending";
import { showFiles, showMoreFiles, type FilesView } from "./surface";
import { FILE_PICKS, FILE_PICKS_WITH_VIDEO } from "./verbs";
import "./files.css";

/**
 * Whether the workspace takes videos (`features.video_preview`, contracts videoPreviewOf: Ruben's to set per workspace while
 * stage B is tried), read off the settings surface Settings opens on, so it draws again when that read lands.
 */
function useVideosTaken(): boolean {
  const settings = useSurface("settings");
  return videoPreviewOf(settings?.settings?.config);
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

/**
 * What the head says, where it says anything: a first batch as it lands, since the tally has none of them until the list is read,
 * or what an empty page is for. Once files are here nothing: the tabs count them, and what waits says so itself (Ruben, 12 Nov
 * 2026: the count stood over the tabs that said it, and what waited was said three times).
 */
function headingOf(tally: FilesTally, going: readonly SendingPhoto[], videos: boolean): string | null {
  if (tally.total > 0) return null;
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

/** Where the library is drawn: Campaigns › Content's library, in Content's own pane, where a file opens in Content's viewer. */
interface LibraryPlace {
  className: string;
  testid: string;
  /**
   * Where its Add stands: its own head's, or the page's (Content's coral act follows the list it shows: Make on Made, Add on
   * the Library; the content canvas, board Home), which the library hands its adding (`onAdder`).
   */
  addInPageHead: boolean;
  /**
   * Where All, Photos and Videos, the search and the amber line of what waits stand: under its own head, or the page's, as
   * Made's do (Content: the bar, and under it).
   */
  viewsInPage: boolean;
}
const LIBRARY_IN_CONTENT: LibraryPlace = {
  className: "files-page cnv-library",
  testid: "cnv-library",
  addInPageHead: true,
  viewsInPage: true,
};

/** What the library is drawn from, and where. */
interface FilesLibraryProps {
  dto: FilesPageDto;
  setOpenId: (id: string | null) => void;
  flash: (f: FrameFlash) => void;
  place?: LibraryPlace;
  /** Where the page's head draws the Add: handed the press that opens the picker, or null where this person may not add. */
  onAdder?: (add: (() => void) | null) => void;
  /**
   * The files as rows, where the page that holds the library chose a list (Content's List, its rows as Made's are): null, the
   * grid. Nothing kept yet is the grid all the same, its empty squares where the first photos land.
   */
  rows?: ((files: readonly FileDto[], open: (id: string) => void) => ReactNode) | null;
}

/** The library's head: its heading where it says one, and its Add where the page's head does not hold it. */
function LibraryHead(p: {
  heading: string | null;
  headingFades: Ref<HTMLHeadingElement>;
  place: LibraryPlace;
  left: number;
  emptyPage: boolean;
  add: () => void;
  addRef: Ref<HTMLButtonElement>;
  addWords: string;
}) {
  if (p.heading === null && p.place.addInPageHead) return null;
  return (
    <div className="rec-card-head files-head" data-adding={p.left > 0 || undefined}>
      {p.heading === null ? null : (
        <h2 ref={p.headingFades} className="rec-card-title files-heading">
          {p.heading}
        </h2>
      )}
      {/* Unseen on an empty page, whose one press stands under its tiles, but holding its place: the tiles don't move as it comes.
          None where the page's head holds the Add. */}
      {p.place.addInPageHead ? null : (
        <span className="files-head-act" data-away={p.emptyPage || undefined}>
          <Button ref={p.addRef} size="sm" onClick={p.add} {...gate("add_files")} data-testid="fl-add">
            {p.addWords}
          </Button>
        </span>
      )}
    </div>
  );
}

/**
 * The library's views: the shelf it is on, and over all of it its kinds and its find line where no bar of the page holds
 * them; under them the line to what waits, and the inbox's press.
 */
function LibraryViews(p: {
  dto: FilesPageDto;
  here: FilesView;
  go: (view: FilesView) => void;
  place: LibraryPlace;
  may: boolean;
  opens: (row: HTMLElement | null) => void;
  flash: (f: FrameFlash) => void;
}) {
  const { tally, shelf, files } = p.dto;
  // Over all of it, and where the page draws no bar of its own (Content's), the kinds and the find line are the library's.
  const own = !p.place.viewsInPage && p.here.shelf === "all";
  return (
    <>
      {tally.total > 0 && (
        <div ref={p.opens} className="files-views">
          <ShelfHead view={p.here} tally={tally} go={p.go} />
          {own ? (
            <>
              <KindTabs tally={tally} view={p.here} go={p.go} />
              <FindLine view={p.here} go={p.go} />
            </>
          ) : null}
        </div>
      )}
      {own && !p.here.about && tally.waiting > 0 && p.may && <WaitingLine n={tally.waiting} go={p.go} />}
      {shelf === "inbox" && p.may && <InboxPress inbox={files} flash={p.flash} />}
    </>
  );
}

/** The files: as rows where the page chose a list, else the grid over its blank squares. */
function LibraryWall(p: {
  rows: FilesLibraryProps["rows"];
  total: number;
  going: readonly SendingPhoto[];
  shown: readonly FileDto[];
  grid: Ref<HTMLDivElement>;
  busy: boolean;
  /** The empty squares' own press, where nothing is kept yet and this person may add. */
  firstAdd: (() => void) | null;
  flash: (f: FrameFlash) => void;
  setOpenId: (id: string | null) => void;
}) {
  const { rows, going, flash, setOpenId } = p;
  if (rows && p.total > 0)
    return (
      <div ref={p.grid} aria-busy={p.busy || undefined}>
        {going.length > 0 ? (
          <div className="files-grid">
            <PhotosOnTheirWay photos={going} flash={flash} onOpen={setOpenId} />
          </div>
        ) : null}
        {rows(p.shown, setOpenId)}
      </div>
    );
  return (
    <div className="files-wall">
      <div className="files-blanks" data-on={p.total === 0 || undefined} aria-hidden="true">
        {BLANK_TILES.map((tile) => (
          <span key={tile} className="files-blank" />
        ))}
      </div>
      {/* A hand reaches for the empty squares. The press below is the same one, for a key and a screen reader. */}
      {p.firstAdd && <Press className="files-open" tabIndex={-1} aria-hidden="true" onClick={p.firstAdd} />}
      <div ref={p.grid} className="files-grid" data-testid="fl-grid" aria-busy={p.busy || undefined}>
        <PhotosOnTheirWay photos={going} flash={flash} onOpen={setOpenId} />
        {p.shown.map((f) => (
          <Photo key={f.id} file={f} onOpen={() => setOpenId(f.id)} />
        ))}
      </div>
    </div>
  );
}

/** Under the files: the next page of them, and once all of it is read, the line to what was set aside. */
function LibraryFoot(p: { dto: FilesPageDto; more: () => void; gettingMore: boolean; go: (view: FilesView) => void }) {
  const { next, shelf, tally, files, kind, about } = p.dto;
  const setAside = tally.shelves.set_aside ?? 0;
  return (
    <>
      {next && <MoreFiles more={p.more} busy={p.gettingMore} shown={files.length} />}
      {!next && shelf === "all" && !kind && !about && setAside > 0 && <SetAsideLine n={setAside} go={p.go} />}
    </>
  );
}

/** The library as it stands, and what can be done to it. The shelf's read and what a press changes stand on what the page was last told. */
function FilesLibrary(props: FilesLibraryProps) {
  const { dto, setOpenId, flash, place = LIBRARY_IN_CONTENT, onAdder, rows = null } = props;
  const { files, shelf, tally } = dto;
  const view: FilesView = { shelf, kind: dto.kind, about: dto.about };
  const sending = useSending();
  const going = sending.photos;
  // A view pressed, until its read is in: what it holds stands until then, and the press answers at once.
  const [pressed, setPressed] = useState<FilesView | null>(null);
  const [gettingMore, setGettingMore] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  // A shelf answers its press with a short fade of the grid where it stands, as every list that changes under one view does.
  const grid = useSwapMotion(`${shelf}|${dto.kind ?? ""}|${dto.about ?? ""}`);
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
  const here = pressed ?? view;
  const go = (next: FilesView) => {
    setPressed(next);
    void showFiles(next)
      .catch(() => flash({ tone: "danger", msg: <>{W.failedRead}</> }))
      .finally(() => setPressed((was) => (was === next ? null : was)));
  };
  const addAll = (list: File[]) => {
    if (!list.length) return;
    // A photo added is a kept one: they land where all of it shows, never a view they would leave as the list is read.
    if (here.shelf !== "all" || here.kind || here.about) go(ALL_FILES);
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
  const add = useCallback(() => picker.current?.click(), []);
  // The page's head holds the Add where the library stands in Content: handed the press, and taken back as it goes.
  useEffect(() => {
    if (!onAdder) return undefined;
    onAdder(mayAdd ? add : null);
    return () => onAdder(null);
  }, [onAdder, mayAdd, add]);
  const chosen = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = "";
    addAll(list);
  };
  return (
    <section
      ref={glides ? glide : undefined}
      className={place.className}
      data-testid={place.testid}
      data-glides={glides || undefined}
      data-dropping={dropping || undefined}
    >
      <LibraryHead
        heading={heading}
        headingFades={headingFades}
        place={place}
        left={left}
        emptyPage={emptyPage}
        add={add}
        addRef={addRef}
        addWords={addWordsOf(dropping, left, sending.finished, videos)}
      />
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
      <LibraryViews dto={dto} here={here} go={go} place={place} may={may} opens={shelvesOpen} flash={flash} />
      {dto.about && shown.length === 0 && going.length === 0 && (
        <p className="files-says files-issues" data-testid="fl-none-found">
          {W.foundNone(dto.about)}
        </p>
      )}
      <LibraryWall
        rows={rows}
        total={tally.total}
        going={going}
        shown={shown}
        grid={grid}
        busy={pressed !== null}
        firstAdd={emptyPage && mayAdd ? add : null}
        flash={flash}
        setOpenId={setOpenId}
      />
      <LibraryFoot dto={dto} more={more} gettingMore={gettingMore} go={go} />
      {emptyPage && <NothingYet may={mayAdd} dropping={dropping} add={add} videos={videos} />}
    </section>
  );
}

/**
 * Campaigns › Content's library (the content redesign's stage 2): the same library, its adding, its shelves and its inbox, in
 * Content's list pane; a file opens in Content's viewer by its address, and Settings › Files lands here (contracts
 * retiredRouteOf). The page reads it as Settings' did, through the files surface.
 */
export function LibraryInContent({
  flash,
  onOpen,
  onAdder,
  rows,
}: {
  flash: (f: FrameFlash) => void;
  onOpen: (id: string) => void;
  onAdder: (add: (() => void) | null) => void;
  rows: FilesLibraryProps["rows"];
}) {
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
      setOpenId={(id) => {
        if (id) onOpen(id);
      }}
      flash={flash}
      place={LIBRARY_IN_CONTENT}
      onAdder={onAdder}
      rows={rows}
    />
  );
}
