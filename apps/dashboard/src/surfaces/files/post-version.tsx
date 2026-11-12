/**
 * A new version of a kept post (decision 0099, step 3), in its sheet: it starts from what the post was asked to be, changes as a card
 * does, for nothing, and Save keeps another file. The one it came from stays: a person who liked that one still has it. Save waits for
 * a change, since the same picture kept twice is the one file. Its press stands in the sheet's foot, which holds still under what
 * scrolls, so the sheet holds the draft and draws the two parts.
 */
import { useState } from "react";
import { POST_SHAPES, postPlanOf, postPlanTidied, postWordsIn, type PostPlan } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Press } from "../kit/press";
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
    saved(r.data.file_id, says.savedNew(r.data.name));
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

/**
 * What the sheet's body draws: the picture, its shapes, and what changes it. `looks` off leaves its words alone to change by
 * hand (Content's Change it, where how it looks is asked of Ask: post-edit.tsx), and `fold` folds an empty line above or below
 * behind its own press. `shapes` off draws the picture the post is, larger, and no choice of shape: what is saved is the post
 * in every shape, each drawn where it goes (a post on Instagram 4:5, a story 9:16, Google 4:3), so a shape chosen here only
 * looked like a choice (Ruben, 12 Nov 2026). What saving does to the first is the toast's to say once saved (`saved`).
 */
export function PostVersion({
  version,
  looks = true,
  fold = false,
  shapes = true,
}: {
  version: PostVersionDraft;
  looks?: boolean;
  fold?: boolean;
  shapes?: boolean;
}) {
  const { draft, says, note } = version;
  const frame = (
    <PostFrame
      src={draft.picture}
      shape={draft.shape}
      alt={draft.plan.line}
      waiting={draft.plan.line}
      drawing={draft.drawing && !!draft.picture}
    />
  );
  return (
    <div className="post-version" data-one-shape={shapes ? undefined : ""} data-testid="post-version">
      {/* Tapped, the picture as it is drawn now opens full size in a tab of its own (Ruben, 12 Nov 2026: a person reaches for it). */}
      {shapes || !draft.picture ? (
        frame
      ) : (
        <Press
          className="post-frame-press"
          href={draft.picture}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={says.full}
          data-testid="post-frame-press"
        >
          {frame}
        </Press>
      )}
      {shapes ? (
        <PostChoice
          label={says.shapesSaid}
          options={POST_SHAPES}
          words={says.shapes}
          value={draft.shape}
          choose={draft.choose}
          testid="post-shape"
        />
      ) : null}
      <PostEdit draft={draft} says={says} looks={looks} fold={fold} />
      {note ? (
        <p className="post-said" role="alert" data-testid="post-refused">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * What the sheet's foot draws: Save as new and Cancel; `alone`, Save as new by itself, wide and filled, where the sheet's own
 * Close lets the draft go (Content's Change it, as its other drafts end on their one press).
 */
export function PostVersionActs({
  version,
  alone = false,
  label,
}: {
  version: PostVersionDraft;
  alone?: boolean;
  /** The press's word where it is not a new one beside the first (Content's Save, where the change takes its place). */
  label?: string;
}) {
  const { says, busy, canSave, save, cancel } = version;
  if (alone)
    return (
      <div className="cnv-acts" data-foot-acts="">
        <Button
          variant="primary"
          className="cnv-lead"
          onClick={save}
          disabled={!canSave}
          aria-busy={busy}
          data-testid="post-save-new"
        >
          {label ?? says.saveNew}
        </Button>
      </div>
    );
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
