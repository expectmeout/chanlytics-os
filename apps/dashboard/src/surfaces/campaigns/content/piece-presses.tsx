/**
 * What an open piece holds behind its picture (piece.tsx ContentPiece): its posts with its record's, where it can go now, the
 * presses that change it (a file's fields, a delete with Undo, Don't post), and the drafts that take the pane one at a time
 * (a post's new version, a video's words made again, the composer). Each its own hook, so the pane composes them.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  CONTENT_SHEET_WORDS,
  CONTENT_WORDS,
  FILE_WORDS,
  fileSaidOf,
  ON_INSTAGRAM,
  POST_ON_ITS_WAY,
  POST_PLACES,
  POST_PULLABLE,
  postCaptionOf,
  type ContentMadeDto,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { canDo, type FrameFlash } from "../../frame-verbs";
import type { usePostRecord } from "../../files/post-record";
import { PostVersion, PostVersionActs, usePostVersion } from "../../files/post-version";
import { fileVerbs, postDoors, type FileChange } from "../../files/verbs";
import { PostBoth, PostBothActs, usePostBoth, type PlaceDoors } from "./post-both";
import { VideoAgain, VideoAgainActs, useVideoAgain } from "./video-again";
import { pieceStandsAt, type PieceTakes } from "./model/piece-open";
import type { PieceOffers, PieceWont } from "./model/places";
import { AskLine, type ChangeAbout } from "./sheets/ask-change";

type PieceRecord = ReturnType<typeof usePostRecord>;

/** Why a place takes no post, short, as the list of places says it beside Connect (post-both.tsx). */
const PLACES_SAY = CONTENT_SHEET_WORDS.places;

/** What the pane hands its hooks: the piece and its record, and how it reads the page again, opens, closes and tells. */
export interface PieceHands {
  made: ContentMadeDto;
  record: PieceRecord;
  reread: () => void;
  open: (id: string) => void;
  onClose: () => void;
  flash: (f: FrameFlash) => void;
}

/**
 * Its posts, the page's with the record's of Instagram beside them (a line's piece holds its view's posts alone), newest
 * first, as where it stands is read; and where it can go now. A place with a post on its way takes no second one until it
 * lands (00611 posts_one_on_its_way), and Google takes a piece once (a second would be the same post twice on the profile).
 * Each is null until the record has been read: nothing is said of a place before it is known.
 */
export function usePiecePosts(
  piece: ContentMadeDto,
  record: PieceRecord,
): { posts: PostDto[]; takes: PieceTakes | null; wont: PieceWont | null; offers: PieceOffers | null } {
  const recorded = record.instagram?.posts;
  const posts = useMemo(() => {
    const held = new Set(piece.posts.map((p) => p.id));
    return [...piece.posts, ...(recorded ?? []).filter((p) => !held.has(p.id))].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }, [piece.posts, recorded]);
  const onItsWay = (place: PostPlace) => posts.some((p) => p.place === place && POST_ON_ITS_WAY.includes(p.status));
  const onGoogle = !!record.posted || posts.some((p) => p.place === "google" && p.status === "published");
  const takes: PieceTakes | null = record.made
    ? {
        instagram: record.instagram?.can === "yes" && !onItsWay("instagram"),
        google: record.connected && !onItsWay("google") && !onGoogle,
      }
    : null;
  // Why a place can take none at all, short, where the list says it beside Connect (Settings > Connections), which puts it
  // right: a place hidden said nothing, and a sentence said what the press beside it now does.
  const wont: PieceWont | null = record.made
    ? {
        instagram:
          record.instagram?.can === "not_connected"
            ? PLACES_SAY.notConnected
            : record.instagram?.can === "line_off"
              ? PLACES_SAY.lineOff
              : null,
        google: record.connected ? null : PLACES_SAY.notConnected,
      }
    : null;
  // Instagram is offered only where the Meta link is switched on for the workspace: the record holds none of it otherwise
  // (server posts/record.ts readFileRecord), and the list leaves the place out rather than say "Not yet" of it.
  const offers: PieceOffers | null = record.made ? { instagram: record.instagram !== null, google: true } : null;
  return { posts, takes, wont, offers };
}

/** What the drafts read of the piece's posts: its posts, where it can go now, and why a place can take none. */
type PiecePosts = ReturnType<typeof usePiecePosts>;

/**
 * The caption on screen, as the box under a post's places holds it (viewer/caption.tsx onText): what Post sends, and what each
 * place's door keeps on the piece in the same step (server posts/caption.ts keepPostWords), so words typed just before Post go,
 * however the box was left (Ruben, 12 Nov 2026). Null while no box under the places shows it.
 */
function useCaptionShown(fileId: string) {
  const [shown, setShown] = useState<{ id: string; words: string } | null>(null);
  // The words a place's door kept as it posted: the box, going with its sheet, need not keep the same words again.
  const posted = useRef<{ id: string; words: string } | null>(null);
  return {
    shown: shown?.id === fileId ? shown.words : null,
    typed: (text: string | null) => {
      // The box holding other words than a door kept means the caption has moved since (typed over, or changed elsewhere and
      // read again): those kept words are no reason to skip a save any more.
      if (text !== null && posted.current && posted.current.words !== text.trim()) posted.current = null;
      setShown(text === null ? null : { id: fileId, words: text });
    },
    posted: (words: string | null) => {
      posted.current = words === null ? null : { id: fileId, words: words.trim() };
    },
    isPosted: (words: string) => posted.current?.id === fileId && posted.current.words === words.trim(),
  };
}

/**
 * Don't post, through the door of the place a post waits for (Google keeps a time too: 00616), and its Undo. Said where it was
 * pressed, as a delete is: the row it stood in goes quiet, and the note says why. A post that waited is put back by Undo
 * (Ruben, 12 Nov 2026: Don't post had no way back); one that stopped and was dismissed has none.
 */
function postPullOf(
  piece: { id: string; posts: readonly PostDto[]; words: () => string | null },
  tell: {
    flash: (f: FrameFlash) => void;
    moved: () => void;
    busy: (on: boolean) => void;
    problem: (words: string | null) => void;
  },
) {
  // Undo: the post set again as it was, at its time while that is still ahead, else now, with the piece's caption as it stands
  // now. The stopped post's own copy may be older than a caption changed since, and the door keeps what it is handed on the
  // piece, so that copy would put old words back.
  const putBack = async (post: PostDto) => {
    const later = Date.parse(post.scheduled_for) > Date.now() ? post.scheduled_for : undefined;
    const as = post.kind === "story" ? "story" : "picture";
    const set = await postDoors[post.place].begin(piece.id, as, piece.words() ?? post.caption ?? "", later);
    if (!set.ok) return tell.flash({ tone: "danger", msg: <>{set.message}</> });
    tell.flash({ msg: <>{FILE_WORDS.restored}</> });
    tell.moved();
  };
  return async (postId: string) => {
    tell.busy(true);
    // What an earlier press said went wrong is not this one's to keep saying.
    tell.problem(null);
    const post = piece.posts.find((p) => p.id === postId);
    const pulled = await postDoors[post?.place ?? "instagram"].pull(piece.id, postId);
    tell.busy(false);
    if (!pulled.ok) return tell.problem(pulled.message);
    const back = post && POST_PULLABLE.includes(post.status) ? post : null;
    // Its Undo is kept through a tap besides it, as a send's is: four seconds is all any toast stands (TOAST_MAX_MS).
    tell.flash({
      msg: <>{ON_INSTAGRAM.pulledFlash}</>,
      ...(back ? { undo: () => void putBack(back), stays: true } : {}),
    });
    tell.moved();
  };
}

/** The presses that change the piece, each Files' own verb, and each reading the page again so the tile says what the pane does. */
export function usePiecePresses(hands: PieceHands, posts: readonly PostDto[]) {
  const { made, record, reread, open, onClose, flash } = hands;
  const { file } = made;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const shown = useCaptionShown(file.id);
  const moved = () => {
    record.reread();
    reread();
  };
  const change = async (body: FileChange): Promise<string | null> => {
    setBusy(true);
    const r = await fileVerbs.change(file.id, body);
    setBusy(false);
    if (r.ok) reread();
    return r.ok ? null : r.message;
  };
  // The caption, written where it stands (Details): kept with how the piece was made, and its record read again, so Details,
  // the sheet and Ask say the owner's words. Nothing else waits on it, so it holds no press of the pane's.
  const caption = async (words: string): Promise<string | null> => {
    if (shown.isPosted(words)) return null;
    const r = await fileVerbs.change(file.id, { caption: words });
    if (!r.ok) return r.message;
    shown.posted(null);
    record.reread();
    return null;
  };
  const remove = async () => {
    setBusy(true);
    const removed = await fileVerbs.remove(file.id);
    setBusy(false);
    setAsking(false);
    if (!removed.ok) return setProblem(removed.message);
    // Ten minutes for Undo (00616): pressed in time, the piece is back, and open again.
    const undo = async () => {
      const back = await fileVerbs.restore(file.id);
      if (!back.ok) return flash({ tone: "danger", msg: <>{back.message}</> });
      flash({ msg: <>{FILE_WORDS.restored}</> });
      reread();
      open(file.id);
    };
    flash({
      msg: <>{CONTENT_WORDS.deleted(fileSaidOf(file.name))}</>,
      undo: () => void undo(),
    });
    reread();
    onClose();
  };
  const pull = postPullOf(
    { id: file.id, posts, words: () => shown.shown ?? postCaptionOf(posts, record.made) },
    { flash, moved, busy: setBusy, problem: setProblem },
  );
  return {
    busy,
    problem,
    asking,
    moved,
    change,
    caption,
    /** The words on screen under a post's places, which Post sends; and how the box there says them. */
    captionShown: shown.shown,
    captionTyped: shown.typed,
    captionPosted: shown.posted,
    clear: () => setProblem(null),
    say: (body: FileChange) => void change(body).then(setProblem),
    ask: (on: boolean) => setAsking(on),
    remove: () => void remove(),
    pull: (postId: string) => void pull(postId),
  };
}

export type PiecePresses = ReturnType<typeof usePiecePresses>;

/**
 * The drafts that take the pane, one at a time: a post's new version, a video's words again, the composer (which
 * is also the list of where it stands at each place). `about` is what the one line to Ask is asked about: this piece.
 */
export function usePieceDrafts(
  hands: PieceHands,
  at: PiecePosts,
  presses: Pick<PiecePresses, "moved" | "pull" | "busy" | "problem" | "captionShown" | "captionPosted">,
) {
  const { made, record, reread, open, flash } = hands;
  const { moved } = presses;
  // Out nowhere yet (not up, not on its way, not set for a time): a change takes its place, rather than a twin beside it.
  const now = Date.now();
  const replaces =
    record.posted === null &&
    POST_PLACES.every((place) => ["none", "stuck"].includes(pieceStandsAt(at.posts, place, now).is));
  const was = made.file.id;
  const version = usePostVersion((id, words) => {
    reread();
    open(id);
    if (!replaces) return flash({ msg: <>{words}</> });
    void fileVerbs.remove(was).then((gone) => {
      // Not taken away: both stand, and the toast says so, as Save as new does.
      if (!gone.ok) return flash({ msg: <>{words}</> });
      reread();
      flash({
        msg: <>{CONTENT_WORDS.piece.change.saved}</>,
        // Undo puts the first back where it was, and lets the change go.
        undo: () =>
          void fileVerbs.restore(was).then(async () => {
            await fileVerbs.remove(id);
            reread();
            open(was);
          }),
      });
    });
  });
  const again = useVideoAgain((words) => {
    flash({ msg: <>{words}</> });
    reread();
  });
  const both = usePostBoth(
    {
      id: made.file.id,
      plan: record.made?.plan ?? null,
      caption: presses.captionShown ?? postCaptionOf(at.posts, record.made),
      ...at,
      may: canDo("settings"),
    },
    {
      done: moved,
      flash,
      pull: presses.pull,
      pulling: presses.busy,
      pullProblem: presses.problem,
      wordsKept: presses.captionPosted,
    },
  );
  const about: ChangeAbout = { kind: "file", id: made.file.id, label: fileSaidOf(made.file.name) };
  return { version, again, both, about, replaces, open: both.open || version.open || again.open };
}

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/**
 * The pane's body while a draft holds it, else what it shows at rest. A post's new version (its words and shape alone: how it
 * looks is Ask's) and a video's words end on the one line to Ask, which lets the draft go as it asks. `doors` are the doors
 * to a post that is up at a place (see it, take it down), drawn under that place in the composer's list; `facts` the piece's
 * own (its caption typed in place, what it was made from), under the list, so the list and its words are one sheet.
 */
export function draftBody(drafts: PieceDrafts, rest: ReactNode, doors: PlaceDoors, facts: ReactNode): ReactNode {
  if (drafts.again.open)
    return (
      <>
        <VideoAgain again={drafts.again} />
        <AskLine about={drafts.about} onAsked={drafts.again.cancel} />
      </>
    );
  if (drafts.version.open)
    return (
      <>
        <PostVersion version={drafts.version} looks={false} fold shapes={false} />
        <AskLine about={drafts.about} onAsked={drafts.version.cancel} />
      </>
    );
  if (drafts.both.open)
    return (
      <>
        <PostBoth both={drafts.both} doors={doors} />
        {facts}
      </>
    );
  return rest;
}

/**
 * The foot while a draft holds it (the sheet's on a phone, the pane's on a desk); none for the piece's own, and none for the
 * composer while no place is switched on: then it is the list of where it stands, with nothing to send.
 */
export function draftFoot(drafts: PieceDrafts): ReactNode | undefined {
  if (drafts.again.open) return <VideoAgainActs again={drafts.again} />;
  if (drafts.version.open)
    return (
      <PostVersionActs
        version={drafts.version}
        alone
        label={drafts.replaces ? CONTENT_WORDS.piece.change.save : undefined}
      />
    );
  if (drafts.both.open)
    return drafts.both.sending || drafts.both.moving ? <PostBothActs both={drafts.both} /> : undefined;
  return undefined;
}
