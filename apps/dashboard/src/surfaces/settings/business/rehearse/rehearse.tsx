// Chanlytics — Settings › How it answers: Rehearse (decision 0069, R5).
//
// The receptionist heard or read as a customer would, then how it did, then fixed where it went wrong, on one card. It
// replaces Try it (Ruben, 21 Oct 2026: "Build lanes 1 and 2 first"): Talk is a call in the browser, before any number
// is bought (talk.tsx); Type is the typed try it was, the answer and why, six exchanges, nothing sent. Either ends in
// How it did (review.tsx), each answer judged against what it was told, and a fix under each one that went wrong.
//
// At rest it is one row and its act, as every row of the page is. The act opens the box under the row, a sheet on a
// phone, through the fold registry, so one editor is open at a time and `admin/receptionist/try` opens it still (the
// fold's id is Try it's). Closing it ends a call still running and lets the conversation go; what was reviewed is kept
// on its rehearsal, and what was kept is in the settings.
//
// After a Keep, a typed rehearsal asks the same questions again with the new instructions, the answer before and after
// side by side (Try again, decision 0069 item 10); a spoken one lists them for the next call.
//
// Drawn on every draw of How it answers (tab.tsx), so its hooks keep their place; for a role that may not change the
// settings it draws nothing, as a row's act is absent rather than dead.

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  FIX_WORDS as F,
  REHEARSE_WORDS as W,
  REVIEW_WORDS as R,
  TRY_IT_MAX_CHARS,
  TRY_IT_MAX_EXCHANGES,
  TRY_IT_WORDS as T,
  type ReviewDto,
  type TryItVM,
} from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { LinkButton } from "../../../kit/link-button/link-button";
import { RecordField } from "../../../kit/record/field";
import { RecordFold } from "../../../kit/record/fold";
import { useRecordFold } from "../../../kit/record/hooks";
import { RecordRow } from "../../../kit/record/row";
import { RecordSays } from "../../../kit/record/says";
import { Segmented } from "../../../kit/segmented/segmented";
import { RehearsalReview } from "./review";
import { BtTalk } from "./talk";
import { tryVerbs, rehearseVerbs, type TryTurn } from "./verbs";

/** The fold's id: Try it's, which the address names (frame/tabs.ts ROW_PANES). */
const TRY = "try";

type Mode = "talk" | "type";

/** One message tried, what came back, and, once asked again after a fix, what came back then. */
interface Tried {
  asked: string;
  vm: TryItVM;
  was?: string;
}

/** A review on the card: of which rehearsal, heard on which composition. */
interface Reviewed {
  rehearsalId: string;
  review: ReviewDto;
  channel: "whatsapp" | "voice";
}

/** The turns a try is asked after: each message tried and what a customer would have read back. */
export const historyOf = (tried: readonly Tried[]): TryTurn[] =>
  tried.flatMap((t) => [
    { role: "user" as const, content: t.asked },
    { role: "assistant" as const, content: t.vm.said },
  ]);

/** One message and its answer: what was written, what it would answer, and why; after a fix, the answer before it. */
function BtTried({ t, at }: { t: Tried; at: number }) {
  const id = `try-${at}`;
  return (
    <div className="bt-try-turn" data-testid={`bt-try-turn-${at}`}>
      <RecordRow id={`${id}-asked`} label={T.customer} value={t.asked} />
      {t.was !== undefined && t.was !== t.vm.said ? (
        <RecordSays testid={`${id}-said`} label={F.after} text={t.vm.said} gone={t.was} goneLabel={F.before} />
      ) : (
        <RecordSays
          testid={`${id}-said`}
          label={T.receptionist}
          text={t.vm.said}
          gone={t.vm.wrote}
          goneLabel={T.wrote}
        />
      )}
      {t.vm.rows.map((r) => (
        <RecordRow key={r.key} id={`${id}-${r.key}`} label={r.label} value={r.value} />
      ))}
      <RecordRow
        id={`${id}-then`}
        label={T.rows.then}
        value={<span data-tone={t.vm.then.tone}>{t.vm.then.words}</span>}
      />
    </div>
  );
}

/**
 * A rehearsal's state and its acts, for every place that draws one (decision 0069's one surface, R5): Settings' card
 * here, and the first run's Rehearse (setup/first-run/rehearse.tsx, decision 0073). What was typed and tried, the review
 * and its keeps, and what to ask on the next call; `onReviewed` and `onKept` hear each, for a page that reads Setup again.
 */
export function useRehearsal(o: { onReviewed?: () => void; onKept?: () => void } = {}) {
  // What the page hears, as it stands on the latest draw: the callbacks below are made once and call the latest.
  const hears = useRef(o);
  useEffect(() => {
    hears.current = o;
  });
  const [mode, setMode] = useState<Mode>("talk");
  // A call's own state is the Talk part's: a new key draws a fresh one, for Start over and for Close.
  const [talkKey, setTalkKey] = useState(0);
  const [text, setText] = useState("");
  const [tried, setTried] = useState<Tried[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Reviewed | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewProblem, setReviewProblem] = useState<string | null>(null);
  // What a spoken rehearsal asked, for the next call, once a fix was kept from it.
  const [askNext, setAskNext] = useState<string[]>([]);
  const [fixedTyped, setFixedTyped] = useState(false);

  const review = useCallback(
    async (of: { rehearsal_id: string } | { turns: TryTurn[] }, channel: Reviewed["channel"]) => {
      setReviewing(true);
      setReviewProblem(null);
      const r = await rehearseVerbs.review("turns" in of ? { turns: of.turns, config_version: null } : of);
      setReviewing(false);
      if (!r.ok) return setReviewProblem(r.message || R.failed);
      setReviewed({ rehearsalId: r.data.rehearsal_id, review: r.data.review, channel });
      hears.current.onReviewed?.();
    },
    [],
  );
  const reviewCall = useCallback(
    (rehearsalId: string) => void review({ rehearsal_id: rehearsalId }, "voice"),
    [review],
  );

  const full = tried.length >= TRY_IT_MAX_EXCHANGES;
  const asked = text.trim();

  const sendTry = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || !asked || full) return;
    setBusy(true);
    setProblem(null);
    const r = await tryVerbs.ask(asked, historyOf(tried));
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setTried((was) => [...was, { asked, vm: r.data }]);
    setReviewed(null);
    setText("");
  };
  // Try again: the same questions, one after another, with the instructions as they now stand.
  const askAgain = async () => {
    if (busy || !tried.length) return;
    setBusy(true);
    setProblem(null);
    const again: Tried[] = [];
    for (const t of tried) {
      const r = await tryVerbs.ask(t.asked, historyOf(again));
      if (!r.ok) {
        setBusy(false);
        return setProblem(r.message);
      }
      again.push({ asked: t.asked, vm: r.data, was: t.vm.said });
    }
    setBusy(false);
    setTried(again);
    setReviewed(null);
    setFixedTyped(false);
  };
  const startOver = () => {
    setTried([]);
    setProblem(null);
    setReviewed(null);
    setReviewProblem(null);
    setAskNext([]);
    setFixedTyped(false);
    setTalkKey((k) => k + 1);
  };
  const kept = () => {
    if (!reviewed) return;
    if (reviewed.channel === "voice") setAskNext([...new Set(reviewed.review.items.map((i) => i.customer))]);
    else setFixedTyped(true);
    o.onKept?.();
  };
  return {
    mode,
    setMode,
    talkKey,
    text,
    setText,
    tried,
    busy,
    problem,
    reviewed,
    reviewing,
    reviewProblem,
    askNext,
    fixedTyped,
    review,
    reviewCall,
    sendTry,
    askAgain,
    startOver,
    kept,
  };
}

export function BtRehearse({ canEdit, bookingLink }: { canEdit: boolean; bookingLink: string | null }) {
  const fold = useRecordFold(TRY);
  const r = useRehearsal();
  if (!canEdit) return null;
  const { mode, setMode, talkKey, text, setText, tried, busy, problem, reviewed, reviewing } = r;
  const { reviewProblem, askNext, fixedTyped, review, reviewCall, sendTry, askAgain, startOver, kept } = r;
  // Close lets the conversation go and ends a call still running (the Talk part's own unmount).
  const close = () => {
    fold.close();
    startOver();
    setText("");
  };

  const row = (
    <RecordRow id={TRY} label={W.row.label} value={W.row.value} act={{ label: W.row.act, onClick: fold.request }} />
  );
  return (
    <section className="rec-card" data-testid="rec-card-try" aria-labelledby="bt-try-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="bt-try-title">
          {W.title}
        </h2>
        <span className="rec-card-sub">{W.sub}</span>
      </div>
      {fold.open ? null : row}
      <RecordFold wide id={TRY} label={W.row.label} open={fold.open} onCancel={close} behind={row}>
        <Segmented
          label={W.title}
          value={mode}
          onValueChange={(m) => {
            setMode(m);
            startOver();
          }}
          readOnly={busy || reviewing || undefined}
          options={[
            { value: "talk", label: W.modes.talk, testid: "bt-rh-mode-talk" },
            { value: "type", label: W.modes.type, testid: "bt-rh-mode-type" },
          ]}
          className="bt-rh-modes"
        />
        {mode === "talk" ? (
          <BtTalk key={talkKey} bookingLink={bookingLink} onReview={reviewCall} reviewing={reviewing} />
        ) : (
          <BtTyped
            tried={tried}
            text={text}
            setText={setText}
            problem={problem}
            busy={busy}
            reviewing={reviewing}
            reviewed={!!reviewed}
            fixedTyped={fixedTyped}
            onSend={sendTry}
            onReview={() => void review({ turns: historyOf(tried) }, "whatsapp")}
            onAgain={() => void askAgain()}
            onStartOver={startOver}
          />
        )}
        <BtHowItDid
          reviewing={reviewing}
          problem={reviewProblem}
          reviewed={reviewed}
          canEdit={canEdit}
          onKept={kept}
          askNext={askNext}
        />
      </RecordFold>
    </section>
  );
}

/** Type: each message tried and its answer, the box, and its acts (Ask it, How it did, Ask it again, Start over). */
export function BtTyped(p: {
  tried: readonly Tried[];
  text: string;
  setText: (v: string) => void;
  problem: string | null;
  busy: boolean;
  reviewing: boolean;
  reviewed: boolean;
  fixedTyped: boolean;
  onSend: (e: SyntheticEvent) => void;
  onReview: () => void;
  onAgain: () => void;
  onStartOver: () => void;
}) {
  const full = p.tried.length >= TRY_IT_MAX_EXCHANGES;
  return (
    <>
      {p.tried.map((t, i) => (
        <BtTried key={i} t={t} at={i} />
      ))}
      <form className="bt-try-ask" onSubmit={p.onSend} aria-busy={p.busy || undefined}>
        {full ? (
          <p className="rec-hint" data-testid="bt-try-full">
            {T.full}
          </p>
        ) : (
          <RecordField
            id="bt-try-text"
            label={T.label}
            value={p.text}
            onChange={p.setText}
            placeholder={W.type.placeholder}
            maxLength={TRY_IT_MAX_CHARS}
            problem={p.problem}
            readOnly={p.busy || undefined}
            testid="bt-try-field"
          />
        )}
        <span className="bt-try-acts">
          {full ? null : (
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={p.busy || !p.text.trim()}
              data-testid="bt-try-ask"
            >
              {p.busy ? W.type.asking : W.type.ask}
            </Button>
          )}
          {p.tried.length && !p.reviewed ? (
            <Button size="sm" disabled={p.busy || p.reviewing} onClick={p.onReview} data-testid="bt-rh-see-typed">
              {p.reviewing ? W.reviewing : W.review}
            </Button>
          ) : null}
          {p.fixedTyped ? (
            <Button size="sm" variant="primary" disabled={p.busy} onClick={p.onAgain} data-testid="bt-rh-again">
              {F.tryAgain}
            </Button>
          ) : null}
          {p.tried.length ? (
            <LinkButton onClick={p.onStartOver} disabled={p.busy} data-testid="bt-try-again">
              {W.again}
            </LinkButton>
          ) : null}
        </span>
      </form>
    </>
  );
}

/** How it did: the review on its way, a refusal, the review with its fixes, and what to ask on the next call. */
export function BtHowItDid(p: {
  reviewing: boolean;
  problem: string | null;
  reviewed: Reviewed | null;
  canEdit: boolean;
  onKept: () => void;
  askNext: readonly string[];
  /** What was kept from conversations before this one, for the running count (the first run reads it from Setup). */
  trained?: number;
}) {
  const { reviewed } = p;
  return (
    <>
      {p.reviewing ? (
        <p className="rec-hint" role="status" data-testid="bt-rh-reviewing">
          {W.reviewing}
        </p>
      ) : null}
      {p.problem ? (
        <p className="rec-hint" role="alert" data-testid="bt-rh-review-problem">
          {p.problem}
        </p>
      ) : null}
      {reviewed ? (
        <RehearsalReview
          key={reviewed.rehearsalId}
          review={reviewed.review}
          keep={{ rehearsalId: reviewed.rehearsalId, via: "rehearsal", channel: reviewed.channel }}
          canEdit={p.canEdit}
          trained={p.trained ?? 0}
          onKept={p.onKept}
        />
      ) : null}
      {p.askNext.length ? (
        <div className="bt-rh-next" data-testid="bt-rh-next">
          <p className="rec-hint">{W.askNext}</p>
          {p.askNext.map((q, i) => (
            <RecordRow key={i} id={`bt-rh-next-${i}`} label={W.talk.you} value={q} />
          ))}
        </div>
      ) : null}
    </>
  );
}
