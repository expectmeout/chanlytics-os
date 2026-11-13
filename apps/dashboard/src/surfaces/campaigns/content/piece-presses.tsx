/**
 * What an open piece holds behind its picture (piece.tsx ContentPiece): its posts with its record's, where it can go now, the
 * presses that change it (a file's fields, a delete with Undo, Don't post), and the drafts that take the pane one at a time
 * (a post's new version, a video's words made again, the composer). Each its own hook, so the pane composes them.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  CONTENT_SHEET_WORDS,
  CONTENT_WORDS,
  FILE_WORDS,
  fileSaidOf,
  ON_INSTAGRAM,
  POST_PLACES,
  postCaptionOf,
  type ContentMadeDto,
  type PostDto,
} from "@chanlytics/contracts";
import { canDo, type FrameFlash } from "../../frame-verbs";
import type { usePostRecord } from "../../files/post-record";
import { PostVersion, PostVersionActs, usePostVersion } from "../../files/post-version";
import { fileVerbs, type FileChange } from "../../files/verbs";
import { PostBoth, PostBothActs, usePostBoth, type PlaceDoors } from "./post-both";
import { VideoAgain, VideoAgainActs, useVideoAgain } from "./video-again";
import { pieceStandsAt, pieceTakesOf, type PieceTakes } from "./model/piece-open";
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
  // Every place's (a line's piece holds its view's posts alone, and one read on its own held Instagram's alone). Where both
  // hold a post, the page's says where it stands: the page asks again while anything moves, and the record follows it.
  const recorded = record.posts;
  const posts = useMemo(() => {
    const held = new Set(piece.posts.map((p) => p.id));
    return [...piece.posts, ...(recorded ?? []).filter((p) => !held.has(p.id))].sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
  }, [piece.posts, recorded]);
  // What already holds a place is one rule, Ask's card's too (model/piece-open.ts pieceTakesOf, contracts postPlaceTakenOf).
  // Google up before each post was kept is the record's alone (`posted`).
  const takes: PieceTakes | null = record.made
    ? pieceTakesOf(posts, {
        instagram: record.instagram?.can === "yes",
        google: record.connected,
        onGoogle: !!record.posted,
      })
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

/** The presses that change the piece, each Files' own verb, and each reading the page again so the tile says what the pane does. */
export function usePiecePresses(hands: PieceHands, posts: readonly PostDto[]) {
  const { made, record, reread, open, onClose, flash } = hands;
  const { file } = made;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const moved = () => {
    record.reread();
    reread();
  };
  // A change, and what it answers: why it could not be made, or where a post was let go with it (a piece set aside).
  const changed = async (body: FileChange) => {
    setBusy(true);
    const r = await fileVerbs.change(file.id, body);
    setBusy(false);
    if (!r.ok) return { problem: r.message, stopped: [] };
    reread();
    return { problem: null, stopped: r.data.stopped };
  };
  const change = async (body: FileChange): Promise<string | null> => (await changed(body)).problem;
  // Set aside: a post of it that still waited is let go with it on the server (files/file.ts), and the note says which, as
  // the server said, so a post that went up before it could be stopped is never said to be stopped (Ruben, 12 Nov 2026).
  const aside = async () => {
    const { problem: refused, stopped } = await changed({ status: "set_aside" });
    setProblem(refused);
    if (stopped.length > 0) flash({ msg: <>{CONTENT_WORDS.piece.asideStops(stopped)}</> });
  };
  // The caption, written where it stands (Details): kept with how the piece was made, and its record read again, so Details,
  // Post it's box and Ask say the owner's words. Nothing else waits on it, so it holds no press of the pane's.
  const caption = async (words: string): Promise<string | null> => {
    const r = await fileVerbs.change(file.id, { caption: words });
    if (r.ok) record.reread();
    return r.ok ? null : r.message;
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
  // Don't post, through the door of the place it waits for (Google keeps a time too: 00616).
  const pull = async (postId: string) => {
    setBusy(true);
    // What an earlier press said went wrong is not this one's to keep saying.
    setProblem(null);
    const place = posts.find((p) => p.id === postId)?.place;
    const pulled =
      place === "google"
        ? await fileVerbs.pullFromGoogle(file.id, postId)
        : await fileVerbs.pullFromInstagram(file.id, postId);
    setBusy(false);
    if (!pulled.ok) return setProblem(pulled.message);
    // Said where it was pressed, as a delete is: the row it stood in goes quiet, and the note says why.
    flash({ msg: <>{ON_INSTAGRAM.pulledFlash}</> });
    moved();
  };
  return {
    busy,
    problem,
    asking,
    moved,
    change,
    caption,
    clear: () => setProblem(null),
    say: (body: FileChange) => void change(body).then(setProblem),
    aside: () => void aside(),
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
  presses: Pick<PiecePresses, "moved" | "pull" | "busy" | "problem">,
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
        // Undo puts the first back where it was, and lets the change go: only once the first is back, so an Undo that could
        // not bring it back never leaves neither.
        undo: () =>
          void fileVerbs.restore(was).then(async (back) => {
            if (!back.ok) return flash({ tone: "danger", msg: <>{back.message}</> });
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
      caption: postCaptionOf(at.posts, record.made),
      ...at,
      may: canDo("settings"),
    },
    { done: moved, flash, pull: presses.pull, pulling: presses.busy, pullProblem: presses.problem },
  );
  const about: ChangeAbout = { kind: "file", id: made.file.id, label: fileSaidOf(made.file.name) };
  return { version, again, both, about, replaces, open: both.open || version.open || again.open };
}

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/**
 * The pane's body while a draft holds it, else what it shows at rest. A post's new version (its words and shape alone: how it
 * looks is Ask's) and a video's words end on the one line to Ask, which lets the draft go as it asks. `doors` are the doors
 * to a post that is up at a place (see it, take it down), drawn under that place in the composer's list.
 */
export function draftBody(drafts: PieceDrafts, rest: ReactNode, doors: PlaceDoors = {}, words = true): ReactNode {
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
  if (drafts.both.open) return <PostBoth both={drafts.both} doors={doors} words={words} />;
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
  if (drafts.both.open) return drafts.both.sending ? <PostBothActs both={drafts.both} /> : undefined;
  return undefined;
}
