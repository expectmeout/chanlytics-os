/**
 * A plan of Ask's as one card (D2 of the answers canvas, which reverses the marketing manager's spec §5.4 on purpose): what it
 * is and how, the message as a person reads it, what holds it, how it runs folded away, and one press that names what it
 * does, the send included (contracts planPressOf says which steps it takes; a plan with a later send presses again for it).
 * Under it, once pressed, what became of it and one way back: Undo while its steps can still be taken back (commit.ts
 * undoPlan), Pause and Resume on a send that keeps running. A stop says why and nothing went out; the same press carries on
 * from there, since a step made is never made twice (the step's own key, commit.ts).
 */
import { useEffect, useRef, useState } from "react";
import {
  askPressCount,
  askPressOf,
  type AskPlanHead,
  type AskProposal,
  type AskProposalOutcome,
} from "@chanlytics/contracts";
import type { AskApi } from "@/bridge/ask";
import { PROPOSAL_GATE } from "@chanlytics/contracts/page-specs";
import { Button } from "../kit/button/button";
import { Icon } from "../kit/icon/icon";
import { atDone, atFailed, recordCardOutcome, type OnOutcome } from "./card-press";
import { AskNotNow } from "./card-parts";
import { askCalls, canDo, gate, gateTitle, settingsVersion } from "./shell";
import type { LineWords } from "./words";

/** A plan's cards as they stand, what its press and its Undo left them, each kept as a card's own press would keep it. */
const usePlanCards = (
  cards: AskProposal[],
  record: (pid: string, o: AskProposalOutcome, kept: boolean) => Promise<boolean>,
) => {
  const [seen, setSeen] = useState<Record<string, AskProposalOutcome>>({});
  const now = cards.map((p) => (seen[p.id] ? { ...p, outcome: seen[p.id] } : p));
  return {
    now,
    /** Shown at once, and kept one after another: the store writes a turn whole, so two at once would lose one. */
    keep: async (got: Record<string, AskProposalOutcome>, kept = false) => {
      setSeen((prev) => ({ ...prev, ...got }));
      for (const [pid, outcome] of Object.entries(got)) await record(pid, outcome, kept);
    },
  };
};

/** What a plan's one card says after a press, read from what became of its steps. */
function planSaid(now: readonly AskProposal[], t: LineWords, inReview: boolean): { line: string; ok: boolean } | null {
  const failed = now.find((p) => p.outcome?.state === "failed");
  if (failed?.outcome) return { line: failed.outcome.receipt, ok: false };
  const doneSends = now.filter((p) => !p.plan?.silent && p.outcome?.state === "done");
  const send = doneSends.at(-1)?.outcome;
  if (send) return { line: send.paused ? t.planPaused : send.receipt, ok: true };
  // Its send taken back is what matters: a setting somebody saved over since stays as it is, and nothing goes out either way.
  if (now.some((p) => p.outcome?.state === "undone")) return { line: t.planUndone, ok: true };
  if (inReview) return { line: t.planFiled, ok: true };
  if (now.every((p) => p.outcome?.state === "done")) return { line: t.planDone, ok: true };
  return null;
}

/** The press, its Undo, its Pause and its Not now, each holding the card until what it did is kept. */
const usePlanPress = (
  cards: AskProposal[],
  use: { messageId?: string | null; t: LineWords; onOutcome?: OnOutcome },
) => {
  const { messageId, t, onOutcome } = use;
  const A = askCalls() as AskApi; // a plan is drawn only from a turn the bridge read
  const { now, keep } = usePlanCards(cards, (pid, o, kept) =>
    recordCardOutcome({ A, messageId, onOutcome }, pid, o, kept),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [forward, setForward] = useState<{ to: string } | null>(null);
  const landRef = useRef<HTMLDivElement>(null);
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current) return;
    pressed.current = false;
    landRef.current?.querySelector<HTMLElement>(".ask-card-receipt")?.focus({ preventScroll: true });
  });
  const version = settingsVersion();
  // Settings not read in this tab are read again by the undo itself, which refuses if anyone saved since (commit.ts).
  const undoable = (p: AskProposal, o: AskProposalOutcome) =>
    !!p.undo &&
    !!o.undo &&
    A.undoOpen(
      p.kind,
      o.undo,
      o.atMs || 0,
      Date.now(),
      version ?? (o.undo.version_after as number | undefined) ?? null,
    );
  const running = now.find((p) => p.kind === "playbook" && p.outcome?.state === "done" && p.outcome.undo?.playbook_id);
  const holding = async (act: () => Promise<void>) => {
    setBusy(true);
    setErr("");
    try {
      await act();
    } finally {
      setBusy(false);
    }
  };
  const goPress = async () => {
    if (busy || !A.commitPlan) return;
    await holding(async () => {
      const run = await A.commitPlan(now, messageId);
      const at = Date.now();
      const got: Record<string, AskProposalOutcome> = {};
      let kept = false;
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p) got[p.id] = result.ok ? atDone(result, at) : atFailed(result.message, at);
        kept = kept || result.kept === true;
        if (!result.ok && result.forward) setForward(result.forward);
      }
      pressed.current = true;
      await keep(got, kept);
    });
  };
  const goUndo = async () => {
    if (busy) return;
    await holding(async () => {
      const run = await A.undoPlan(now, undoable, messageId);
      const at = Date.now();
      const got: Record<string, AskProposalOutcome> = {};
      let kept = false;
      for (const { step, result } of run.results) {
        const p = now.find((c) => c.plan && c.plan.step === step);
        if (p && result.ok) got[p.id] = { state: "undone", receipt: result.receipt, atMs: at, undo: null };
        else if (!result.ok) setErr(result.message);
        kept = kept || (result.ok && result.kept === true);
      }
      pressed.current = true;
      await keep(got, kept);
    });
  };
  const goPause = async (paused: boolean) => {
    if (busy || !running?.outcome) return;
    const outcome = running.outcome;
    await holding(async () => {
      const r = await A.pauseSend(running, paused);
      if (r.ok) await keep({ [running.id]: { ...outcome, paused } });
      else setErr(r.message);
    });
  };
  const dismiss = () =>
    void keep(
      Object.fromEntries(
        now
          .filter((p) => !p.outcome)
          .map((p): [string, AskProposalOutcome] => [
            p.id,
            { state: "dismissed", receipt: t.notNow, atMs: Date.now(), undo: null },
          ]),
      ),
    );
  return {
    A,
    now,
    busy,
    err,
    forward,
    landRef,
    running,
    canUndo: now.some((p) => p.outcome?.state === "done" && undoable(p, p.outcome)),
    goPress,
    goUndo,
    goPause,
    dismiss,
  };
};

/** The message as a person reads it, by channel. */
const AskPlanSays = ({ says }: { says: AskPlanHead["says"] }) => (
  <div className="ask-card-change" data-testid="ask-plan-says">
    <div className="ask-card-said">
      {says.map((v) => (
        <p key={v.channel} className="ask-card-summary">
          {says.length > 1 && v.label ? (
            <>
              <span className="ask-card-channel">{v.label}</span>
              {"\n"}
            </>
          ) : null}
          {v.words}
        </p>
      ))}
    </div>
  </div>
);

/** How it runs, folded away: each step's line, and what no step says. */
const AskPlanHow = ({
  ordered,
  also,
  t,
}: {
  ordered: readonly AskProposal[];
  also: readonly string[];
  t: LineWords;
}) =>
  ordered.length > 1 || also.length ? (
    <details className="ask-card-how" data-testid="ask-plan-how">
      <summary>{t.howItRuns}</summary>
      <ul>
        {ordered.map((p) => (
          <li key={p.id}>
            {p.outcome?.state === "done" ? <Icon name="check" size={11} className="ok" /> : null}
            {p.plan?.does || p.line || p.title}
          </li>
        ))}
        {also.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </details>
  ) : null;

/** What became of it, and one way back. */
const AskPlanTold = ({
  said,
  plan,
  t,
  onNav,
}: {
  said: { line: string; ok: boolean };
  plan: ReturnType<typeof usePlanPress>;
  t: LineWords;
  onNav: (to: string) => void;
}) => {
  const { A, busy, canUndo, forward, goPause, goUndo, running } = plan;
  const openTo = running ? A.cardOpenRoute(running) : null;
  return (
    <div className="ask-card-receipt ask-landing" tabIndex={-1} data-testid="ask-plan-receipt">
      <Icon name={said.ok ? "check" : "alert"} size={11} className={said.ok ? "ok" : ""} />
      <span className="ask-card-said">{said.line}</span>
      {canUndo ? (
        <Button
          variant="quiet"
          size="sm"
          className="ask-card-undo"
          onClick={goUndo}
          aria-disabled={busy || undefined}
          data-testid="ask-plan-undo"
        >
          {t.undo}
        </Button>
      ) : null}
      {!canUndo && running?.outcome && running.outcome.state === "done" ? (
        <Button
          variant="quiet"
          size="sm"
          className="ask-card-undo"
          onClick={() => goPause(!running.outcome?.paused)}
          aria-disabled={busy || undefined}
          data-testid="ask-plan-pause"
        >
          {running.outcome.paused ? t.resume : t.pause}
        </Button>
      ) : null}
      {openTo && !canUndo ? (
        <Button variant="quiet" size="sm" onClick={() => onNav(openTo)}>
          {t.openIt}
        </Button>
      ) : null}
      {forward && !said.ok ? (
        <Button variant="quiet" size="sm" onClick={() => onNav(forward.to)} data-testid="ask-card-forward">
          {t.fixIt}
        </Button>
      ) : null}
    </div>
  );
};

/** The one press, in words that say what it does, or why this member has none; Not now on Ask's own idea alone. */
const AskPlanPress = ({
  plan,
  head,
  idea,
  t,
}: {
  plan: ReturnType<typeof usePlanPress>;
  head: AskPlanHead | null;
  idea: boolean;
  t: LineWords;
}) => {
  const { A, busy, now, goPress, dismiss } = plan;
  const press = A.planPressOf(now);
  const sendCard = press.send === null ? null : (now.find((p) => p.plan?.step === press.send) ?? null);
  const word = (() => {
    if (press.review !== null) return t.pressReview;
    if (head?.press === "offer" && sendCard) return t.pressOffer;
    if (sendCard) return t.press(askPressOf(sendCard), askPressCount(sendCard));
    return t.pressPlan;
  })();
  const stepCards = press.steps.flatMap((n) => now.find((p) => p.plan?.step === n) ?? []);
  const gateKey = stepCards.map((p) => PROPOSAL_GATE[p.kind] || "approve").find((k) => !canDo(k)) ?? "approve";
  return (
    <div className="ask-card-actions">
      {canDo(gateKey) ? (
        <Button
          variant="primary"
          size="sm"
          className="ask-press"
          onClick={goPress}
          aria-disabled={busy || undefined}
          aria-busy={busy || undefined}
          data-testid="ask-plan-approve"
          {...gate(gateKey, "press this card")}
        >
          {busy ? t.working : word}
        </Button>
      ) : (
        <p className="ask-card-foot" data-testid="ask-card-cant">
          {gateTitle(gateKey, "approve this card")}
        </p>
      )}
      {idea ? <AskNotNow t={t} busy={busy} onDismiss={dismiss} /> : null}
    </div>
  );
};

/** What it is, and how. */
const AskPlanName = ({ title, sub }: { title?: string; sub?: string }) => (
  <div className="ask-card-head">
    <span className="ask-card-name">
      <span className="ask-card-title">{title}</span>
      {sub ? <span className="ask-card-sub">{sub}</span> : null}
    </span>
  </div>
);

export const AskPlan = ({
  cards,
  messageId,
  t,
  onNav,
  onOutcome,
}: {
  cards: AskProposal[];
  messageId?: string | null;
  t: LineWords;
  onNav: (to: string) => void;
  onOutcome?: OnOutcome;
  onEdit?: (text?: string) => void;
  cardOpen?: Record<string, boolean>;
}) => {
  const plan = usePlanPress(cards, { messageId, t, onOutcome });
  const { A, now, err, landRef } = plan;
  const ordered = [...now].sort((a, b) => (a.plan?.step ?? 0) - (b.plan?.step ?? 0));
  const first = ordered.at(0);
  const head = ordered.find((p) => p.plan?.head)?.plan?.head ?? null;
  const press = A.planPressOf(now);
  const inReview = A.planInReview(now) && now.some((p) => p.outcome?.state === "done");
  const said = planSaid(now, t, inReview);
  const pressedOnce = now.some((p) => p.outcome);
  const holds = [...new Set(now.filter((p) => !p.outcome).flatMap((p) => p.sheet?.holds ?? []))];
  const says = head?.says ?? [];
  const dismissed = now.every((p) => p.outcome?.state === "dismissed");
  return (
    <div className={`ask-card ask-plan${dismissed ? " dismissed" : ""}`} ref={landRef} data-testid="ask-plan">
      <AskPlanName title={head?.title || first?.title} sub={head?.sub} />
      {says.length && !pressedOnce ? <AskPlanSays says={says} /> : null}
      {holds.map((h) => (
        <p key={h} className="ask-spec-hold">
          {h}
        </p>
      ))}
      {head?.hear && !pressedOnce ? (
        <p className="ask-card-foot" data-testid="ask-plan-hear">
          {head.hear}
        </p>
      ) : null}
      <AskPlanHow ordered={ordered} also={head?.also ?? []} t={t} />
      {press.review !== null ? (
        <p className="ask-card-foot" data-testid="ask-step-note">
          {t.reviewFirst}
        </p>
      ) : null}
      {press.steps.length ? (
        <AskPlanPress plan={plan} head={head} idea={first?.origin?.by === "idea" && !pressedOnce} t={t} />
      ) : null}
      <div className="ask-told" role="status">
        {said ? <AskPlanTold said={said} plan={plan} t={t} onNav={onNav} /> : null}
      </div>
      {err ? <div className="ask-card-note">{err}</div> : null}
    </div>
  );
};
