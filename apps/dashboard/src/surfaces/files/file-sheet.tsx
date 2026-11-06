/**
 * One file, opened (decision 0099): the picture, or a post in the shape chosen; what the look saw; what a person says of it; and its
 * foot. Settings loads no Base UI popup, so the sheet is the house's (kit/record/sheet). Each change is saved as it is made, and the
 * door's refresh reads the list again.
 */
import { useState } from "react";
import { FILE_WORDS as W, POST_WORDS, fileSaidOf, fileViewOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Confirm } from "../kit/confirm/confirm";
import { Icon } from "../kit/icon/icon";
import { Notice } from "../kit/notice/notice";
import { RecordSheet } from "../kit/record/sheet";
import { afterSheetCloses } from "../kit/sheet/back";
import { askAbout, canDo, type LegacyFlash } from "../legacy-verbs";
import { FileChoices, FileReads, FileWho, NameField, type SheetPress } from "./file-fields";
import { Picture } from "./photo";
import { PostShapes } from "./post-shapes";
import { fileVerbs, type FileChange } from "./verbs";

/** What the sheet says the look saw, or how it stands. A refused picture a person has since kept waits for no one. */
function lookSaysOf(file: FileDto): string | null {
  if (file.look_status === "waiting") return W.looking;
  if (file.look_status === "refused") return file.status === "inbox" ? W.refused : W.notRead;
  if (file.look_status === "failed") return W.notRead;
  return file.line;
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

export /** What a person says of one file. Each change is saved as it is made, and the door's refresh reads the list again. */
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
      {file.source === "made" ? (
        <PostShapes id={file.id} name={file.name} alt={file.line ?? said} says={POST_WORDS} />
      ) : (
        <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} name={said} big />
      )}
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
