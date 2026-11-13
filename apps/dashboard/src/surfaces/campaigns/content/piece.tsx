/**
 * A made piece, opened (the content canvas, "Opening a piece"): on a desk Campaigns' own pane beside the grid, with no head of
 * its own (viewer/desk.tsx, board Desk); on a phone the canvas's viewer, full screen and dark (viewer/viewer.tsx, board PhView).
 * Both are drawn from the same parts over the same record, presses and drafts. It is drawn at once from what the page already
 * holds (the file and its posts); its record (GET files/[id]: how it was made, what can take it now) is read behind it, as
 * Files' sheet reads it, and nothing on screen waits on that read.
 *
 * A post is changed (a new version), posted to both places (post-both.tsx) or asked about from here. Each act is Files' own
 * verb, and each one that changes something reads the page again, so the tile says what the pane says.
 */
import { useEffect, useRef } from "react";
import { FILE_WORDS, MAKE_POST_ASK, type ContentMadeDto } from "@chanlytics/contracts";
import { askAbout, canDo, type FrameFlash } from "../../frame-verbs";
import { PostOnGoogle } from "../../files/places/post-google";
import { PostOnInstagram } from "../../files/places/post-instagram";
import { usePostRecord } from "../../files/post-record";
import type { PieceFootActs } from "./piece-foot";
import { usePieceDrafts, usePiecePosts, usePiecePresses, type PieceHands, type PiecePresses } from "./piece-presses";
import { readAhead } from "./read-ahead";
import type { PieceNext } from "./model/piece-open";
import type { PlaceDoors } from "./post-both";
import { byHandPressOf } from "./viewer/by-hand";
import { PieceDesk } from "./viewer/desk";
import type { PieceMoreActs } from "./viewer/more";
import { PieceViewer } from "./viewer/viewer";

type PieceDrafts = ReturnType<typeof usePieceDrafts>;

/** Where a piece stands among those the page holds, and who is before and after it. */
type PieceBeside = { at: number; of: number; before: string | null; after: string | null } | null;

/** What Make a post asks Ask: a photo's own sentence, or a video's, whose post is drawn from the moment Ask chooses (as Files'). */
const postAskOf = (file: ContentMadeDto["file"]) =>
  file.kind === "video" ? FILE_WORDS.video.makePostAsk : MAKE_POST_ASK;

/** Everything a press on an open piece does. */
interface PieceActs extends PieceFootActs, PieceMoreActs {
  onClose: () => void;
  /** The piece before and after this one; null at either end. */
  onBefore: (() => void) | null;
  onAfter: (() => void) | null;
}

/** The presses on an open piece, from the piece, its record, its drafts and its presses: the acts', More's and the walk's. */
function pieceActsOf(
  hands: PieceHands & { beside: PieceBeside },
  at: { drafts: PieceDrafts; presses: PiecePresses },
): PieceActs {
  const { made, record, open, onClose, beside } = hands;
  const { drafts, presses } = at;
  const { file } = made;
  // What Ask is asked about is the piece, named once (piece-presses.tsx usePieceDrafts), for every door to Ask from here.
  const { about } = drafts;
  const plan = record.made?.plan ?? null;
  const from = record.made?.from ?? null;
  const video = record.video;
  return {
    onClose,
    onBefore: beside?.before ? () => open(beside.before ?? "") : null,
    onAfter: beside?.after ? () => open(beside.after ?? "") : null,
    onNext: (next: PieceNext) => {
      presses.clear();
      // Post, Post to Google and Post again open the one sheet as where it stands opens it (post-both.tsx begin).
      if (next.is === "post" || next.is === "post_to" || next.is === "again") drafts.both.begin();
      else if (next.is === "keep") presses.say({ status: "filed" });
      // A conversation of its own, so a post costs only what a post reads, whatever Ask was last asked (as Files').
      else if (next.is === "make") askAbout({ about, prompts: postAskOf(file), fresh: true });
    },
    onAsk: () => askAbout({ about }),
    onMakePost: () => askAbout({ about, prompts: FILE_WORDS.video.makePostAsk, fresh: true }),
    // A video from the plan it was drawn by; a post from the photo it came from: with that gone, there is nothing to draw it
    // again from.
    onChange: video ? () => drafts.again.begin(video) : from && plan ? () => drafts.version.begin(plan) : null,
    // Set aside, which lets a post of it that waited go and says so (piece-presses.tsx), or kept again.
    onAside: () => (file.status === "set_aside" ? presses.say({ status: "filed" }) : presses.aside()),
    onDelete: () => presses.ask(true),
  };
}

/**
 * The doors to a post that is up on Google and on Instagram (see it there; take it down from Google), each Files' own part:
 * drawn under that place in the list of where the piece stands (post-both.tsx), and nowhere else. None for a place where it
 * is not up.
 */
function postedDoorsOf(hands: PieceHands): PlaceDoors {
  const { made, record, reread, flash } = hands;
  const { file } = made;
  const may = canDo("settings");
  // Files' own line for the newest post that is up on Instagram, for its door to the post: a story set for later since keeps
  // it (Ruben, 12 Nov 2026: See it went missing once one was).
  const upOnInstagram = record.instagram?.posts.find((p) => p.status === "published") ?? null;
  return {
    google: record.posted ? (
      <PostOnGoogle
        id={file.id}
        posted={record.posted}
        may={may}
        saidDown={() => {
          record.setPosted(null);
          reread();
        }}
        flash={flash}
      />
    ) : null,
    instagram: upOnInstagram ? <PostOnInstagram post={upOnInstagram} /> : null,
  };
}

/** The open piece, holding its record, its presses and its drafts (piece-presses.tsx). */
export function ContentPiece({
  made,
  held,
  beside,
  phone,
  over,
  post,
  onClose,
  open,
  reread,
  flash,
}: {
  made: ContentMadeDto;
  /** The made pieces the page holds, in its order: the next two are read ahead. */
  held: readonly ContentMadeDto[];
  beside: PieceBeside;
  phone: boolean;
  over: boolean;
  /** Opened straight to its sheet (Post it): the way in from what stopped or waits, where each place says why and what to do. */
  post: boolean;
  onClose: () => void;
  /** Open another piece, by its file. */
  open: (id: string) => void;
  /** Read again what the page shows, after a change: Made, and the Library where the piece was opened from it. */
  reread: () => void;
  flash: (f: FrameFlash) => void;
}) {
  const { file } = made;
  // Read again as the page says its posts moved (one landed, one stopped), so the sheet says what the tile says.
  const record = usePostRecord(file, made.posts.map((p) => `${p.id}:${p.status}`).join());
  const hands: PieceHands = { made, record, reread, open, onClose, flash };
  const at = usePiecePosts(made, record);
  const { posts, takes } = at;
  const presses = usePiecePresses(hands, posts);
  const drafts = usePieceDrafts(hands, at, presses);
  useEffect(() => readAhead(held, file.id), [held, file.id]);
  // Its sheet, once its record is read, and once only: closed, it stays closed while the piece is open.
  const begun = useRef(false);
  const both = drafts.both;
  useEffect(() => {
    if (!post || begun.current || !both.ready) return;
    begun.current = true;
    both.begin();
  }, [post, both]);
  // Where its owner said they posted it themselves: the page's, or its record's where the piece was read on its own.
  const byHand = made.by_hand ?? null;
  const shown = {
    made: { file, posts, by_hand: byHand },
    byHand: byHandPressOf(byHand, presses.change, flash),
    record: { made: record.made, video: record.video },
    takes,
    may: canDo("settings"),
    beside,
    presses,
    drafts,
    acts: pieceActsOf({ ...hands, beside }, { drafts, presses }),
    doors: postedDoorsOf(hands),
  };
  // A phone opens the canvas's viewer, full screen and dark, in the split's open slot; a desk the pane beside the grid.
  return phone ? <PieceViewer hands={shown} over={over} /> : <PieceDesk hands={shown} over={over} />;
}
