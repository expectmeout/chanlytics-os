/**
 * A post's words and look, changed where it stands (decision 0099, step 3): free, since code draws it, and the picture answers as
 * they are typed (post-draft.ts). No Base UI: Ask rides on every page, and the kit's Field and Segmented would ride with it. The box is
 * the kit's LineField, which grows with its words, and what is chosen is the kit's Button (`PostChoice`).
 */
import type { KeyboardEvent } from "react";
import { POST_LAYOUTS, POST_LIMITS, POST_VOICES, type PostPlan, type PostWords } from "@chanlytics/contracts";
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

function PostSay({
  label,
  value,
  limit,
  change,
  testid,
}: {
  label: string;
  value: string;
  limit: number;
  change: (words: string) => void;
  testid: string;
}) {
  return (
    <label className="post-say">
      <span className="post-say-label">{label}</span>
      <LineField
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

/** What a person changes. `open` is its fold: it is drawn only while open, so nothing of it is in the way of a key. */
export function PostEdit({ draft, says }: { draft: PostDraft; says: PostWords }) {
  const { plan, change, hasPhone } = draft;
  return (
    <div className="post-edit" data-testid="post-edit">
      <PostSay
        label={says.line}
        value={plan.line}
        limit={POST_LIMITS.line}
        change={(line) => change({ line })}
        testid="post-line"
      />
      <PostSay
        label={says.over}
        value={plan.over ?? ""}
        limit={POST_LIMITS.over}
        change={(over) => change({ over })}
        testid="post-over"
      />
      <PostSay
        label={says.under}
        value={plan.under ?? ""}
        limit={POST_LIMITS.under}
        change={(under) => change({ under })}
        testid="post-under"
      />
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
    </div>
  );
}
