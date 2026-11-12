/**
 * A post's words and look, changed where it stands (decision 0099, step 3): free, since code draws it, and the picture answers as
 * they are typed (post-draft.ts). No Base UI: Ask rides on every page, and the kit's Field and Segmented would ride with it. The box is
 * the kit's LineField, which grows with its words, and what is chosen is the kit's Button (`PostChoice`).
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { POST_LAYOUTS, POST_LIMITS, POST_VOICES, type PostPlan, type PostWords } from "@chanlytics/contracts";
import { Icon } from "../kit/icon/icon";
import { LineField } from "../kit/line/line";
import { PostChoice } from "./post-choice";
import type { PostDraft } from "./post-draft";
import { Button } from "../kit/button/button";

const WORDS_AT: readonly PostPlan["words_at"][] = ["top", "bottom"];

/** A line of a post is one line: Return ends the typing, on a phone as at a desk. */
const endsOnReturn = (e: KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  e.currentTarget.blur();
};

/** One line of words, in a box that grows with them: a post's, and a made video's (campaigns/content/video-again.tsx). */
export function PostSay({
  label,
  value,
  limit,
  change,
  testid,
  opensFocused = false,
}: {
  label: string;
  value: string;
  limit: number;
  change: (words: string) => void;
  testid: string;
  /** Takes the keys as it appears: a line opened by its own press (PostEdit `fold`). */
  opensFocused?: boolean;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (opensFocused) box.current?.focus();
  }, [opensFocused]);
  return (
    <label className="post-say">
      <span className="post-say-label">{label}</span>
      <LineField
        ref={box}
        className="post-say-box"
        rows={1}
        value={value}
        maxLength={limit}
        enterKeyHint="done"
        onChange={(e) => change(e.currentTarget.value.replace(/\s*\n\s*/g, " "))}
        onKeyDown={endsOnReturn}
        data-testid={testid}
      />
    </label>
  );
}

/** The two lines a post may say besides its headline. */
type PostSide = "over" | "under";
const SIDES: readonly PostSide[] = ["over", "under"];

/**
 * What a person changes: the words on the picture, and, where `looks` is on, how they stand with it (the layout, the type,
 * which end, the band with the number). Content's Change it draws the words alone (Ruben, 12 Nov 2026: no rows of presets):
 * how a post looks is Ask's to choose, as it chose it when it made the post, asked in a sentence under the words. Where it
 * folds (`fold`, Content's), a line above or below left empty waits behind a small press of its own, which opens it with the
 * keys in it, so a post with a headline alone shows one box, not three.
 */
export function PostEdit({
  draft,
  says,
  looks = true,
  fold = false,
}: {
  draft: PostDraft;
  says: PostWords;
  looks?: boolean;
  fold?: boolean;
}) {
  const { plan, change } = draft;
  const [opened, setOpened] = useState<Record<PostSide, boolean>>({ over: false, under: false });
  const shows = (side: PostSide) => !fold || opened[side] || !!plan[side];
  const folded = SIDES.filter((side) => !shows(side));
  return (
    <div className="post-edit" data-testid="post-edit">
      <PostSay
        label={says.line}
        value={plan.line}
        limit={POST_LIMITS.line}
        change={(line) => change({ line })}
        testid="post-line"
      />
      {SIDES.filter(shows).map((side) => (
        <PostSay
          key={side}
          label={says[side]}
          value={plan[side] ?? ""}
          limit={POST_LIMITS[side]}
          change={(words) => change({ [side]: words })}
          opensFocused={fold && opened[side]}
          testid={`post-${side}`}
        />
      ))}
      {folded.length > 0 ? (
        <div className="post-adds">
          {folded.map((side) => (
            <Button
              key={side}
              size="sm"
              variant="quiet"
              onClick={() => setOpened((was) => ({ ...was, [side]: true }))}
              data-testid={`post-add-${side}`}
            >
              <Icon name="plus" size={12} />
              {side === "over" ? says.addOver : says.addUnder}
            </Button>
          ))}
        </div>
      ) : null}
      {looks ? <PostLooks draft={draft} says={says} /> : null}
    </div>
  );
}

/** How the words stand with the picture: the layout, the type, which end, and the band with the business's number. */
function PostLooks({ draft, says }: { draft: PostDraft; says: PostWords }) {
  const { plan, change, hasPhone } = draft;
  return (
    <>
      <PostChoice
        label={says.layoutSaid}
        options={POST_LAYOUTS}
        words={says.layouts}
        value={plan.layout}
        choose={(layout) => change({ layout })}
        testid="post-layout"
        said
      />
      <PostChoice
        label={says.voiceSaid}
        options={POST_VOICES}
        words={says.voices}
        value={plan.voice}
        choose={(voice) => change({ voice })}
        testid="post-voice"
        said
      />
      <PostChoice
        label={says.wordsAtSaid}
        options={WORDS_AT}
        words={says.wordsAt}
        value={plan.words_at}
        choose={(words_at) => change({ words_at })}
        testid="post-at"
        said
      />
      {hasPhone ? (
        <div className="post-choose">
          <span className="post-choose-said">{says.band}</span>
          <Button
            size="sm"
            variant={plan.book ? "soft" : "quiet"}
            aria-pressed={plan.book}
            onClick={() => change({ book: !plan.book })}
            data-testid="post-book"
          >
            {plan.book ? says.bandOn : says.bandOff}
          </Button>
        </div>
      ) : null}
    </>
  );
}
