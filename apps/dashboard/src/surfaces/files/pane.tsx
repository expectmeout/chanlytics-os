/**
 * Settings › Files (decision 0099): every photo the business has, one page, whichever road brought it. A grid a person can
 * scan, shelves that are filters over what each file says it shows, and a sheet for what a person says of one: its name, its
 * shelf, who is in it. Each is looked at once by a small model, so the name and the shelf arrive by themselves; a person's
 * word stays over the model's. What was found for them waits in the Inbox, which the page opens on and one press clears. A shelf
 * comes a page at a time, and the server says how the whole library stands (surface.ts).
 *
 * Settings loads no Base UI popup, so the sheet and the shelf's list are the house's (kit/record/sheet, kit/more-menu): a page
 * that newly imports the kit's pays for it on every tab. A member who may not change a file reads it, with nothing dead to
 * press. The presses are verbs.ts's, which the doors check again; what is on its way is sending.ts's. The words are contracts'
 * (FILE_WORDS), the parts the kit's. This module is the page; photo.tsx its tiles, file-sheet.tsx one file opened.
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  FILE_SHELVES,
  FILE_WORDS as W,
  filesSayOf,
  inboxCleanOf,
  type FileDto,
  type FileShelf,
  type FilesTally,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { EmptyState } from "../kit/empty/empty";
import { LineFiles } from "../kit/line/line";
import { Notice } from "../kit/notice/notice";
import { Segmented } from "../kit/segmented/segmented";
import { useSwapMotion } from "../kit/motion/use-swap-motion";
import { doAsked } from "../kit/sheet/back";
import { canDo, gate, refreshSurface, type FrameFlash } from "../frame-verbs";
import { useSurface } from "../use-surface";
import { hearFileAsked } from "./file-asked";
import { FileSheet } from "./file-sheet";
import { InboxPress } from "./inbox-press";
import { Photo, PhotosOnTheirWay } from "./photo";
import { addPhotos, clearSaid, inLandedOrder, stillGoing, useSending } from "./sending";
import { showFilesShelf, showMoreFiles } from "./surface";
import { FILE_PICKS, fileVerbs } from "./verbs";
import "./files.css";

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

export function PaneFiles({ flash }: { flash: (f: FrameFlash) => void }) {
  const held = useSurface("files");
  const sending = useSending();
  // A shelf pressed, until its read is in: what it holds stands until then, and the press answers at once.
  const [pressed, setPressed] = useState<FileShelf | null>(null);
  const [gettingMore, setGettingMore] = useState(false);
  // A photo the address names (`?do=file:<id>`: a reload, a link, Back into it) opens as the page does, once.
  const [openId, setOpenId] = useState<string | null>(() => doAsked("file"));
  const picker = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => hearFileAsked(setOpenId), []);
  const open = useFileOpen(openId, held?.dto.files ?? [], held?.fetchedAt ?? 0);
  // A shelf answers its press with a short fade of the grid where it stands, as every list that changes under one view does.
  const grid = useSwapMotion(held?.dto.shelf ?? "");
  const more = useCallback(() => {
    if (gettingMore) return;
    setGettingMore(true);
    void showMoreFiles()
      .catch(() => flash({ tone: "danger", msg: <>{W.failedRead}</> }))
      .finally(() => setGettingMore(false));
  }, [flash, gettingMore]);

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

  const { files, shelf, next, tally } = held.dto;
  const may = canDo("settings");
  const here = pressed ?? shelf;
  const choose = (s: FileShelf) => {
    setPressed(s);
    void showFilesShelf(s)
      .catch(() => flash({ tone: "danger", msg: <>{W.failedRead}</> }))
      .finally(() => setPressed((was) => (was === s ? null : was)));
  };
  const going = sending.photos;
  const left = going.filter(stillGoing).length;
  // What has arrived stands where it is, under the tile it has, until the list has taken them all over.
  const standing = new Set(going.flatMap((p) => (p.id ? [p.id] : [])));
  const listed = inLandedOrder(files).filter((f) => !standing.has(f.id));
  // In the Inbox what the look found nothing against comes first, and what is left for a person to open comes after it.
  const shown =
    shelf === "inbox" ? [...listed.filter(inboxCleanOf), ...listed.filter((f) => !inboxCleanOf(f))] : listed;
  // A first batch says what it has come to as it lands: the tally has none of them until the list is read, at its end.
  const heading =
    tally.total > 0
      ? filesSayOf(tally)
      : standing.size > 0
        ? filesSayOf({ kept: standing.size, waiting: 0, looking: 0 })
        : W.title;
  // Nothing here yet: the one thing to do stands where the eye is, and not again in the corner.
  const emptyPage = tally.total === 0 && going.length === 0;
  const add = () => picker.current?.click();

  const chosen = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = "";
    if (!list.length) return;
    // A photo added is a kept one: they land on the shelf that shows them, never one they would leave as the list is read.
    if (here !== "all") choose("all");
    addPhotos(list, flash);
  };
  // The sheet hands focus back to what opened it; if a change took that photo off the grid, focus has nowhere to go.
  const closeSheet = () => {
    setOpenId(null);
    requestAnimationFrame(() => {
      if (document.activeElement === document.body) addRef.current?.focus();
    });
  };
  return (
    <section className="rec-card set-card files-page" data-testid="rec-card-files">
      <div className="rec-card-head files-head" data-adding={left > 0 || undefined}>
        <h2 className="rec-card-title">{heading}</h2>
        {!emptyPage && (
          <span className="files-head-act">
            <Button ref={addRef} size="sm" onClick={add} {...gate("settings", "add a photo")} data-testid="fl-add">
              {left > 0 ? W.adding(sending.finished + 1, sending.finished + left) : W.add}
            </Button>
          </span>
        )}
      </div>
      <LineFiles ref={picker} accept={FILE_PICKS} multiple onChange={chosen} data-testid="fl-picker" />
      {sending.said && (
        <Notice
          label={sending.said}
          fact={sending.said}
          line
          dismiss={{ label: W.close, onDismiss: clearSaid }}
          testid="fl-said"
        />
      )}
      {emptyPage ? (
        <EmptyState
          kind="line"
          glyph="image"
          title={W.emptyTitle}
          body={W.emptyBody}
          action={may ? { label: W.add, onClick: add, testid: "fl-empty-add" } : null}
          testid="fl-empty"
        />
      ) : (
        <>
          {tally.total > 0 && (
            <div className="files-shelves">
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
          {shown.length === 0 && going.length === 0 && (
            <p className="files-says files-issues" data-testid="fl-none-filed">
              {W.noneFiled}
            </p>
          )}
          <div ref={grid} className="files-grid" data-testid="fl-grid" aria-busy={pressed !== null || undefined}>
            <PhotosOnTheirWay photos={going} flash={flash} onOpen={setOpenId} />
            {shown.map((f) => (
              <Photo key={f.id} file={f} onOpen={() => setOpenId(f.id)} />
            ))}
          </div>
          {next && <MoreFiles more={more} busy={gettingMore} shown={files.length} />}
        </>
      )}
      {open && <FileSheet key={open.id} file={open} onClose={closeSheet} open={setOpenId} flash={flash} />}
    </section>
  );
}
