/**
 * One file, opened (decision 0099): the picture, or a post in the shape chosen; what the look saw; what a person says of it; and its
 * foot. Settings loads no Base UI popup, so the sheet is the house's (kit/record/sheet). Each change is saved as it is made, and the
 * door's refresh reads the list again.
 */
import { useEffect, useState } from "react";
import {
  FILE_WORDS as W,
  MAKE_POST_ASK,
  POST_WORDS,
  fileSaidOf,
  fileViewOf,
  postPhotoWont,
  whoStandsOf,
  type FileDto,
  type FileMade,
  type FilePosted,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Confirm } from "../kit/confirm/confirm";
import { Icon } from "../kit/icon/icon";
import { Notice } from "../kit/notice/notice";
import { RecordSheet } from "../kit/record/sheet";
import { afterSheetCloses } from "../kit/sheet/back";
import { askAbout, canDo, type FrameFlash } from "../frame-verbs";
import { FileChoices, FileReads, FileWho, NameField, type SheetPress } from "./file-fields";
import { Picture } from "./photo";
import { PostGoogle, PostGoogleActs, PostOnGoogle, usePostGoogle } from "./post-google";
import { PostShapes } from "./post-shapes";
import { PostVersion, PostVersionActs, usePostVersion } from "./post-version";
import { fileVerbs, type FileChange } from "./verbs";

/** What the sheet says the look saw, or how it stands. A refused picture a person has since kept waits for no one. */
function lookSaysOf(file: FileDto): string | null {
  if (file.look_status === "waiting") return W.looking;
  if (file.look_status === "refused") return file.status === "inbox" ? W.refused : W.notRead;
  if (file.look_status === "failed") return W.notRead;
  return file.line;
}

/** How a post was made and where it is up, read as its sheet opens: neither is on the list a page reads. Nothing is said until it comes. */
function usePostRecord(file: FileDto) {
  const [made, setMade] = useState<FileMade | null>(null);
  const [connected, setConnected] = useState(false);
  const [posted, setPosted] = useState<FilePosted | null>(null);
  const isPost = file.source === "made";
  useEffect(() => {
    if (!isPost) return undefined;
    let live = true;
    void fileVerbs.record(file.id).then((r) => {
      if (!live || !r.ok) return;
      setMade(r.data.made);
      setConnected(r.data.google?.connected ?? false);
      setPosted(r.data.google?.posted ?? null);
    });
    return () => {
      live = false;
    };
  }, [file.id, isPost]);
  return { made, connected, posted, setPosted };
}

/** Where a post came from, a door to that photo while it is here; anything else says the road that brought it. */
function FileFrom({ file, made, open }: { file: FileDto; made: FileMade | null; open: (id: string) => void }) {
  if (file.source !== "made" || !made) return <p className="files-from">{W.sources[file.source]}</p>;
  const { from } = made;
  if (!from) return <p className="files-from">{W.madeFromGone}</p>;
  return (
    <p className="files-from files-made-from">
      {W.madeFrom}
      <Button size="sm" variant="quiet" onClick={() => open(from.id)} data-testid="fl-made-from">
        {fileSaidOf(from.name)}
      </Button>
    </p>
  );
}

/** The sheet's foot: where it stands in the pile, its original, and Delete behind a question. A reader has the original alone. */
function FileActs({
  file,
  may,
  busy,
  say,
  remove,
  ask,
  makePost,
  newVersion,
  toGoogle,
}: SheetPress & {
  remove: () => void;
  ask: () => void;
  makePost: () => void;
  newVersion: (() => void) | null;
  toGoogle: (() => void) | null;
}) {
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
  // A post Ask made says its own, by the shape it shows; anything else is the one picture.
  const download =
    file.source === "made" ? null : (
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
  // Who is in it is asked in this sheet first, for nothing: a press would pay a model to ask the same.
  const makesPost = !postPhotoWont(file) && whoStandsOf(file).is !== "ask";
  return (
    <div className="files-acts" data-foot-acts="">
      {makesPost && (
        <Button onClick={makePost} data-testid="fl-make-post">
          {W.makePost}
        </Button>
      )}
      {newVersion && (
        <Button onClick={newVersion} data-testid="fl-new-version">
          {W.newVersion}
        </Button>
      )}
      {toGoogle && (
        <Button variant="quiet" onClick={toGoogle} data-testid="fl-to-google">
          {W.google.post}
        </Button>
      )}
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

export /** What a person says of one file. Each change is saved as it is made, and the door's refresh reads the list again. */
function FileSheet({
  file,
  onClose,
  open,
  flash,
}: {
  file: FileDto;
  onClose: () => void;
  open: (id: string) => void;
  flash: (f: FrameFlash) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const may = canDo("settings");
  const { made, connected, posted, setPosted } = usePostRecord(file);
  const version = usePostVersion((id, words) => {
    flash({ msg: <>{words}</> });
    open(id);
  });
  const going = usePostGoogle(file.id, made?.plan ?? null, setPosted, flash);
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
  const about = { kind: "file", id: file.id, label: said } as const;
  const ask = () => afterSheetCloses(onClose, () => askAbout({ about }));
  // A conversation of its own, so a post costs only what a post reads, whatever Ask was last asked.
  const makePost = () => afterSheetCloses(onClose, () => askAbout({ about, prompts: MAKE_POST_ASK, fresh: true }));
  return (
    <RecordSheet
      id="file"
      onClose={onClose}
      title={said}
      closeLabel={W.close}
      backCloses={`file:${file.id}`}
      testid="fl-sheet"
      foot={
        version.open ? (
          <PostVersionActs version={version} />
        ) : going.open ? (
          <PostGoogleActs google={going} />
        ) : (
          <FileActs
            {...press}
            remove={() => void remove()}
            ask={ask}
            makePost={makePost}
            // From the photo it came from: with that gone, there is nothing to draw it again from.
            newVersion={made?.from ? () => version.begin(made.plan) : null}
            toGoogle={may && connected && !posted && made?.from ? going.begin : null}
          />
        )
      }
    >
      {version.open ? (
        <PostVersion version={version} />
      ) : going.open && made ? (
        <PostGoogle google={going} plan={made.plan} />
      ) : file.source === "made" ? (
        <PostShapes id={file.id} name={file.name} alt={file.line ?? said} says={POST_WORDS} />
      ) : (
        <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} name={said} big />
      )}
      {!version.open && !going.open && (
        <>
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
            <FileFrom file={file} made={made} open={open} />
            {posted && (
              <PostOnGoogle id={file.id} posted={posted} may={may} saidDown={() => setPosted(null)} flash={flash} />
            )}
            {/* Under what was pressed, and read out: a press that did nothing says so where the eye and a screen reader are. */}
            {problem && (
              <div role="alert">
                <Notice label={problem} fact={problem} line testid="fl-problem" />
              </div>
            )}
          </div>
        </>
      )}
    </RecordSheet>
  );
}
