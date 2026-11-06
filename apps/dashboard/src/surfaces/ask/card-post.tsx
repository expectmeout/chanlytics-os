/**
 * A post's card (decision 0099, step 3): the real picture, drawn by the server from the same plan its Save keeps, so what the owner
 * sees is what they get. Whoever may save it can change it here, for nothing, and the picture answers as they type. Saved, it is the
 * file itself, and the picture they were looking at stays on screen: nothing is read again to show what is already there.
 */
import { useState } from "react";
import {
  POST_SHAPES,
  postNameOf,
  postPlanOf,
  postWordsIn,
  type AskProposal,
  type PostPlan,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { PostChoice } from "../files/post-choice";
import { usePostDraft, type PostDraft } from "../files/post-draft";
import { PostEdit } from "../files/post-edit";
import { PostFrame } from "../files/post-frame";
import { PostActs, postShapeAddress } from "../files/post-shapes";
import { canDo } from "./shell";
import type { LineWords } from "./words";

/** The file a card made, once it is saved. */
const keptOf = (p: AskProposal): string | null => (p.outcome?.state === "done" ? (p.outcome.made?.id ?? null) : null);

/** The card as a press sends it and its head says it: what was changed here, over what Ask proposed. */
function asChanged(p: AskProposal, plan: PostPlan): AskProposal {
  return { ...p, title: postWordsIn(plan.language).cardTitle(plan.line), payload: { ...p.payload, ...plan } };
}

/** What a post's card holds for its AskCard: its draft, and what the press sends and may do. Null for any other kind of card. */
export function usePostCard(p: AskProposal) {
  const isPost = p.kind === "post";
  const draft = usePostDraft(postPlanOf(p.payload), isPost && !keptOf(p));
  if (!isPost) return null;
  const says = postWordsIn(draft.plan.language);
  return {
    draft,
    says,
    card: asChanged(p, draft.plan),
    press: { label: says.save, disabled: !draft.plan.line.trim() || draft.refused !== null },
  };
}

/** What a kept card shows of a shape: the picture on screen for the one it drew, its own file for the rest. */
const keptPicture = (kept: string, draft: PostDraft, unsaved: string | null): string =>
  draft.shape === "portrait" && unsaved ? unsaved : postShapeAddress(kept, draft.shape);

/** The card's picture and what a person does with it: changes it before the press, takes it away after. */
export function AskPostCard({
  p,
  card,
  t,
  onNav,
}: {
  p: AskProposal;
  card: NonNullable<ReturnType<typeof usePostCard>>;
  t: LineWords;
  onNav: (to: string) => void;
}) {
  const { draft, says } = card;
  const kept = keptOf(p);
  const [editing, setEditing] = useState(false);
  const [unseen, setUnseen] = useState(false);
  // The portrait this card drew, held for the press: saved, it is the same picture, so none is read again.
  const [drewPortrait, setDrewPortrait] = useState<string | null>(null);
  if (!kept && draft.shape === "portrait" && draft.picture && !draft.drawing && draft.picture !== drewPortrait)
    setDrewPortrait(draft.picture);
  const src = kept ? keptPicture(kept, draft, drewPortrait) : draft.picture;
  const alt = draft.plan.line || p.title;
  const open = !kept && editing;
  return (
    <div className="ask-post" data-testid="ask-post" data-editing={open ? "true" : undefined}>
      {unseen ? (
        <p className="post-said" data-testid="post-gone">
          {says.gone}
        </p>
      ) : draft.undrawn && !src ? (
        <p className="ask-card-note" data-testid="ask-post-failed">
          {says.notDrawn}
        </p>
      ) : (
        <PostFrame
          src={src}
          shape={draft.shape}
          alt={alt}
          waiting={t.postDrawing}
          drawing={draft.drawing && !!draft.picture}
          onUnseen={() => setUnseen(true)}
        />
      )}
      <p className="ask-card-summary">{p.summary}</p>
      <div className="post-row">
        <PostChoice
          label={says.shapesSaid}
          options={POST_SHAPES}
          words={says.shapes}
          value={draft.shape}
          choose={draft.choose}
          testid="post-shape"
        />
        {!kept && canDo("settings") ? (
          <Button
            size="sm"
            variant="quiet"
            aria-expanded={editing}
            onClick={() => setEditing((e) => !e)}
            data-testid="post-edit-open"
          >
            {editing ? says.editDone : says.edit}
          </Button>
        ) : null}
      </div>
      {open ? <PostEdit draft={draft} says={says} /> : null}
      {!kept && (draft.refused || !draft.plan.line.trim()) ? (
        <p className="ask-card-note" role="alert" data-testid="post-refused">
          {draft.refused ?? says.needsLine}
        </p>
      ) : null}
      {kept && !unseen ? (
        <PostActs id={kept} name={postNameOf(draft.plan.line)} shape={draft.shape} says={says}>
          <Button
            size="sm"
            variant="quiet"
            onClick={() => onNav(`admin/files?do=file:${kept}`)}
            data-testid="post-open-files"
          >
            {says.openInFiles}
          </Button>
        </PostActs>
      ) : null}
    </div>
  );
}
