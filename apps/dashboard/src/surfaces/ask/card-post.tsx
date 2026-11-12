/**
 * A post's card (decision 0099, step 3): the real picture, drawn by the server from the same plan its Save keeps, so what the owner
 * sees is what they get. Whoever may save it can change its words here, for nothing, and the picture answers as they type. Saved, it
 * is the file itself, and the picture they were looking at stays on screen: nothing is read again to show what is already there.
 *
 * Its words alone are changed by hand (Ruben, 12 Nov 2026): no choice of shape, which only looked like one (every place draws its
 * own: a post 4:5, a story 9:16, Google 4:3), and no rows of type and layout to pick from; how it looks is Ask's, and asked of it
 * in words, as Content's Change it is.
 */
import { useState } from "react";
import {
  postNameOf,
  postPlanOf,
  postPlanTidied,
  postWordsIn,
  recordOrNull,
  type AskProposal,
  type PostPlan,
} from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { openFile } from "../files/file-asked";
import { usePostDraft } from "../files/post-draft";
import { drawnKeyOf, pictureDrawn } from "../files/post-drawn";
import { PostEdit } from "../files/post-edit";
import { PostFrame } from "../files/post-frame";
import { PostActs, postShapeAddress } from "../files/post-shapes";
import { canDo } from "./shell";
import type { LineWords } from "./words";

/** The file a card made, once it is saved. */
const fileSavedBy = (p: AskProposal): string | null =>
  p.outcome?.state === "done" ? (p.outcome.made?.id ?? null) : null;

/** The card as a press sends it and its head says it: what was changed here, over what Ask proposed. */
function asChanged(p: AskProposal, plan: PostPlan): AskProposal {
  // While the headline is empty the head says what it did: a card is never called nothing.
  const title = plan.line.trim() ? postWordsIn(plan.language).cardTitle(plan.line.trim()) : p.title;
  return { ...p, title, payload: { ...p.payload, ...postPlanTidied(plan) } };
}

/** The plan a card stands for: what its press saved, where it has been pressed, else what Ask proposed. */
const planOfCard = (p: AskProposal): PostPlan => postPlanOf(recordOrNull(p.outcome?.undo?.plan) ?? p.payload);

/** What a post's card holds for its AskCard: its draft, and what the press sends and may do. Null for any other kind of card. */
export function usePostCard(p: AskProposal) {
  const isPost = p.kind === "post";
  const draft = usePostDraft(planOfCard(p), isPost && !fileSavedBy(p));
  if (!isPost) return null;
  const says = postWordsIn(draft.plan.language);
  return {
    draft,
    says,
    card: asChanged(p, draft.plan),
    press: { label: says.save, disabled: !draft.plan.line.trim() || draft.refused !== null },
  };
}

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
  const kept = fileSavedBy(p);
  const [editing, setEditing] = useState(false);
  const [unseen, setUnseen] = useState(false);
  // Saved, what this tab drew of exactly these words is the same picture, so it stays on screen and none is read again.
  const src = kept
    ? (pictureDrawn(drawnKeyOf(draft.plan, draft.shape))?.url ?? postShapeAddress(kept, draft.shape))
    : draft.picture;
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
      {!kept && canDo("settings") ? (
        <div className="post-row">
          <Button
            size="sm"
            variant="quiet"
            aria-expanded={editing}
            onClick={() => setEditing((e) => !e)}
            data-testid="post-edit-open"
          >
            {editing ? says.editDone : says.edit}
          </Button>
        </div>
      ) : null}
      {open ? <PostEdit draft={draft} says={says} looks={false} fold /> : null}
      {!kept && (draft.refused || !draft.plan.line.trim()) ? (
        <p className="ask-card-note" role="alert" data-testid="post-refused">
          {draft.refused ?? says.needsLine}
        </p>
      ) : null}
      {kept && !unseen ? (
        <PostActs id={kept} name={postNameOf(draft.plan.line)} shape={draft.shape} says={says}>
          <Button size="sm" variant="quiet" onClick={() => openFile(kept, onNav)} data-testid="post-open-files">
            {says.openInContent}
          </Button>
        </PostActs>
      ) : null}
    </div>
  );
}
