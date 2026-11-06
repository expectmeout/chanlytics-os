/**
 * Settings › Files (decision 0099): every photo the business has, one page, whichever road brought it. A grid a person can
 * scan, shelves that are filters over what each file says it shows, and a sheet for what a person says of one: its name, its
 * shelf, who is in it. Each is looked at once by a small model, so the name and the shelf arrive by themselves; a person's
 * word stays over the model's. What was found for them waits in the Inbox, which the page opens on and one press clears.
 *
 * Settings loads no Base UI popup, so the sheet and the shelf's list are the house's (kit/record/sheet, kit/more-menu): a page
 * that newly imports the kit's pays for it on every tab. A member who may not change a file reads it, with nothing dead to
 * press. The presses are verbs.ts's, which the doors check again; what is on its way is sending.ts's. The words are contracts'
 * (FILE_WORDS), the parts the kit's. This module is the page; photo.tsx its tiles, file-sheet.tsx one file opened.
 */
import { useRef, useState, type ChangeEvent } from "react";
import {
  FILE_SHELVES,
  FILE_WORDS as W,
  filesSayOf,
  inboxCleanOf,
  shelfOf,
  type FileDto,
  type FileShelf,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { EmptyState } from "../kit/empty/empty";
import { LineFiles } from "../kit/line/line";
import { Notice } from "../kit/notice/notice";
import { Segmented } from "../kit/segmented/segmented";
import { doAsked } from "../kit/sheet/back";
import { canDo, gate, refreshSurface, type LegacyFlash } from "../legacy-verbs";
import { useSurface } from "../use-surface";
import { FileSheet } from "./file-sheet";
import { InboxPress } from "./inbox-press";
import { Photo, PhotosOnTheirWay } from "./photo";
import { addPhotos, clearSaid, useSending } from "./sending";
import { FILE_PICKS } from "./verbs";
import "./files.css";

/** The shelves drawn: Kept first, then each that holds something, with how many. */
function shelvesOf(files: readonly FileDto[]) {
  const counts = new Map<string, number>();
  for (const f of files) counts.set(shelfOf(f), (counts.get(shelfOf(f)) ?? 0) + 1);
  return FILE_SHELVES.filter((s) => s === "all" || counts.has(s)).map((s) => ({
    value: s,
    label: s === "all" ? W.shelves[s] : `${W.shelves[s]} ${counts.get(s) ?? 0}`,
    testid: `fl-shelf-${s}`,
  }));
}

export function PaneFiles({ flash }: { flash: (f: LegacyFlash) => void }) {
  const held = useSurface("files");
  const sending = useSending();
  // None chosen yet: the page opens where there is something to see.
  const [shelf, setShelf] = useState<FileShelf | null>(null);
  // A photo the address names (`?do=file:<id>`: a reload, a link, Back into it) opens as the page does, once.
  const [openId, setOpenId] = useState<string | null>(() => doAsked("file"));
  const picker = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);

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

  const { files } = held.dto;
  const may = canDo("settings");
  const shelves = shelvesOf(files);
  const inbox = files.filter((f) => f.status === "inbox");
  const anyFiled = files.some((f) => f.status === "filed");
  // A shelf left empty by a change falls back, and so does a first visit: the Inbox while anything waits on a person who can
  // answer it, else Kept where something is, else the first that holds.
  const opensOn: FileShelf = may && inbox.length > 0 ? "inbox" : anyFiled ? "all" : (shelves[1]?.value ?? "all");
  const here: FileShelf = shelf && shelves.some((t) => t.value === shelf) ? shelf : opensOn;
  // Kept holds what is in use: what waits, and what was set aside, stand on their own shelves.
  const onShelf = files.filter((f) => (here === "all" ? f.status === "filed" : shelfOf(f) === here));
  // In the Inbox what the look found nothing against comes first, and what is left for a person to open comes after it.
  const shown =
    here === "inbox" ? [...onShelf.filter(inboxCleanOf), ...onShelf.filter((f) => !inboxCleanOf(f))] : onShelf;
  const open = openId ? files.find((f) => f.id === openId) : undefined;
  const going = sending.photos;
  const left = going.filter((p) => p.state !== "failed").length;
  // Nothing here yet: the one thing to do stands where the eye is, and not again in the corner.
  const emptyPage = files.length === 0 && going.length === 0;
  const add = () => picker.current?.click();

  const chosen = (e: ChangeEvent<HTMLInputElement>) => {
    const list = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = "";
    if (list.length) addPhotos(list, flash);
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
      <div className="rec-card-head files-head">
        <h2 className="rec-card-title">{files.length > 0 ? filesSayOf(files) : W.title}</h2>
        {!emptyPage && (
          <span className="files-head-act">
            <Button ref={addRef} size="sm" onClick={add} {...gate("settings", "add a photo")} data-testid="fl-add">
              {left > 0 ? W.adding(sending.finished, sending.finished + left) : W.add}
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
          {files.length > 0 && (
            <div className="files-shelves">
              <Segmented
                className="files-shelves-row"
                label={W.title}
                value={here}
                onValueChange={setShelf}
                options={shelves}
              />
            </div>
          )}
          {here === "inbox" && may && <InboxPress inbox={inbox} flash={flash} />}
          {shown.length === 0 && going.length === 0 && (
            <p className="files-says files-issues" data-testid="fl-none-filed">
              {W.noneFiled}
            </p>
          )}
          <div className="files-grid" data-testid="fl-grid">
            <PhotosOnTheirWay photos={going} flash={flash} />
            {shown.map((f) => (
              <Photo key={f.id} file={f} onOpen={() => setOpenId(f.id)} />
            ))}
          </div>
        </>
      )}
      {open && <FileSheet key={open.id} file={open} onClose={closeSheet} flash={flash} />}
    </section>
  );
}
