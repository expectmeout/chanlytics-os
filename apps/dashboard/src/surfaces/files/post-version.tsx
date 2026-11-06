/**
 * A new version of a kept post (decision 0099, step 3), in its sheet: it starts from what the post was asked to be, changes as a card
 * does, for nothing, and Save keeps another file. The one it came from stays: a person who liked that one still has it. Save waits for
 * a change, since the same picture kept twice is the one file.
 */
import { useState } from "react";
import { POST_SHAPES, postPlanTidied, postWordsIn, type PostPlan } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { PostChoice } from "./post-choice";
import { usePostDraft } from "./post-draft";
import { wordsKeyOf } from "./post-drawn";
import { PostEdit } from "./post-edit";
import { PostFrame } from "./post-frame";
import { fileVerbs } from "./verbs";

export function PostVersion({
  plan,
  close,
  saved,
}: {
  plan: PostPlan;
  close: () => void;
  saved: (id: string, words: string) => void;
}) {
  const draft = usePostDraft(plan, true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const says = postWordsIn(draft.plan.language);
  const hasLine = draft.plan.line.trim() !== "";
  const changed = wordsKeyOf(draft.plan) !== wordsKeyOf(plan);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.savePost(postPlanTidied(draft.plan));
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    saved(r.data.file_id, says.saved(r.data.name));
  };
  const note = problem ?? draft.refused ?? (hasLine ? null : says.needsLine);
  return (
    <div className="post-version" data-testid="post-version">
      <PostFrame
        src={draft.picture}
        shape={draft.shape}
        alt={draft.plan.line}
        waiting={draft.plan.line}
        drawing={draft.drawing && !!draft.picture}
      />
      <PostChoice
        label={says.shapesSaid}
        options={POST_SHAPES}
        words={says.shapes}
        value={draft.shape}
        choose={draft.choose}
        testid="post-shape"
      />
      <PostEdit draft={draft} says={says} />
      {note ? (
        <p className="post-said" role="alert" data-testid="post-refused">
          {note}
        </p>
      ) : null}
      <div className="post-acts">
        <Button
          onClick={() => void save()}
          disabled={busy || !changed || !hasLine || draft.refused !== null}
          data-testid="post-save-new"
        >
          {says.saveNew}
        </Button>
        <Button variant="quiet" onClick={close} disabled={busy} data-testid="post-version-cancel">
          {says.cancel}
        </Button>
      </div>
    </div>
  );
}
