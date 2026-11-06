/**
 * A new version of a kept post (decision 0099, step 3), in its sheet: it starts from what the post was asked to be, changes as a card
 * does, for nothing, and Save keeps another file. The one it came from stays: a person who liked that one still has it. Save waits for
 * a change, since the same picture kept twice is the one file. Its press stands in the sheet's foot, which holds still under what
 * scrolls, so the sheet holds the draft and draws the two parts.
 */
import { useState } from "react";
import { POST_SHAPES, postPlanOf, postPlanTidied, postWordsIn, type PostPlan } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { PostChoice } from "./post-choice";
import { usePostDraft } from "./post-draft";
import { wordsKeyOf } from "./post-drawn";
import { PostEdit } from "./post-edit";
import { PostFrame } from "./post-frame";
import { fileVerbs } from "./verbs";

/** Nothing asked yet: a sheet holds a draft from the moment it opens, and draws nothing until it is begun. */
const NOTHING_ASKED = postPlanOf({});

/** The draft of a new version, for the sheet. `saved` hands over the new file and the words that say so. */
export function usePostVersion(saved: (id: string, words: string) => void) {
  const [from, setFrom] = useState<PostPlan | null>(null);
  const draft = usePostDraft(NOTHING_ASKED, from !== null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const says = postWordsIn(draft.plan.language);
  const hasLine = draft.plan.line.trim() !== "";
  const changed = !!from && wordsKeyOf(draft.plan) !== wordsKeyOf(from);
  const save = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.savePost(postPlanTidied(draft.plan));
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    saved(r.data.file_id, says.saved(r.data.name));
  };
  return {
    draft,
    says,
    busy,
    open: from !== null,
    canSave: changed && hasLine && !busy && draft.refused === null,
    note: problem ?? draft.refused ?? (hasLine ? null : says.needsLine),
    begin: (plan: PostPlan) => {
      draft.change(plan);
      setFrom(plan);
    },
    cancel: () => {
      setProblem(null);
      setFrom(null);
    },
    save: () => void save(),
  };
}

type PostVersionDraft = ReturnType<typeof usePostVersion>;

/** What the sheet's body draws: the picture, its shapes, and what changes it. */
export function PostVersion({ version }: { version: PostVersionDraft }) {
  const { draft, says, note } = version;
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
    </div>
  );
}

/** What the sheet's foot draws. */
export function PostVersionActs({ version }: { version: PostVersionDraft }) {
  const { says, busy, canSave, save, cancel } = version;
  return (
    <div className="files-acts" data-foot-acts="">
      <Button onClick={save} disabled={!canSave} data-testid="post-save-new">
        {says.saveNew}
      </Button>
      <Button variant="quiet" onClick={cancel} disabled={busy} data-testid="post-version-cancel">
        {says.cancel}
      </Button>
    </div>
  );
}
