/**
 * A card's parts, as the Line draws them (the spec 2026-09-27-ask-chat-on-a-phone, D16; the eight shapes of the answers
 * canvas, D14): who or what it touches, the change as it will land, what follows, then one press that says what it does.
 * AskCard (card.tsx) holds its state and its verbs.
 */
import { useState, type RefObject } from "react";
import type { AskCardSheet, AskProposal, AskProposalOutcome } from "@chanlytics/contracts";
import { PROPOSAL_GATE } from "@chanlytics/contracts/page-specs";
import { SEARCH_CARD_REPLACED, askPressCount, askPressOf, askTraitsOf } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Confirm } from "../kit/confirm/confirm";
import { Icon } from "../kit/icon/icon";
import { LinePress } from "../kit/line/line";
import { askCalls, canDo, gate, gateTitle } from "./shell";
import type { LineWords } from "./words";

// Each kind a source names (contracts ASK_CITATION_KINDS) as the mark before its row, the page's own glyph where its
// page has one: a thread or a conversation is a chat. A scope's run is the Broadcasts row a citation calls a broadcast.
// A list's card and a run's card (AT_CARD_ICONS) are marked as their rows are.
const AT_KIND_GLYPHS: Record<string, string> = {
  thread: "chat",
  conversation: "chat",
  call: "phone",
  person: "users",
  page: "arrow-right",
  lead: "star",
  search: "search",
  deal: "deal",
  list: "filter",
  broadcast: "wave",
  run: "wave",
  playbook: "bolt",
  ad: "arrow-right",
  file: "image",
  template: "content",
  mailbox: "mail",
  visit: "calendar",
  review: "star",
  sequence: "repeat",
  message: "content",
};
/** A kind's mark, for a row in an answer and for the scope the Line carries; a kind it does not know is a chat. */
export const askKindGlyph = (kind: string): string => AT_KIND_GLYPHS[kind] || "chat";
// A card is who or what it touches, the change as it will land, what follows, then one act (the spec
// 2026-09-27-ask-chat-on-a-phone, D16); these are its parts, and AskCard below holds its state and its verbs.

/** A card of a group's way to open: whether it stands open, and the press that opens or folds it. */
export interface CardFold {
  open: boolean;
  toggle: () => void;
}

// The card's head: its title and nothing else (D14 of the answers canvas: no tile, no kind's word, no step's number). In a
// group of cards it is the press that opens the card and folds it (`fold`, one element either way, so the press keeps its
// focus), and a card not reached says its one line under its title (AskProposal.line, else its summary, cut to two lines: a
// folded card has no press, so nothing is pressed on those words).
export const AskCardHead = ({ p, fold = null }: { p: AskProposal; fold?: CardFold | null }) => {
  if (!fold)
    return (
      <div className="ask-card-head">
        <span className="ask-card-name">
          <span className="ask-card-title">{p.title}</span>
        </span>
      </div>
    );
  return (
    <LinePress
      kind="fold"
      className="ask-card-head ask-fold"
      aria-expanded={fold.open}
      onClick={fold.toggle}
      data-testid="ask-card-fold"
    >
      <span className="ask-card-name">
        <span className="ask-card-title">{p.title}</span>
        {fold.open ? null : <span className="ask-fold-line">{p.line || p.summary}</span>}
      </span>
      <Icon name="chevron" size={12} className="ask-fold-chev" />
    </LinePress>
  );
};

// A card's change as a sheet (contracts AskCardSheet): what holds it first, in the warn tone, then a row a fact on a
// key column, the way an owner checks a campaign before they press it (the answer canvas, C1). `alike` is what its
// group says once over the cards (contracts holdsAlike), and a row `aside` waits for Details (`more`).
export const AskSheet = ({
  sheet,
  alike = [],
  more = false,
}: {
  sheet: AskCardSheet;
  alike?: readonly string[];
  more?: boolean;
}) => (
  <div className="ask-spec" data-testid="ask-card-sheet">
    {(sheet.holds || [])
      .filter((h) => !alike.includes(h))
      .map((h, i) => (
        <p key={i} className="ask-spec-hold">
          {h}
        </p>
      ))}
    <dl className="ask-spec-rows">
      {sheet.rows
        .filter((r) => more || !r.aside)
        .map((r) => (
          <div key={r.label} className="ask-spec-row">
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
    </dl>
  </div>
);

// The change as it will land, on the sunken ground: a reply as the sent bubble it will be, a campaign or a send as its
// sheet, anything else its summary.
// Before the act a reply's warnings stand under it, and while it can go as it is (its window open), its undo's own
// words say what follows; with the window shut only a template can go, and the note says so instead.
// A message the card writes is drawn whole, each version under its channel's word as the person reached on it reads
// it, and when each goes and who it reaches under them (its summary, which quotes them, is the model's).
/** A version of the message a card writes, as the person reached on it reads it. */
interface CardVersion {
  channel: string;
  label: string;
  words: string;
}

export const AskCardChange = ({
  p,
  t,
  idle,
  alike,
  more,
}: {
  p: AskProposal;
  t: LineWords;
  idle: boolean;
  alike?: readonly string[];
  more?: boolean;
}) => {
  const pl = p.payload || {};
  const reply = p.kind === "reply";
  const shut = pl.window_open === false;
  const written = p.kind === "message" && Array.isArray(pl.said) ? (pl.said as CardVersion[]) : null;
  // A record: what it keeps, in a line, with no ground under it (the Keep shape).
  if (askTraitsOf(p.kind).shape === "keep" && !written && !(p.sheet && p.sheet.rows && p.sheet.rows.length))
    return <p className="ask-card-line">{p.line || p.summary}</p>;
  return (
    <>
      <div className={`ask-card-change${reply ? " bubble" : ""}`}>
        {written ? (
          <div className="ask-card-said" data-testid="ask-card-versions">
            {written.map((v) => (
              <p key={v.channel} className="ask-card-summary">
                <span className="ask-card-channel">{v.label}</span>
                {"\n"}
                {v.words}
              </p>
            ))}
          </div>
        ) : p.sheet && p.sheet.rows && p.sheet.rows.length ? (
          <AskSheet sheet={p.sheet} alike={alike} more={more} />
        ) : (
          <p className="ask-card-summary">{p.kind === "fix" && p.line ? p.line : p.summary}</p>
        )}
      </div>
      {written && pl.follows ? <p className="ask-card-foot">{pl.follows as string}</p> : null}
      {reply && idle && pl.price_warning ? <div className="ask-card-note">{t.priceNote}</div> : null}
      {reply && idle && shut ? <div className="ask-card-note">{t.windowNote}</div> : null}
      {reply && idle && !shut && p.undo ? <p className="ask-card-foot">{p.undo}</p> : null}
    </>
  );
};

/** A card of the one thing to fix first: its door, in the press's place. */
const AskFixActs = ({
  p,
  t,
  busy,
  onDismiss,
  onNav,
}: {
  p: AskProposal;
  t: LineWords;
  busy: boolean;
  onDismiss: () => void;
  onNav: (to: string) => void;
}) => {
  const pl = p.payload || {};
  return (
    <div className="ask-card-actions">
      {typeof pl.to === "string" && pl.door ? (
        <Button variant="primary" size="sm" onClick={() => onNav(pl.to as string)} data-testid="ask-card-door">
          {pl.door as string}
        </Button>
      ) : null}
      {p.origin?.by === "idea" ? <AskNotNow t={t} busy={busy} onDismiss={onDismiss} /> : null}
    </div>
  );
};

// Before the act (D14 of the answers canvas): one press that says what it does (contracts askPressOf, in the Line's language;
// a search's and a post's say their own, `press`), the composer on a reply, Open where the answer does not already offer the
// place (`hideOpen`, oneDoor; where it goes is the contract's cardOpenRoute), Details where the sheet keeps something aside,
// and Not now only on an idea of Ask's own: a card the member asked for is ignored, or changed by saying so. A role that may
// not press it reads why in the press's place (contracts' words, through gateTitle); the route re-checks. A plan's send that
// waits for a step says so in the kit's state pill in the press's place (`waits`). A card of the one thing to fix before a
// campaign can reach anyone commits nothing: its door stands in the press's place. While a press runs the press says so and
// keeps its focus: `disabled` would drop it on the page, and the press itself is held by the card (`held`).
/** Whether this person may press a card of this kind: its gate, as its Approve reads it. */
export const mayPressCard = (proposal: AskProposal): boolean => canDo(PROPOSAL_GATE[proposal.kind] || "approve");

export const AskCardActs = ({
  p,
  t,
  busy,
  waits,
  hideOpen,
  onApprove,
  onDismiss,
  onNav,
  press = null,
  more,
  onMore,
  approveRef,
}: {
  p: AskProposal;
  t: LineWords;
  busy: boolean;
  waits: string | null;
  hideOpen: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onNav: (to: string) => void;
  press?: { label: string; disabled: boolean } | null;
  more?: boolean;
  onMore?: () => void;
  approveRef?: RefObject<HTMLButtonElement | null>;
}) => {
  const A = askCalls();
  const pl = p.payload || {};
  const gateKey = PROPOSAL_GATE[p.kind] || "approve";
  const openRoute = A && A.cardOpenRoute ? A.cardOpenRoute(p) : null;
  const aside = !!(onMore && p.sheet && p.sheet.rows.some((r) => r.aside));
  const idea = p.origin?.by === "idea";
  if (p.kind === "fix") return <AskFixActs p={p} t={t} busy={busy} onDismiss={onDismiss} onNav={onNav} />;
  const mayPress = canDo(gateKey);
  return (
    <div className="ask-card-actions">
      {waits ? (
        <span className="pill" data-testid="ask-card-waits">
          {waits}
        </span>
      ) : null}
      {!waits && !mayPress ? (
        <p className="ask-card-foot" data-testid="ask-card-cant">
          {gateTitle(gateKey, "approve this card")}
        </p>
      ) : null}
      {waits || !mayPress ? null : (
        <Button
          ref={approveRef}
          variant="primary"
          size="sm"
          className="ask-press"
          onClick={onApprove}
          disabled={!!(press && press.disabled)}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          data-testid="ask-card-approve"
          {...gate(gateKey, "press this card")}
        >
          {busy ? t.working : press ? press.label : t.press(askPressOf(p), askPressCount(p))}
        </Button>
      )}
      {p.kind === "reply" && pl.conversation_id ? (
        <Button
          variant="quiet"
          size="sm"
          onClick={() => {
            onNav(`inbox/th-${pl.conversation_id as string}`);
            if (A) A.editReply(p);
          }}
        >
          {t.editComposer}
        </Button>
      ) : null}
      {openRoute && !hideOpen && (more || !aside) ? (
        <Button variant="quiet" size="sm" onClick={() => onNav(openRoute)}>
          {/^campaigns\/sequences\/new(:|$)/.test(openRoute) ? t.openNew : t.openIt}
        </Button>
      ) : null}
      {aside ? (
        <Button variant="quiet" size="sm" onClick={onMore} aria-expanded={!!more} data-testid="ask-card-details">
          {t.details}
        </Button>
      ) : null}
      {idea ? <AskNotNow t={t} busy={busy} onDismiss={onDismiss} /> : null}
    </div>
  );
};

/** Not now, on an idea of Ask's own: it rests it for a week. */
export const AskNotNow = ({ t, busy, onDismiss }: { t: LineWords; busy: boolean; onDismiss: () => void }) => (
  <Button variant="quiet" size="sm" className="ask-card-not-now" onClick={onDismiss} disabled={busy}>
    {t.notNow}
  </Button>
);

// Quick changes under a card with words (D25 of the answers canvas): each is a question the person could type, so the model
// writes the card again and the newer card sets this one aside (contracts searchCardsReplaced). None on an earlier turn.
export const AskQuickChanges = ({ t, onFollow }: { t: LineWords; onFollow: (q: string) => unknown }) => (
  <div className="ask-card-quick" data-testid="ask-card-quick">
    {t.quickChanges.map((q) => (
      <LinePress key={q.label} kind="chip" onClick={() => onFollow(q.asks)} data-testid="ask-card-change">
        <span>{q.label}</span>
      </LinePress>
    ))}
  </div>
);

// The take-back clock: a hairline ring emptying over a send's own window, drawn where the window stands (a card drawn
// again mid-window starts part-empty) and running for what is left of it. Its end is the window's: `onDone` is the
// animation's own end, which comes at the same moment under reduced motion, where the ring holds still (ask.css).
const AT_RING = 40.84; // the ring's length, 2π × 6.5 (ask.css .ask-ring-arc)
export const AskRing = ({ from, until, onDone }: { from: number; until: number; onDone: () => void }) => {
  const [at] = useState(() => Date.now());
  const gone = Math.min(1, Math.max(0, (at - from) / Math.max(1, until - from)));
  return (
    <svg
      className="ask-card-ring"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-testid="ask-card-ring"
    >
      <circle className="ask-ring-track" cx="8" cy="8" r="6.5" />
      <circle
        className="ask-ring-arc"
        cx="8"
        cy="8"
        r="6.5"
        transform="rotate(-90 8 8)"
        style={{ strokeDashoffset: AT_RING * gone, animationDuration: `${Math.round(Math.max(1, until - at))}ms` }}
        onAnimationEnd={onDone}
      />
    </svg>
  );
};

// After the act, one line on the sunken ground: what happened, and the undo the verb has while it is still true (`open`,
// contracts askUndoOpen). A send that can still be taken back leads with its clock and says Undo, its own words the
// button's title; the ring's end takes the Undo with it. Undoing a new playbook deletes it, so that undo asks first.
// Focus lands on it after a press (`landRef`, AskCard), since what was pressed has gone.
export const AskCardReceipt = ({
  p,
  t,
  state,
  receipt,
  err,
  open,
  undoData,
  doneAt,
  busy,
  onUndo,
  onRetry,
  landRef,
}: {
  p: AskProposal;
  t: LineWords;
  state: AskProposalOutcome["state"] | "idle";
  receipt: string;
  err: string;
  open: boolean;
  undoData: AskProposalOutcome["undo"];
  doneAt: number;
  busy: boolean;
  onUndo: () => Promise<void>;
  onRetry: () => void;
  landRef?: RefObject<HTMLDivElement | null>;
}) => {
  const [armed, setArmed] = useState(false);
  const [ended, setEnded] = useState(false);
  const until =
    open && undoData && typeof undoData.cancelable_until === "string" ? Date.parse(undoData.cancelable_until) : 0;
  const clock = until > 0 && !ended;
  const can = open && !ended;
  const undoArmed = async () => {
    await onUndo();
    setArmed(false);
  };
  return (
    <div className="ask-card-receipt ask-landing" ref={landRef} tabIndex={-1}>
      {clock ? (
        <AskRing from={doneAt} until={until} onDone={() => setEnded(true)} />
      ) : (
        <Icon
          name={state === "done" ? "check" : state === "failed" ? "alert" : "x"}
          size={11}
          className={state === "done" ? "ok" : ""}
        />
      )}
      <span className="ask-card-said">
        {state === "failed"
          ? err || receipt
          : state === "dismissed"
            ? receipt === SEARCH_CARD_REPLACED
              ? t.changedBelow
              : t.notNow
            : receipt}
      </span>
      {can && !armed ? (
        <Button
          variant="quiet"
          size="sm"
          className="ask-card-undo"
          onClick={p.kind === "playbook" ? () => setArmed(true) : onUndo}
          aria-disabled={busy || undefined}
          title={p.undo ?? undefined}
        >
          {t.undo}
        </Button>
      ) : null}
      {can && armed ? (
        <Confirm
          question={`${p.undo as string}?`}
          detail={t.undoCampaignDetail}
          yes={t.undoCampaignYes}
          danger
          busy={busy}
          onYes={undoArmed}
          onNo={() => setArmed(false)}
          testid="ask-card-undo"
        />
      ) : null}
      {state === "failed" ? (
        <Button variant="quiet" size="sm" className="ask-card-undo" onClick={onRetry}>
          {t.tryAgain}
        </Button>
      ) : null}
    </div>
  );
};
