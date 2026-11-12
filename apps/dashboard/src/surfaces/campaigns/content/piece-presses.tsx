/**
 * What an open piece holds behind its picture (piece.tsx ContentPiece): its posts with its record's, where it can go now, the
 * presses that change it (a file's fields, a delete with Undo, Don't post), and the drafts that take the pane one at a time
 * (a post's new version, a video's words made again, a still, the composer). Each its own hook, so the pane composes them.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  FILE_WORDS,
  POST_ON_ITS_WAY,
  STILL_WORDS,
  type ContentMadeDto,
  type PostDto,
  type PostPlace,
} from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import type { FrameFlash } from "../../frame-verbs";
import type { usePostRecord } from "../../files/post-record";
import { PostVersion, PostVersionActs, usePostVersion } from "../../files/post-version";
import { fileVerbs, type FileChange } from "../../files/verbs";
import { cmFootAsk } from "../parts/split";
import { PostBoth, PostBothActs, usePostBoth } from "./post-both";
import { StillActs, StillPick, useStill } from "./still";
import { VideoAgain, VideoAgainActs, useVideoAgain } from "./video-again";
import type { PieceTakes } from "./model/piece-open";

type PieceRecord = ReturnType<typeof usePostRecord>;

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
 */
export function usePiecePosts(
  piece: ContentMadeDto,
  record: PieceRecord,
): { posts: PostDto[]; takes: PieceTakes | null } {
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
  return { posts, takes };
}

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
  const change = async (body: FileChange): Promise<string | null> => {
    setBusy(true);
    const r = await fileVerbs.change(file.id, body);
    setBusy(false);
    if (r.ok) reread();
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
      msg: <>{file.kind === "video" ? FILE_WORDS.video.removed : FILE_WORDS.removed}</>,
      undo: () => void undo(),
    });
    reread();
    onClose();
  };
  // Don't post, through the door of the place it waits for (Google keeps a time too: 00616).
  const pull = async (postId: string) => {
    setBusy(true);
    const place = posts.find((p) => p.id === postId)?.place;
    const pulled =
      place === "google"
        ? await fileVerbs.pullFromGoogle(file.id, postId)
        : await fileVerbs.pullFromInstagram(file.id, postId);
    setBusy(false);
    if (!pulled.ok) return setProblem(pulled.message);
    moved();
  };
  return {
    busy,
    problem,
    asking,
    moved,
    change,
    clear: () => setProblem(null),
    say: (body: FileChange) => void change(body).then(setProblem),
    ask: (on: boolean) => setAsking(on),
    remove: () => void remove(),
    pull: (postId: string) => void pull(postId),
  };
}

export type PiecePresses = ReturnType<typeof usePiecePresses>;

/** The drafts that take the pane, one at a time: a post's new version, a video's words again, a still, the composer. */
export function usePieceDrafts(hands: PieceHands, takes: PieceTakes | null, moved: () => void) {
  const { made, record, reread, open, flash } = hands;
  const version = usePostVersion((id, words) => {
    flash({ msg: <>{words}</> });
    reread();
    open(id);
  });
  const again = useVideoAgain((words) => {
    flash({ msg: <>{words}</> });
    reread();
  });
  const still = useStill(made.file, (id) => {
    flash({ msg: <>{STILL_WORDS.kept}</> });
    reread();
    open(id);
  });
  const both = usePostBoth({ id: made.file.id, plan: record.made?.plan ?? null, takes }, { done: moved, flash });
  return { version, again, still, both, open: both.open || version.open || again.open || still.open };
}

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/** The pane's body while a draft holds it, else what it shows at rest. */
export function draftBody(drafts: PieceDrafts, rest: ReactNode): ReactNode {
  if (drafts.still.open) return <StillPick still={drafts.still} />;
  if (drafts.again.open) return <VideoAgain again={drafts.again} />;
  if (drafts.version.open) return <PostVersion version={drafts.version} />;
  if (drafts.both.open) return <PostBoth both={drafts.both} />;
  return rest;
}

/** The pane's foot while a draft holds it; none for the piece's own. */
export function draftFoot(drafts: PieceDrafts): ReactNode | undefined {
  if (drafts.still.open) return <StillActs still={drafts.still} />;
  if (drafts.again.open) return <VideoAgainActs again={drafts.again} />;
  if (drafts.version.open) return <PostVersionActs version={drafts.version} />;
  if (drafts.both.open) return <PostBothActs both={drafts.both} />;
  return undefined;
}

/** Delete, asked first in the pane's foot, as a sequence's End it does; none while nobody asked. */
export function removeAskOf(file: ContentMadeDto["file"], presses: PiecePresses): ReactNode | null {
  if (!presses.asking) return null;
  return cmFootAsk(
    <Confirm
      question={file.kind === "video" ? FILE_WORDS.video.removeAsk : FILE_WORDS.removeAsk}
      detail={FILE_WORDS.removeNote}
      yes={FILE_WORDS.remove}
      no={FILE_WORDS.dontDelete}
      danger
      docked
      busy={presses.busy}
      onYes={presses.remove}
      onNo={() => presses.ask(false)}
      testid="cnv-remove-ask"
    />,
  );
}
