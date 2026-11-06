/**
 * Settings › Files (decision 0099): every photo the business has, one page, whichever road brought it. A grid a person can
 * scan, shelves that are filters over what each file says it shows, and a sheet for what a person says of one: its name, its
 * shelf, who is in it. Each is looked at once by a small model, so the name and the shelf arrive by themselves; a person's
 * word stays over the model's. What was found for them waits in the Inbox, which the page opens on and one press clears.
 *
 * Settings loads no Base UI popup, so the sheet and the shelf's list are the house's (kit/record/sheet, kit/more-menu): a page
 * that newly imports the kit's pays for it on every tab. A member who may not change a file reads it, with nothing dead to
 * press. The presses are verbs.ts's, which the doors check again; what is on its way is sending.ts's. The words are contracts'
 * (FILE_WORDS), the parts the kit's.
 */
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import {
  FILE_NAME_MAX,
  FILE_SHELVES,
  FILE_SHOWS,
  FILE_WORDS as W,
  fileNameOf,
  fileSaidOf,
  fileViewOf,
  POST_SHAPES,
  POST_WORDS,
  filesSayOf,
  inboxCleanOf,
  shelfOf,
  whoStandsOf,
  type FileDto,
  type FileShelf,
  type FileShows,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { EmptyState } from "../../kit/empty/empty";
import { Field, fieldProblem } from "../../kit/field/field";
import { MoreMenu } from "../../kit/more-menu/more-menu";
import { Notice } from "../../kit/notice/notice";
import { Press } from "../../kit/press";
import { RecordSheet } from "../../kit/record/sheet";
import { Segmented } from "../../kit/segmented/segmented";
import { afterSheetCloses, doAsked } from "../../kit/sheet/back";
import { askAbout, canDo, gate, gateTitle, refreshSurface, type LegacyFlash } from "../../legacy-verbs";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { addPhotos, clearSaid, takeAway, tryAgain, tryAll, useSending, type SendingPhoto } from "./sending";
import { FILE_PICKS, fileVerbs, type FileChange } from "./verbs";
import "./files.css";

/** A picture where it can be drawn. One Storage can't draw keeps its ground and says its name, never a broken glyph. */
function Picture({ src, alt, name, big = false }: { src: string; alt: string; name: string; big?: boolean }) {
  const [broken, setBroken] = useState(false);
  if (broken)
    return (
      <span
        className={big ? "files-big files-unseen" : "files-pic files-unseen"}
        role="img"
        aria-label={alt}
        data-testid="fl-unseen"
      >
        {name}
      </span>
    );
  return (
    <img
      className={big ? "files-big" : "files-pic"}
      src={src}
      alt={alt}
      loading={big ? undefined : "lazy"}
      decoding="async"
      onError={() => setBroken(true)}
    />
  );
}

/** One photo on the grid: the picture, and the name it goes by. */
function Photo({ file, onOpen }: { file: FileDto; onOpen: () => void }) {
  const said = fileSaidOf(file.name);
  return (
    <Press className="files-photo" onClick={onOpen} data-testid="fl-tile">
      <Picture src={`${fileViewOf(file.id)}?w=480`} alt={file.line ?? said} name={said} />
      <span className="files-name">{said}</span>
    </Press>
  );
}

/** A photo on its way: dim while it goes, and where it failed, its picture, its words, and what can be done about it. */
function OnItsWay({ photo, flash }: { photo: SendingPhoto; flash: (f: LegacyFlash) => void }) {
  const failed = photo.state === "failed";
  return (
    <div
      className={failed ? "files-photo files-failed" : "files-photo files-going"}
      data-testid={failed ? "fl-failed" : "fl-sending"}
    >
      {photo.picture ? (
        <Picture src={photo.picture} alt={photo.file.name} name={photo.file.name} />
      ) : (
        <span className="files-pic files-unseen">{photo.file.name}</span>
      )}
      <span className="files-state">
        {failed ? photo.file.name : photo.state === "sending" ? W.sending : W.waitingToSend}
      </span>
      {failed && (
        <>
          <span className="files-why">{photo.message}</span>
          <span className="files-tries">
            <Button size="sm" onClick={() => tryAgain(photo.key, flash)} data-testid="fl-try-again">
              {W.retry}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => takeAway(photo.key)} data-testid="fl-take-away">
              {W.takeAway}
            </Button>
          </span>
        </>
      )}
    </div>
  );
}

/** The sheet's name: typed here as words, and saved by Return or by Save, which stands beside it only while there is something to save. */
function NameField({ file, change }: { file: FileDto; change: (body: FileChange) => Promise<string | null> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const dirty = draft !== null && fileNameOf(draft) !== file.name;
  const save = async () => {
    if (!dirty) return setDraft(null);
    const refused = await change({ name: draft });
    setProblem(refused);
    if (!refused) setDraft(null);
  };
  return (
    <div className="files-name-row">
      <Field
        className="files-name-box"
        label={W.name}
        value={draft ?? fileSaidOf(file.name)}
        onValueChange={(v) => setDraft(v)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save();
          // Taken here while there are words to take back, so the sheet is not closed with them.
          if (e.key === "Escape" && dirty) {
            e.preventDefault();
            setDraft(null);
          }
        }}
        maxLength={FILE_NAME_MAX}
        spellCheck={false}
        enterKeyHint="done"
        data-testid="fl-name"
        {...fieldProblem(problem)}
      />
      {dirty && (
        <Button size="sm" onClick={() => void save()} data-testid="fl-name-save">
          {W.save}
        </Button>
      )}
    </div>
  );
}

/** What the sheet says the look saw, or how it stands. A refused picture a person has since kept waits for no one. */
function lookSaysOf(file: FileDto): string | null {
  if (file.look_status === "waiting") return W.looking;
  if (file.look_status === "refused") return file.status === "inbox" ? W.refused : W.notRead;
  if (file.look_status === "failed") return W.notRead;
  return file.line;
}

/** What a press in the sheet is handed: whether it may, whether one is out, and how a word is said. */
interface SheetPress {
  file: FileDto;
  may: boolean;
  busy: boolean;
  say: (body: FileChange) => void;
}

/** The sheet's foot: where it stands in the pile, its original, and Delete behind a question. A reader has the original alone. */
function FileActs({ file, may, busy, say, remove, ask }: SheetPress & { remove: () => void; ask: () => void }) {
  const [asking, setAsking] = useState(false);
  if (asking)
    return (
      <Confirm
        question={W.removeAsk}
        detail={W.removeNote}
        yes={W.remove}
        no={W.dontDelete}
        danger
        busy={busy}
        onYes={remove}
        onNo={() => setAsking(false)}
        testid="fl-remove-ask"
      />
    );
  // A post Ask made is kept in a shape each; anything else is the one picture.
  const download =
    file.source === "made" ? (
      POST_SHAPES.map((shape) => (
        <Button
          key={shape}
          variant="quiet"
          href={`${fileViewOf(file.id)}?download&shape=${shape}`}
          data-testid={`fl-download-${shape}`}
        >
          {POST_WORDS.shapes[shape]}
        </Button>
      ))
    ) : (
      <Button variant="quiet" href={`${fileViewOf(file.id)}?download`} data-testid="fl-download">
        {W.download}
      </Button>
    );
  const askAboutIt = (
    <Button variant="quiet" onClick={ask} data-testid="fl-ask">
      <Icon name="three" size={13} />
      {W.askAbout}
    </Button>
  );
  if (!may)
    return (
      <div className="files-acts" data-foot-acts="">
        {askAboutIt}
        {download}
      </div>
    );
  return (
    <div className="files-acts" data-foot-acts="">
      {askAboutIt}
      {file.status === "inbox" && (
        <Button onClick={() => say({ status: "filed" })} disabled={busy} data-testid="fl-keep">
          {W.keep}
        </Button>
      )}
      {file.status === "set_aside" ? (
        <Button onClick={() => say({ status: "filed" })} disabled={busy} data-testid="fl-putback">
          {W.putBack}
        </Button>
      ) : (
        <Button variant="quiet" onClick={() => say({ status: "set_aside" })} disabled={busy} data-testid="fl-setaside">
          {W.setAside}
        </Button>
      )}
      {download}
      <Button variant="quiet" tone="danger" onClick={() => setAsking(true)} disabled={busy} data-testid="fl-remove">
        {W.remove}
      </Button>
    </div>
  );
}

/** The two answers to who is in it, for what the look left to a person. Nothing is chosen until one is said. */
function WhoAsked({ question, busy, say }: { question: string; busy: boolean; say: (body: FileChange) => void }) {
  return (
    <div className="files-who">
      <p className="files-from">{question}</p>
      <span className="files-tries">
        <Button size="sm" onClick={() => say({ who_in_it: "agreed" })} disabled={busy} data-testid="fl-who-agreed">
          {W.who.agreed}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => say({ who_in_it: "no_one" })}
          disabled={busy}
          data-testid="fl-who-no_one"
        >
          {W.who.no_one}
        </Button>
      </span>
    </div>
  );
}

/**
 * Who is in it, as it stands: asked only where something is left to ask, else one line and a quiet way to change it. An answer
 * takes the pressed button away, so focus goes to what stands in its place: left to itself it falls to the sheet's first
 * field, and on a phone that is a keyboard nobody asked for.
 */
function FileWho({ file, busy, say }: Omit<SheetPress, "may">) {
  const [changing, setChanging] = useState(false);
  const changeRef = useRef<HTMLButtonElement>(null);
  const answered = useRef(false);
  const stands = whoStandsOf(file);
  useEffect(() => {
    if (!answered.current || !changeRef.current) return;
    answered.current = false;
    changeRef.current.focus();
  });
  const answer = (body: FileChange) => {
    answered.current = true;
    setChanging(false);
    say(body);
  };
  if (stands.is === "looking") return null;
  if (stands.is === "ask") return <WhoAsked question={W.whoAsk(stands.seen)} busy={busy} say={answer} />;
  if (changing) return <WhoAsked question={W.whoAsk(file.people?.count || null)} busy={busy} say={answer} />;
  return (
    <div className="files-who-line">
      <p className="files-from" data-testid="fl-who-says">
        {stands.is === "said" ? W.who[stands.who] : W.whoClear}
      </p>
      <Button ref={changeRef} size="sm" variant="quiet" onClick={() => setChanging(true)} data-testid="fl-who-change">
        {W.whoChange}
      </Button>
    </div>
  );
}

/** Its shelf, for a member who may say. */
function FileChoices({ file, busy, say }: Omit<SheetPress, "may">) {
  const shelfId = useId();
  const shelf = file.shows ? W.shows[file.shows] : W.shelfNone;
  return (
    <Field
      label={W.shelf}
      onLabelPress={() => document.getElementById(shelfId)?.focus()}
      control={
        <MoreMenu
          items={FILE_SHOWS.map((s: FileShows) => ({
            label: W.shows[s],
            checked: s === file.shows,
            onClick: () => say({ shows: s }),
          }))}
          label={shelf}
          title={W.shelf}
          ariaLabel={`${W.shelf}: ${shelf}`}
          boxAttrs={{ id: shelfId }}
          btnClass="rec-input rec-select"
          align="left"
          escape
          gated={busy ? W.saving : null}
          testid="fl-shows"
        />
      }
    />
  );
}

/** The same, for a member who may only read it: words, and why, with nothing to press that does nothing. */
function FileReads({ file }: { file: FileDto }) {
  const stands = whoStandsOf(file);
  const who = stands.is === "said" ? W.who[stands.who] : stands.is === "clear" ? W.whoClear : null;
  return (
    <>
      <p className="files-from">
        {W.shelf}: {file.shows ? W.shows[file.shows] : W.shelfNone}
      </p>
      {who && (
        <p className="files-from">
          {W.who_label}: {who}
        </p>
      )}
      <p className="files-from" data-testid="fl-reader">
        {gateTitle("settings", W.mayChange)}
      </p>
    </>
  );
}

/** What a person says of one file. Each change is saved as it is made, and the door's refresh reads the list again. */
function FileSheet({ file, onClose, flash }: { file: FileDto; onClose: () => void; flash: (f: LegacyFlash) => void }) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const may = canDo("settings");
  const change = async (body: FileChange): Promise<string | null> => {
    setBusy(true);
    const r = await fileVerbs.change(file.id, body);
    setBusy(false);
    return r.ok ? null : r.message;
  };
  const say = (body: FileChange) => {
    void change(body).then(setProblem);
  };
  const remove = async () => {
    setBusy(true);
    const r = await fileVerbs.remove(file.id);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    flash({ msg: <>{W.removed}</> });
    onClose();
  };
  const press: SheetPress = { file, may, busy, say };
  const says = lookSaysOf(file);
  const said = fileSaidOf(file.name);
  // The sheet goes as Ask comes, "this photo" the one it held: the picture is in the turn, and the chip says which.
  const ask = () => afterSheetCloses(onClose, () => askAbout({ about: { kind: "file", id: file.id, label: said } }));
  return (
    <RecordSheet
      id="file"
      onClose={onClose}
      title={said}
      closeLabel={W.close}
      backCloses={`file:${file.id}`}
      testid="fl-sheet"
      foot={<FileActs {...press} remove={() => void remove()} ask={ask} />}
    >
      <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} name={said} big />
      {says && <p className="files-says">{says}</p>}
      {file.looks_like_stock && file.status === "inbox" && <Notice label={W.stock} fact={W.stock} line />}
      {file.issues.length > 0 && <p className="files-says files-issues">{file.issues.join(" ")}</p>}
      <div className="files-fields">
        {may ? (
          <>
            <NameField file={file} change={change} />
            <FileChoices file={file} busy={busy} say={say} />
            <FileWho file={file} busy={busy} say={say} />
          </>
        ) : (
          <FileReads file={file} />
        )}
        <p className="files-from">{W.sources[file.source]}</p>
        {/* Under what was pressed, and read out: a press that did nothing says so where the eye and a screen reader are. */}
        {problem && (
          <div role="alert">
            <Notice label={problem} fact={problem} line testid="fl-problem" />
          </div>
        )}
      </div>
    </RecordSheet>
  );
}

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

/** What the Inbox says of itself, and its one press: what the look found nothing against, kept at once. */
function InboxPress({ inbox, flash }: { inbox: readonly FileDto[]; flash: (f: LegacyFlash) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = inbox.filter(inboxCleanOf);
  if (clean.length === 0) return null;
  const said = W.inboxSays(clean.length, inbox.length - clean.length);
  const keep = async () => {
    setBusy(true);
    const r = await fileVerbs.keepMany(clean.map((f) => f.id));
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setProblem(null);
    flash({ msg: <>{W.kept(r.data.kept)}</> });
  };
  return (
    <>
      <Notice
        className="files-inbox-says"
        label={said}
        fact={said}
        line
        testid="fl-inbox-says"
        act={
          <Button size="sm" onClick={() => void keep()} disabled={busy} data-testid="fl-keep-many">
            {W.keepMany(clean.length)}
          </Button>
        }
      />
      {problem && (
        <div role="alert">
          <Notice label={problem} fact={problem} line testid="fl-problem" />
        </div>
      )}
    </>
  );
}

/** The grid's head: what is on its way, and one press for all that failed. */
function PhotosOnTheirWay({ photos, flash }: { photos: readonly SendingPhoto[]; flash: (f: LegacyFlash) => void }) {
  const failed = photos.filter((p) => p.state === "failed").length;
  return (
    <>
      {failed > 1 && (
        <div className="files-try-all">
          <Button size="sm" variant="quiet" onClick={() => tryAll(flash)} data-testid="fl-try-all">
            {W.tryAll(failed)}
          </Button>
        </div>
      )}
      {photos.map((p) => (
        <OnItsWay key={p.key} photo={p} flash={flash} />
      ))}
    </>
  );
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
      <input ref={picker} type="file" accept={FILE_PICKS} multiple hidden onChange={chosen} data-testid="fl-picker" />
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
