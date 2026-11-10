/**
 * One file, opened (decision 0099): the picture, or a post in the shape chosen, or a video's player (stage B); what the look saw,
 * and for a video what was heard of it; what a person says of it; and its foot. Settings loads no Base UI popup, so the sheet is
 * the house's (kit/record/sheet). Each change is saved as it is made, and the door's refresh reads the list again.
 */
import { useCallback, useEffect, useState } from "react";
import {
  FILE_WORDS as W,
  MAKE_POST_ASK,
  ON_INSTAGRAM,
  POST_WORDS,
  fileSaidOf,
  fileViewOf,
  postPhotoWont,
  whoStandsOf,
  type FileDto,
  type FileMade,
  type FilePosted,
  type FileRecordDto,
  type FileSound,
  type PostDto,
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
import { PostGoogle, PostGoogleActs, PostOnGoogle, usePostGoogle } from "./places/post-google";
import {
  PostInstagram,
  PostInstagramActs,
  PostOnInstagram,
  useSheetInstagram,
  type usePostInstagram,
} from "./places/post-instagram";
import { PostShapes } from "./post-shapes";
import { PostVersion, PostVersionActs, usePostVersion } from "./post-version";
import { fileVerbs, type FileChange } from "./verbs";
import { VideoHeard, VideoOpened } from "./video-player";

/** What the sheet says the look saw, or how it stands. A refused picture a person has since kept waits for no one. */
function lookSaysOf(file: FileDto): string | null {
  // A video not yet ready says so where its player stands: the look has nothing to read before.
  if (file.kind === "video" && file.media_status !== "ready") return null;
  if (file.look_status === "waiting") return W.looking;
  if (file.look_status === "refused") return file.status === "inbox" ? W.refused : W.notRead;
  if (file.look_status === "failed") return W.notRead;
  return file.line;
}

/**
 * How a post was made and where it is up, or what was heard of a video, read as its sheet opens: none of it is on the list a page
 * reads. Nothing is said until it comes. A video's is read again as what it is heard changes (its list's `sound_said`).
 */
function usePostRecord(file: FileDto) {
  const [made, setMade] = useState<FileMade | null>(null);
  const [connected, setConnected] = useState(false);
  const [posted, setPosted] = useState<FilePosted | null>(null);
  const [sound, setSound] = useState<FileSound | null>(null);
  const [instagram, setInstagram] = useState<FileRecordDto["instagram"]>(null);
  // Read again when asked: a post on its way to Instagram says where it stands as it moves.
  const [asked, setAsked] = useState(0);
  const reread = useCallback(() => setAsked((n) => n + 1), []);
  const isPost = file.source === "made";
  const isVideo = file.kind === "video";
  const heard = isVideo ? `${file.media_status}|${file.sound_said ?? ""}` : "";
  useEffect(() => {
    if (!isPost && !isVideo) return undefined;
    let live = true;
    void fileVerbs.record(file.id).then((r) => {
      if (!live || !r.ok) return;
      setMade(r.data.made);
      setConnected(r.data.google?.connected ?? false);
      setPosted(r.data.google?.posted ?? null);
      setInstagram(r.data.instagram ?? null);
      setSound(r.data.sound ?? null);
    });
    return () => {
      live = false;
    };
  }, [file.id, isPost, isVideo, heard, asked]);
  return { made, connected, posted, setPosted, sound, instagram, reread };
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

/** What Make a post asks Ask: a photo's own sentence, or a video's, whose post is drawn from the moment Ask chooses. */
const postAskOf = (file: FileDto) => (file.kind === "video" ? W.video.makePostAsk : MAKE_POST_ASK);

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
  toInstagram,
}: SheetPress & {
  remove: () => void;
  ask: () => void;
  makePost: () => void;
  newVersion: (() => void) | null;
  toGoogle: (() => void) | null;
  toInstagram: (() => void) | null;
}) {
  const [asking, setAsking] = useState(false);
  const video = file.kind === "video";
  if (asking)
    return (
      <Confirm
        question={video ? W.video.removeAsk : W.removeAsk}
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
  // A post Ask made says its own, by the shape it shows; a video's own file stays with whoever sent it; anything else is the one picture.
  const download =
    file.source === "made" || video ? null : (
      <Button variant="quiet" href={`${fileViewOf(file.id)}?download`} data-testid="fl-download">
        {W.download}
      </Button>
    );
  const askAboutIt = (
    <Button variant="quiet" onClick={ask} data-testid="fl-ask">
      <Icon name="three" size={13} />
      {video ? W.video.askAbout : W.askAbout}
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
      {toInstagram && (
        <Button variant="quiet" onClick={toInstagram} data-testid="fl-to-instagram">
          {ON_INSTAGRAM.post}
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

/** What the sheet shows of the file: a new version being made, a post on its way to Google, a post's shapes, a video's player, or the picture. */
function FileShown({
  file,
  said,
  version,
  going,
  toInstagram,
  made,
}: {
  file: FileDto;
  said: string;
  version: ReturnType<typeof usePostVersion>;
  going: ReturnType<typeof usePostGoogle>;
  toInstagram: ReturnType<typeof usePostInstagram>;
  made: FileMade | null;
}) {
  if (version.open) return <PostVersion version={version} />;
  if (going.open && made) return <PostGoogle google={going} plan={made.plan} />;
  if (toInstagram.open) return <PostInstagram draft={toInstagram} alt={file.line ?? said} />;
  if (file.source === "made")
    return <PostShapes id={file.id} name={file.name} alt={file.line ?? said} says={POST_WORDS} />;
  if (file.kind === "video") return <VideoOpened file={file} said={said} />;
  return <Picture src={`${fileViewOf(file.id)}?w=1280`} alt={file.line ?? said} name={said} big />;
}

/** The foot of a post on its way somewhere: a new version, Google's words, Instagram's; null while nothing is drafted. */
function draftActsOf(drafts: {
  version: ReturnType<typeof usePostVersion>;
  going: ReturnType<typeof usePostGoogle>;
  toInstagram: ReturnType<typeof usePostInstagram>;
}): React.ReactNode {
  if (drafts.version.open) return <PostVersionActs version={drafts.version} />;
  if (drafts.going.open) return <PostGoogleActs google={drafts.going} />;
  if (drafts.toInstagram.open) return <PostInstagramActs draft={drafts.toInstagram} />;
  return null;
}

/** Where the post went: up on Google, and the newest on Instagram with where it stands. */
function PostPlaces({
  id,
  posted,
  newest,
  may,
  saidDown,
  pulled,
  flash,
}: {
  id: string;
  posted: FilePosted | null;
  newest: PostDto | null;
  may: boolean;
  saidDown: () => void;
  pulled: () => void;
  flash: (f: FrameFlash) => void;
}) {
  return (
    <>
      {posted && <PostOnGoogle id={id} posted={posted} may={may} saidDown={saidDown} flash={flash} />}
      {newest && <PostOnInstagram id={id} post={newest} may={may} pulled={pulled} flash={flash} />}
    </>
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
  const { made, connected, posted, setPosted, sound, instagram, reread } = usePostRecord(file);
  const version = usePostVersion((id, words) => {
    flash({ msg: <>{words}</> });
    open(id);
  });
  const plan = made?.plan ?? null;
  const going = usePostGoogle(file.id, plan, setPosted, flash);
  const ig = useSheetInstagram(file.id, { plan, instagram, reread }, flash);
  const toInstagram = ig.draft;
  const drafting = version.open || going.open || toInstagram.open;
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
    flash({ msg: <>{file.kind === "video" ? W.video.removed : W.removed}</> });
    onClose();
  };
  const press: SheetPress = { file, may, busy, say };
  const says = lookSaysOf(file);
  const said = fileSaidOf(file.name);
  // The sheet goes as Ask comes, "this photo" the one it held: the picture is in the turn, and the chip says which.
  const about = { kind: "file", id: file.id, label: said } as const;
  const ask = () => afterSheetCloses(onClose, () => askAbout({ about }));
  // A conversation of its own, so a post costs only what a post reads, whatever Ask was last asked.
  const makePost = () => afterSheetCloses(onClose, () => askAbout({ about, prompts: postAskOf(file), fresh: true }));
  return (
    <RecordSheet
      id="file"
      onClose={onClose}
      title={said}
      closeLabel={W.close}
      backCloses={`file:${file.id}`}
      testid="fl-sheet"
      foot={
        draftActsOf({ version, going, toInstagram }) ?? (
          <FileActs
            {...press}
            remove={() => void remove()}
            ask={ask}
            makePost={makePost}
            // From the photo it came from: with that gone, there is nothing to draw it again from.
            newVersion={made?.from ? () => version.begin(made.plan) : null}
            toGoogle={may && connected && !posted && made?.from ? going.begin : null}
            toInstagram={may && ig.free ? toInstagram.begin : null}
          />
        )
      }
    >
      <FileShown file={file} said={said} version={version} going={going} toInstagram={toInstagram} made={made} />
      {!drafting && (
        <>
          {says && <p className="files-says">{says}</p>}
          {file.kind === "video" && <VideoHeard sound={sound} />}
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
            <PostPlaces
              id={file.id}
              posted={posted}
              newest={ig.newest}
              may={may}
              saidDown={() => setPosted(null)}
              pulled={reread}
              flash={flash}
            />
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
