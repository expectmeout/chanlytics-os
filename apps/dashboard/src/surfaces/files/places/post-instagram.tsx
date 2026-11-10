/**
 * A made post on its way to the business's Instagram (decision 0121), from its sheet: as a post or a story, the picture as it
 * goes, the caption that goes with a post, and one press a person makes, which is the approval. The post goes up a minute or two
 * later, after a recheck right before the send, so the sheet says where it stands as it moves, and Don't post stops it until
 * then. Offered only where the workspace's Instagram takes a post now: a press that can't work isn't offered.
 */
import { useEffect, useState } from "react";
import {
  INSTAGRAM_POST_KINDS,
  ON_INSTAGRAM,
  POST_ON_ITS_WAY,
  POST_PULLABLE,
  SECOND_MS,
  postCaptionProblem,
  postSentencesOf,
  type FileRecordDto,
  type InstagramPostKind,
  type PostDto,
  type PostPlan,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { LineField } from "../../kit/line/line";
import type { FrameFlash } from "../../frame-verbs";
import { PostChoice } from "../post-choice";
import { PostFrame } from "../post-frame";
import { postShapeAddress } from "../post-shapes";
import { fileVerbs } from "../verbs";

/**
 * How often a post on its way is read again, and for how long. It goes up within a couple of minutes, so it is read every
 * five seconds for two; one Instagram never answered is settled some minutes later (asked two minutes on, then one more
 * try), so it is read on every fifteen for seven more.
 */
const POST_READ_AGAIN_MS = 5 * SECOND_MS;
const POST_READ_SLOWER_MS = 15 * SECOND_MS;
const READS_QUICK = 24;
const READS_AT_MOST = READS_QUICK + 28;

/** What goes with the post to begin with: what the picture says, as sentences a person can change. */
const captionToBeginWith = (plan: PostPlan | null): string => (plan ? postSentencesOf([plan.line, plan.under]) : "");

/** The draft of a post on its way to Instagram, for the sheet: its body and its foot both draw from it. */
export function usePostInstagram(id: string, plan: PostPlan | null, sent: () => void, flash: (f: FrameFlash) => void) {
  const [caption, setCaption] = useState<string | null>(null);
  const [as, setAs] = useState<InstagramPostKind>("picture");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = caption?.trim() ?? "";
  const captionSays = as === "story" ? null : clean ? postCaptionProblem(clean) : ON_INSTAGRAM.captionNeeded;
  const send = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.postToInstagram(id, as, clean);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setCaption(null);
    flash({ msg: <>{ON_INSTAGRAM.sent}</> });
    sent();
  };
  return {
    open: caption !== null,
    id,
    as,
    caption: caption ?? "",
    busy,
    note: problem ?? captionSays,
    canSend: !busy && captionSays === null,
    begin: () => setCaption(captionToBeginWith(plan)),
    cancel: () => {
      setProblem(null);
      setCaption(null);
    },
    choose: setAs,
    write: setCaption,
    send: () => void send(),
  };
}

type PostInstagramDraft = ReturnType<typeof usePostInstagram>;

/** The sheet's body: how it goes, the picture as it goes, and its caption. The pictures are the post's own, already kept. */
export function PostInstagram({ draft, alt }: { draft: PostInstagramDraft; alt: string }) {
  const shape = draft.as === "story" ? "story" : "portrait";
  return (
    <div className="post-version" data-testid="post-instagram">
      <PostChoice
        label={ON_INSTAGRAM.asWhat}
        options={INSTAGRAM_POST_KINDS}
        words={{ picture: ON_INSTAGRAM.asPicture, story: ON_INSTAGRAM.asStory }}
        value={draft.as}
        choose={draft.choose}
        testid="post-instagram-as"
      />
      <PostFrame src={postShapeAddress(draft.id, shape)} shape={shape} alt={alt} waiting={alt} />
      {draft.as === "story" ? (
        <p className="post-said">{ON_INSTAGRAM.storyNoCaption}</p>
      ) : (
        <label className="post-say">
          <span className="post-say-label">{ON_INSTAGRAM.caption}</span>
          <LineField
            className="post-say-box post-say-long"
            rows={4}
            value={draft.caption}
            onChange={(e) => draft.write(e.currentTarget.value)}
            data-testid="post-instagram-caption"
          />
        </label>
      )}
      {draft.note ? (
        <p className="post-said" role="alert" data-testid="post-instagram-note">
          {draft.note}
        </p>
      ) : null}
    </div>
  );
}

/** The sheet's foot. */
export function PostInstagramActs({ draft }: { draft: PostInstagramDraft }) {
  return (
    <div className="files-acts" data-foot-acts="">
      <Button onClick={draft.send} disabled={!draft.canSend} data-testid="post-instagram-send">
        {ON_INSTAGRAM.send}
      </Button>
      <Button variant="quiet" onClick={draft.cancel} disabled={draft.busy} data-testid="post-instagram-cancel">
        {ON_INSTAGRAM.cancel}
      </Button>
    </div>
  );
}

/**
 * The sheet's Instagram half: the draft, the newest post there (read again while it is on its way), and whether a press may
 * begin one now. A second press while one is on its way would be the first, so the press waits for it to settle.
 */
export function useSheetInstagram(
  id: string,
  record: { plan: PostPlan | null; instagram: FileRecordDto["instagram"]; reread: () => void },
  flash: (f: FrameFlash) => void,
) {
  const newest = record.instagram?.posts[0] ?? null;
  useReadWhileOnItsWay(newest, record.reread);
  const draft = usePostInstagram(id, record.plan, record.reread, flash);
  const free = record.instagram?.can === "yes" && !(newest && POST_ON_ITS_WAY.includes(newest.status));
  return { draft, newest, free };
}

/**
 * A post on its way is read again until it settles, so the sheet says it went up without a reload. The count is the post's
 * own: the next post on its way starts from none, however long the one before it took.
 */
export function useReadWhileOnItsWay(post: PostDto | null, reread: () => void): void {
  const onItsWay = post !== null && POST_ON_ITS_WAY.includes(post.status);
  const postId = post?.id ?? null;
  const [read, setRead] = useState<{ of: string | null; times: number }>({ of: postId, times: 0 });
  const times = read.of === postId ? read.times : 0;
  useEffect(() => {
    if (!onItsWay || times >= READS_AT_MOST) return undefined;
    const timer = setTimeout(
      () => {
        setRead({ of: postId, times: times + 1 });
        reread();
      },
      times < READS_QUICK ? POST_READ_AGAIN_MS : POST_READ_SLOWER_MS,
    );
    return () => clearTimeout(timer);
  }, [onItsWay, postId, times, reread]);
}

/** Where the newest post to Instagram stands: on its way, up (with where to see it), held or not posted, and why. */
export function PostOnInstagram({
  id,
  post,
  may,
  pulled,
  flash,
}: {
  id: string;
  post: PostDto;
  /** Whether this person may stop it: a reader sees where it stands, and nothing dead to press. */
  may: boolean;
  pulled: () => void;
  flash: (f: FrameFlash) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const stop = async () => {
    setBusy(true);
    const r = await fileVerbs.pullFromInstagram(id, post.id);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    flash({ msg: <>{ON_INSTAGRAM.pulledFlash}</> });
    pulled();
  };
  const reason = post.status === "held" ? post.held_reason : post.status === "failed" ? post.error : null;
  return (
    <>
      <div className="files-made-from" data-testid="post-on-instagram" data-status={post.status}>
        <span className="files-from">
          {ON_INSTAGRAM.status[post.status]}, {ON_INSTAGRAM.kind[post.kind]}
        </span>
        {post.status === "published" && post.permalink ? (
          <Button
            size="sm"
            variant="quiet"
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            data-testid="post-instagram-see"
          >
            {ON_INSTAGRAM.see}
          </Button>
        ) : null}
        {may && POST_PULLABLE.includes(post.status) ? (
          <Button
            size="sm"
            variant="quiet"
            onClick={() => void stop()}
            disabled={busy}
            data-testid="post-instagram-pull"
          >
            {ON_INSTAGRAM.pull}
          </Button>
        ) : null}
      </div>
      {reason || problem ? (
        <p className="post-said" role="alert" data-testid="post-instagram-why">
          {problem ?? reason}
        </p>
      ) : null}
    </>
  );
}
