/**
 * A proposal the assistant made, as a card, and cards side by side, one open at a time; a plan of Ask's as one card is
 * plan-card.tsx's. The parts are card-parts.tsx's; what a card may do is decided by its contract (askCalls(): the card's verb and
 * its undo), and this file holds what became of it.
 */
import { useState, type RefObject } from "react";
import {
  askTraitsOf,
  holdsAlike,
  openCardOf,
  postPublishOf,
  searchCardView,
  type AskProposal,
  type AskProposalOutcome,
  type SearchCardView,
} from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import { Button } from "../kit/button/button";
import { LinePress } from "../kit/line/line";
import { AskPieceCard, usePieceCard } from "./card-piece";
import { AskPublishCard } from "./card-publish";
import { AskPostCard, usePostCard } from "./card-post";
import { useFolderCard, type FolderCard } from "../files/footage/ask-card";
import {
  mayPressCard,
  AskCardActs,
  AskCardChange,
  AskCardHead,
  AskCardReceipt,
  AskRing,
  AskSheet,
  type CardFold,
} from "./card-parts";
import { AT_NO_STEP, useCardPress, type CardStep, type OnOutcome } from "./card-press";
import { settingsVersion } from "./shell";
import type { LineWords } from "./words";

/** Whether a card's undo is still true (contracts askUndoOpen): a reply until its cancel window closes, settings while nobody has saved since, anything else for ten minutes. */
const atUndoOpen = (
  askApi: AskApi | undefined,
  p: AskProposal,
  { state, undoData, doneAt }: { state: string; undoData: AskProposalOutcome["undo"]; doneAt: number },
) => {
  const version = settingsVersion();
  return (
    state === "done" &&
    !!undoData &&
    !!p.undo &&
    !!(askApi && askApi.undoOpen && askApi.undoOpen(p.kind, undoData, doneAt, Date.now(), version))
  );
};

// A search's card, read (contracts leads/search/card.ts, through the Line's LeadCards): what it finds as rows,
// the line under them, and where its people come from, folded, for a people search. A change is said to Ask; the press
// is the card's.
const AskSearchCard = ({ lead, t, alike }: { lead: SearchCardView; t: LineWords; alike: readonly string[] }) => (
  <>
    <div className="panel panel-inset ask-job-change">
      <AskSheet sheet={lead.sheet} alike={alike} />
    </div>
    <p className="ask-job-foot" data-testid="ask-card-facts">
      {lead.foot}
    </p>
    {lead.source ? (
      <details className="ask-job-foot" data-testid="ask-card-source">
        <summary>{t.whereFrom}</summary>
        {lead.source}
      </details>
    ) : null}
  </>
);
/**
 * A public card on its clock (a reply on Google, a post put up): its end sends it, and Undo clears it. A clock only runs
 * in the tab that pressed, so it is the card's foot, in reach where the press was (`data-foot`, ask.css).
 */
const AskPosting = ({
  posting,
  said,
  t,
  landRef,
  onEnd,
  onUndo,
}: {
  posting: { from: number; until: number };
  said: string;
  t: LineWords;
  landRef: RefObject<HTMLDivElement | null>;
  onEnd: () => void;
  onUndo: () => void;
}) => (
  <div className="ask-told" role="status" data-foot="told">
    <div className="ask-job-receipt ask-landing" tabIndex={-1} ref={landRef} data-testid="ask-card-posting">
      <AskRing from={posting.from} until={posting.until} onDone={onEnd} />
      <span className="ask-job-said">{said}</span>
      <Button variant="quiet" size="sm" className="ask-job-undo" onClick={onUndo}>
        {t.undo}
      </Button>
    </div>
  </div>
);

/** Under what became of a card: why it was allowed to go alone (D33), and where what stopped it is fixed (D37). */
const AskCardAfter = ({
  p,
  state,
  err,
  forward,
  t,
  onNav,
}: {
  p: AskProposal;
  state: AskProposalOutcome["state"] | "idle";
  err: string;
  forward: { to: string } | null;
  t: LineWords;
  onNav: (to: string) => void;
}) => {
  const why = p.outcome?.why ?? null;
  return (
    <>
      {err && state === "done" ? <div className="ask-job-note">{err}</div> : null}
      {why && state === "done" ? (
        <p className="ask-job-foot" data-testid="ask-card-why">
          {t.whyAlone(why.reason, why.row)}{" "}
          <LinePress kind="words" onClick={() => onNav("admin/autonomy")}>
            {t.whyChange}
          </LinePress>
        </p>
      ) : null}
      {forward && state === "failed" ? (
        <div className="ask-job-actions">
          <Button variant="quiet" size="sm" onClick={() => onNav(forward.to)} data-testid="ask-card-forward">
            {t.fixIt}
          </Button>
        </div>
      ) : null}
    </>
  );
};

type PostCard = NonNullable<ReturnType<typeof usePostCard>>;
type PieceCard = NonNullable<ReturnType<typeof usePieceCard>>;

/**
 * What a press sends and says: a search's own, a post's own, a video's own, or the card itself. A card that draws a body of
 * its own (`own`) offers no Open beside its press: there is nothing to open before it.
 */
const whatGoes = (
  proposal: AskProposal,
  lead: SearchCardView | null,
  drawn: { post: PostCard | null; piece: PieceCard | null; folder: FolderCard | null },
) => {
  const { post, piece, folder } = drawn;
  if (lead) return { press: lead.press, card: lead.commit, own: true };
  // A watched folder's card: its one press is its step's (connect, choose), and at the last step the card's own.
  if (folder) return { press: folder.press, card: folder.card, own: true };
  if (piece) return { press: piece.press, card: proposal, own: true };
  return post ? { press: post.press, card: post.card, own: true } : { press: null, card: proposal, own: false };
};

/** The card its head names: a post's or a watched folder's own where it draws one, else the card as AI made it. */
const headCardOf = (proposal: AskProposal, post: PostCard | null, folder: FolderCard | null): AskProposal =>
  post?.card ?? folder?.card ?? proposal;

/** A folder's quiet second press, as the card's row draws it: its own act, or letting the card go. */
const alsoOf = (folder: FolderCard | null, dismiss: () => void) =>
  folder?.also
    ? {
        label: folder.also.label,
        onClick: folder.also.act === "dismiss" ? dismiss : folder.also.act,
        testid: "fo-card-also",
      }
    : null;

/** What a card's one press does: a folder's own step (Google's window, the chooser) where it has one, else the card's. */
const cardPressOf = (folder: FolderCard | null, own: () => unknown): (() => unknown) => folder?.act ?? own;

/**
 * How a card stands, from what became of it: still to be decided (`idle`), folded to its head in a group (`shut`), a record
 * kept as one line (`quiet`, the Keep shape, D14 of the answers canvas), or following the video it made (`follows`: a
 * video's card says where its video stands itself, once it has read it, in the receipt's place). Its body is drawn unless it
 * is folded or a kept line; a card decided in a group keeps its body only while it follows its video.
 */
const cardStandsAs = (
  state: AskProposalOutcome["state"] | "idle",
  proposal: AskProposal,
  fold: CardFold | null,
  piece: PieceCard | null,
) => {
  const idle = state === "idle";
  const shut = idle && !!fold && !fold.open;
  const quiet = state === "done" && askTraitsOf(proposal.kind).shape === "keep";
  const follows = state === "done" && !!piece?.stands;
  const decided = !idle && !!fold;
  return { idle, shut, quiet, follows, body: !(shut || quiet || (decided && !follows)) };
};

/**
 * Whether what became of the card is its foot, in reach where the press was (`data-foot`, ask.css): a press in this tab
 * said it, and the card says it itself. A card drawn again from what the conversation kept is at rest.
 */
const toldFoot = (here: boolean, idle: boolean, follows: boolean): "told" | undefined =>
  here && !idle && !follows ? "told" : undefined;

/** What the card shows of what it will do; a video's card, of where its video stands once pressed. */
const AskCardBody = ({
  p,
  lead,
  post,
  piece,
  t,
  onNav,
  idle,
  alike,
  more,
  busy,
  onAgain,
  folder = null,
}: {
  p: AskProposal;
  lead: SearchCardView | null;
  post: PostCard | null;
  piece: PieceCard | null;
  t: LineWords;
  onNav: (to: string) => void;
  idle: boolean;
  alike: readonly string[];
  more: boolean;
  busy: boolean;
  /** The card's own press, again: what a video that was not made is tried anew by. Null where this person may not press. */
  onAgain: (() => void) | null;
  /** A watched folder's card, at the step it stands at; null for every other card. */
  folder?: FolderCard | null;
}) => {
  if (lead) return <AskSearchCard lead={lead} t={t} alike={alike} />;
  if (folder) return <>{folder.body}</>;
  if (post) return <AskPostCard p={p} card={post} t={t} onNav={onNav} />;
  if (piece) return <AskPieceCard p={p} card={piece} t={t} busy={busy} onNav={onNav} onRetry={onAgain} />;
  if (p.kind === "publish") return <AskPublishCard p={p} />;
  return <AskCardChange p={p} t={t} idle={idle} alike={alike} more={more} />;
};

export const AskCard = ({
  p,
  messageId,
  t,
  onNav,
  hideOpen = false,
  onOutcome,
  step = AT_NO_STEP,
}: {
  p: AskProposal;
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  hideOpen?: boolean;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  step?: CardStep;
}) => {
  const pressed = useCardPress(p, { messageId, t, onNav, onOutcome, step });
  const { A, state, setState, receipt, undoData, doneAt, err, setErr, land, receiptRef, approveRef, held } = pressed;
  const { posting, setPosting, forward, approveWith, dismiss, undo, onClock, acting, here } = pressed;
  const [more, setMore] = useState(false);
  const post = usePostCard(p);
  const piece = usePieceCard(p, t, pressed.made, pressed.madeAt);
  const { idle, shut, quiet, follows, body } = cardStandsAs(state, p, step.fold, piece);
  // A watched folder's card (files/footage/ask-card.tsx): connect, choose, watch, a step a press; once decided, its head
  // names the folder watched.
  const folder = useFolderCard(p, idle);
  // A search's card (Ruben, 23 Oct 2026): what it finds as rows, read, never edited here -- a change is said to Ask, which
  // makes the card again -- its line under them, and one press, for what the month has room for (contracts
  // leads/search/card.ts).
  const lead = idle ? searchCardView(p) : null;
  const goes = whatGoes(p, lead, { post, piece, folder });
  return (
    <div
      className={`${quiet ? "" : "panel "}ask-job ${state}${shut ? " ask-shut" : ""}${quiet ? " ask-quiet" : ""}`}
      data-testid="ask-card"
      data-kind={p.kind}
    >
      {quiet ? null : <AskCardHead p={headCardOf(p, post, folder)} fold={idle ? step.fold : null} />}
      {body ? (
        <AskCardBody
          p={p}
          lead={lead}
          post={post}
          piece={piece}
          t={t}
          onNav={onNav}
          idle={idle}
          alike={step.alike}
          more={more}
          busy={held}
          onAgain={mayPressCard(p) ? () => void approveWith(goes.card) : null}
          folder={folder}
        />
      ) : null}
      {idle && step.note ? (
        <p className="ask-job-foot" data-testid="ask-step-note">
          {step.note}
        </p>
      ) : null}
      {posting ? (
        <AskPosting
          posting={posting}
          said={p.kind === "publish" ? t.postingPost(postPublishOf(p.payload ?? {}).when_said) : t.posting}
          t={t}
          landRef={receiptRef}
          onEnd={() => {
            setPosting(null);
            void approveWith(p);
          }}
          onUndo={() => {
            setPosting(null);
            land.current = "approve";
          }}
        />
      ) : null}
      {idle && !shut && !posting ? (
        <AskCardActs
          p={p}
          t={t}
          busy={held}
          acting={acting}
          waits={step.waits}
          hideOpen={hideOpen || goes.own}
          press={goes.press}
          onApprove={cardPressOf(folder, () =>
            askTraitsOf(p.kind).reach === "public" ? onClock() : approveWith(goes.card),
          )}
          onDismiss={dismiss}
          onNav={onNav}
          more={more}
          onMore={() => setMore((m) => !m)}
          approveRef={approveRef}
          also={alsoOf(folder, dismiss)}
        />
      ) : null}
      {/* Always drawn, so what fills it is announced; empty, it takes no room (ask.css). What a press in this tab made of
          the card is its foot, in reach where the press was; a card drawn again from what was kept is at rest. */}
      <div className="ask-told" role="status" data-foot={toldFoot(here, idle, follows)}>
        {idle || follows ? null : (
          <AskCardReceipt
            p={p}
            t={t}
            state={state}
            receipt={receipt}
            err={err}
            open={atUndoOpen(A, p, { state, undoData, doneAt })}
            undoData={undoData}
            doneAt={doneAt}
            busy={held}
            onUndo={undo}
            onRetry={() => {
              land.current = "approve";
              setState("idle");
              setErr("");
              if (step.fold && !step.fold.open) step.fold.toggle();
            }}
            landRef={receiptRef}
          />
        )}
      </div>
      <AskCardAfter p={p} state={state} err={err} forward={forward} t={t} onNav={onNav} />
    </div>
  );
};

/**
 * Which of a group's cards stands open: the first still waiting (contracts openCardOf), until a press on a head names
 * another or none (`picked`); what becomes of any card goes back to the first still waiting, so deciding one opens the
 * next. `now` is the cards as they stand, what the group saw become of them over what the turn holds.
 */
const useCardsTogether = (cards: AskProposal[]) => {
  const [seen, setSeen] = useState<Record<string, AskProposalOutcome>>({});
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  const open = picked === undefined ? openCardOf(now) : picked;
  const sawAll = (got: Record<string, AskProposalOutcome>) => {
    setSeen((prev) => ({ ...prev, ...got }));
    setPicked(undefined);
  };
  return {
    now,
    sawAll,
    saw: (pid: string, o: AskProposalOutcome) => sawAll({ [pid]: o }),
    foldOf: (pid: string): CardFold => ({ open: open === pid, toggle: () => setPicked(open === pid ? null : pid) }),
    alike: holdsAlike(now),
  };
};

// What holds every card of a group, said once over them in the sheet's warn tone: a press on any of them turns on it, so
// it stands above the one open whichever that is, and goes with the last that waits.
const AskHoldsAlike = ({ holds, of, t }: { holds: readonly string[]; of: number; t: LineWords }) =>
  holds.length ? (
    <div className="ask-alike" data-testid="ask-holds-alike">
      {holds.map((h, k) => (
        <p key={h} className="ask-spec-hold">
          {k === 0 ? <strong>{t.holdsAll(of)} </strong> : null}
          {h}
        </p>
      ))}
    </div>
  ) : null;

// The cards of no plan that stand side by side (contracts cardsTogether): one open, the rest folded, what they share said
// once over them. A card alone is drawn as it is.
export const AskCards = ({
  cards,
  messageId,
  t,
  onNav,
  onOutcome,
  onEdit,
  cardOpen,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  cardOpen?: Record<string, boolean>;
}) => {
  const group = useCardsTogether(cards);
  const card = (p: AskProposal, step?: CardStep) => (
    <AskCard
      key={p.id}
      p={p}
      messageId={messageId}
      t={t}
      onNav={onNav}
      onOutcome={onOutcome}
      onEdit={onEdit}
      hideOpen={!!cardOpen && cardOpen[p.id] === false}
      step={step}
    />
  );
  const only = cards.length === 1 ? cards.at(0) : null;
  if (only) return card(only);
  return (
    <div className="ask-together" data-testid="ask-cards">
      <AskHoldsAlike holds={group.alike} of={cards.length} t={t} />
      {cards.map((p) => card(p, { ...AT_NO_STEP, saw: group.saw, fold: group.foldOf(p.id), alike: group.alike }))}
    </div>
  );
};
