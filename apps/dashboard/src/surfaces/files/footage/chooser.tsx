/**
 * The folder chooser (the footage sources plan, P5; the canvas's board "The folder chooser"): the kit's sheet, one
 * level at a time, folders only. It starts at the three places a Google account keeps folders (its own Drive, its
 * shared drives, what others shared with it) and loads only the levels a person opens: no file is listed, and nothing
 * looks through a whole Drive. Opening a folder is the only gesture. The one press at the foot always names the folder
 * it would watch, and waits until a folder is open, so a whole Drive is never watched.
 *
 * Choosing closes it with the folder; watching is the next step's (watch-confirm.tsx), where the owner says whether
 * the folders inside count. A name is never cut to three dots here: it wraps, and the press says it whole.
 */
import { useCallback, useEffect, useState } from "react";
import { FOOTAGE_SETUP as W } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { ListRow } from "../../kit/list-row/list-row";
import { Sheet } from "../../kit/sheet/sheet";
import "./footage.css";

/** A folder a person may choose. */
export interface FolderChoice {
  id: string;
  name: string;
}

/** One level the chooser stands in: one of the three places, or a folder opened. */
type Level = { place: "mine" | "drives" | "shared"; name: string } | { place: "folder"; id: string; name: string };

/** What a level holds, as it was read: its folders and the page after them, or why it could not be read. */
type Read =
  | { state: "loading" }
  | { state: "read"; folders: FolderChoice[]; next: string | null; more: boolean }
  | { state: "shut" }
  | { state: "failed" };

const DRIVE_PLACES: readonly Level[] = [
  { place: "mine", name: W.chooser.places.mine },
  { place: "drives", name: W.chooser.places.drives },
  { place: "shared", name: W.chooser.places.shared },
];

/** One level's folders, read a page at a time. `page` is the page after what is held; null reads the first. */
async function readLevel(level: Level, page: string | null): Promise<Read> {
  const answer = await api()("GET sources/folders", {
    query: {
      place: level.place,
      ...(level.place === "folder" ? { folder_id: level.id } : {}),
      ...(page ? { page } : {}),
    },
  }).catch(() => null);
  if (answer === null) return { state: "failed" };
  if (!answer.ok) return { state: answer.code === "forbidden" ? "shut" : "failed" };
  return { state: "read", folders: answer.data.folders, next: answer.data.next_page, more: false };
}

/** A folder's row: its name whole, and that it opens. */
function FolderRow({ name, onOpen, testid }: { name: string; onOpen: () => void; testid: string }) {
  return (
    <ListRow
      className="fo-folder"
      mark={<Icon name="folder" size={15} />}
      name={name}
      end={(place) => (
        <span className={place} aria-hidden="true">
          <Icon name="chevron" size={11} />
        </span>
      )}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      data-testid={testid}
    />
  );
}

/** What a level says where it lists no folders: nothing inside, shut to this account, or Google gave no answer. */
function LevelSays({ head, body, again }: { head: string; body: string; again?: () => void }) {
  return (
    <div className="fo-says" data-testid="fo-chooser-says">
      <b>{head}</b>
      <p>{body}</p>
      {again ? (
        <Button size="sm" onClick={again} data-testid="fo-chooser-again">
          {W.chooser.failed.again}
        </Button>
      ) : null}
    </div>
  );
}

interface ChooserProps {
  open: boolean;
  /** The account the folders are read through, said under the title. */
  email: string | null;
  onClose: () => void;
  onChoose: (folder: FolderChoice) => void;
}

/** Where the chooser stands: the levels opened, outermost first (none is the three places), and the open one's read. */
function useLevels(open: boolean) {
  const [path, setPath] = useState<Level[]>([]);
  const [read, setRead] = useState<Read>({ state: "loading" });
  const here = path[path.length - 1] ?? null;

  const load = useCallback(() => {
    if (!here) return undefined;
    let live = true;
    setRead({ state: "loading" });
    void readLevel(here, null).then((next) => {
      if (live) setRead(next);
    });
    return () => {
      live = false;
    };
  }, [here]);

  useEffect(() => (open ? load() : undefined), [open, load]);
  // Opened again, it starts where it always starts.
  useEffect(() => {
    if (!open) setPath([]);
  }, [open]);

  const more = async () => {
    if (!here || read.state !== "read" || !read.next) return;
    setRead({ ...read, more: true });
    const next = await readLevel(here, read.next);
    setRead(
      next.state === "read"
        ? { state: "read", folders: [...read.folders, ...next.folders], next: next.next, more: false }
        : { ...read, more: false },
    );
  };

  return { path, setPath, read, here, load, more };
}

interface LevelProps {
  /** The open level; null at the three places. */
  here: Level | null;
  read: Read;
  email: string | null;
  onOpen: (level: Level) => void;
  onAgain: () => void;
  onMore: () => void;
}

/** The open level: the three places, its folders, or what it says where it lists none. */
function LevelBody({ here, read, email, onOpen, onAgain, onMore }: LevelProps) {
  if (!here)
    return DRIVE_PLACES.map((level) => (
      <FolderRow
        key={level.place}
        name={level.name}
        onOpen={() => onOpen(level)}
        testid={`fo-chooser-${level.place}`}
      />
    ));
  if (read.state === "loading")
    return (
      <div className="fo-outline" aria-busy="true" data-testid="fo-chooser-loading">
        <span />
        <span />
        <span />
      </div>
    );
  if (read.state === "failed") return <LevelSays {...W.chooser.failed} again={onAgain} />;
  if (read.state === "shut") return <LevelSays {...W.chooser.cantOpen(here.name, email)} />;
  // One of the three places with nothing in it says nothing; a folder with no folders inside says its files still count.
  if (read.folders.length === 0) return here.place === "folder" ? <LevelSays {...W.chooser.empty(here.name)} /> : null;
  return (
    <>
      {read.folders.map((folder) => (
        <FolderRow
          key={folder.id}
          name={folder.name}
          onOpen={() => onOpen({ place: "folder", id: folder.id, name: folder.name })}
          testid="fo-chooser-folder"
        />
      ))}
      {read.next ? (
        <LinkButton onClick={onMore} disabled={read.more} data-testid="fo-chooser-more">
          {W.chooser.more}
        </LinkButton>
      ) : null}
    </>
  );
}

/** Under the list: what the press would watch, or what to do first; and the press. */
function ChooserFoot({
  chosen,
  read,
  onChoose,
}: {
  /** The folder the press would watch: the one open, where it is a folder and not one of the three places. */
  chosen: FolderChoice | null;
  read: Read;
  onChoose: (folder: FolderChoice) => void;
}) {
  const loading = read.state === "loading";
  const ready = chosen !== null && read.state !== "shut";
  const inside = read.state === "read" && !read.next ? read.folders.length : null;
  return (
    <div className="fo-foot">
      {ready && !loading ? (
        <p data-testid="fo-chooser-holds">
          <b>{chosen.name}</b>
          {W.chooser.holds(inside)}
        </p>
      ) : (
        <p data-testid="fo-chooser-note">{ready ? W.chooser.loading : W.chooser.open}</p>
      )}
      <div data-foot-pair="">
        <Button
          variant="primary"
          disabled={!ready || loading}
          onClick={() => chosen && onChoose(chosen)}
          data-testid="fo-chooser-watch"
        >
          {ready ? W.chooser.watch(chosen.name) : W.chooser.watchThis}
        </Button>
      </div>
    </div>
  );
}

export function FolderChooser({ open, email, onClose, onChoose }: ChooserProps) {
  const { path, setPath, read, here, load, more } = useLevels(open);
  const chosen = here?.place === "folder" ? { id: here.id, name: here.name } : null;
  const parent = path[path.length - 2] ?? null;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={here ? here.name : W.chooser.title}
      sub={W.chooser.sub(email)}
      close={{ label: W.chooser.close, glyph: <Icon name="x" size={13} /> }}
      foot={<ChooserFoot chosen={chosen} read={read} onChoose={onChoose} />}
      flatFoot
      fit
      testid="fo-chooser"
    >
      <div className="fo-chooser">
        {here ? (
          <LinkButton className="fo-crumb" onClick={() => setPath(path.slice(0, -1))} data-testid="fo-chooser-back">
            <Icon name="chevron" size={11} /> {parent ? parent.name : W.chooser.title}
          </LinkButton>
        ) : null}
        <LevelBody
          here={here}
          read={read}
          email={email}
          onOpen={(level) => setPath([...path, level])}
          onAgain={() => void load()}
          onMore={() => void more()}
        />
      </div>
    </Sheet>
  );
}
