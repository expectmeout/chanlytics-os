/**
 * Try it (canvas R6–R8, P6, P7, V7, V8; contracts first-run-try.ts; moved from legacy/pages/first-run.jsx, decision 0015):
 * the owner calls the number customers call, from their cell, and the page follows the call on the Live page's own read
 * -- listening, "It picked up" the moment it starts, the words a turn behind, then the whole call and where a caller who
 * asks for a person goes. `tr` is the step as contracts say it. For a kept number not yet proven, the test window opens as
 * the screen does (the call webhook proves forwarding only inside one). The transfer saves through the Business tab's one
 * saver, as that tab's row does; the skip asks once (V8), then puts the wait off for this member (TRY_SKIPPED), and Today
 * keeps its row.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TRY_SKIPPED, type FIRST_RUN_TRY_WORDS, type FirstRunTryVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { canDo, gate, refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { businessTabSave } from "../shell";
import { setupVerbs } from "../surface";
import { TRY_WINDOW_MS } from "./memory";
import { useSettled, type SettledEntry } from "./settle";

type TryWords = typeof FIRST_RUN_TRY_WORDS;
type Transfer = NonNullable<FirstRunTryVM["transfer"]>;

interface TryProps {
  tr: FirstRunTryVM;
  W: TryWords;
  flash: (f: LegacyFlash) => void;
  go: (to: string) => void;
  leave: (to: string) => void;
  back: string | null;
  backLabel: string;
}

/** The call's words, a turn each. */
function turnsOf(tr: FirstRunTryVM): ReactNode {
  return tr.call ? (
    <ol className="fr-try-turns" data-testid="fr-try-turns">
      {tr.call.turns.map((t, i) => (
        <li key={i} className={t.agent ? "fr-try-turn is-agent" : "fr-try-turn"}>
          <span className="fr-try-who">{t.who}</span>
          <span className="fr-try-said">{t.text}</span>
        </li>
      ))}
    </ol>
  ) : null;
}

/** Listening, or still nothing: the number to call, why nothing may have come, and the skip. */
function listenStage(o: {
  tr: FirstRunTryVM;
  W: TryWords;
  go: (to: string) => void;
  help: () => void;
  busy: boolean;
  skipper: ReactNode;
}) {
  const { tr, W, go, help, busy, skipper } = o;
  const l = tr.listening;
  return (
    <div className="fr-line-step" data-testid="fr-try" data-stage={tr.stage}>
      <span className="fr-code-dial tabular" data-testid="fr-try-number">
        {tr.number}
      </span>
      <div className="fr-try-listen" role="status">
        <span className="fr-try-pulse" aria-hidden="true" />
        <span className="fr-line-sentence">{l && l.sentence}</span>
        <span className="fr-line-detail">{l && l.detail}</span>
      </div>
      {l && l.route ? (
        <p className="fr-code-off" data-testid="fr-try-route">
          {l.route}
        </p>
      ) : null}
      {tr.causes.length ? (
        <dl className="fr-try-causes" data-testid="fr-try-causes">
          {tr.causes.map((c) => (
            <div key={c.question}>
              <dt>{c.question}</dt>
              <dd>{c.answer}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {tr.stage === "quiet" ? (
        <div className="fr-code-links">
          {tr.forwarded ? (
            <button type="button" className="fr-find-link" onClick={() => go("start/phone")} data-testid="fr-try-code">
              {W.showCode}
            </button>
          ) : null}
          {tr.help ? (
            <button
              type="button"
              className="fr-find-link"
              onClick={help}
              disabled={busy}
              data-testid="fr-try-help"
              {...gate("approve", "ask for help")}
            >
              {tr.help}
            </button>
          ) : null}
        </div>
      ) : null}
      {skipper}
    </div>
  );
}

/** The call over: its line, its words, where a caller who asks for a person goes, and the way on. */
function doneStage(o: {
  tr: FirstRunTryVM;
  t: Transfer;
  value: string | null;
  W: TryWords;
  choose: (option: Transfer["options"][number]) => void;
  go: (to: string) => void;
  leave: (to: string) => void;
  back: string | null;
  backLabel: string;
}) {
  const { tr, t, value, W, choose, go, leave, back, backLabel } = o;
  return (
    <div className="fr-line-step" data-testid="fr-try" data-stage="done">
      <p className="fr-line-detail" data-testid="fr-try-meta">
        {tr.call && tr.call.line}
      </p>
      {turnsOf(tr)}
      <span className="fr-line-label" id="fr-try-transfer-label">
        {t.label}
      </span>
      <div
        className="fr-find-hits"
        role="radiogroup"
        aria-labelledby="fr-try-transfer-label"
        data-testid="fr-try-transfer"
      >
        {t.options.map((op) => (
          <label key={op.key} className="fr-find-hit" data-testid={`fr-try-transfer-${op.key}`}>
            <input
              type="radio"
              name="fr-try-transfer"
              value={op.key}
              checked={value === op.key}
              onChange={() => choose(op)}
              {...gate("settings", "choose where callers are put through")}
            />
            <span className="fr-find-body">
              <span className="fr-find-name">{op.label}</span>
              <span className="fr-find-where">{op.sentence}</span>
            </span>
          </label>
        ))}
      </div>
      {t.note ? (
        <p className="fr-code-off" data-testid="fr-try-note">
          {t.note}
        </p>
      ) : null}
      <div className="fr-foot">
        {back ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => go(back)} data-testid="fr-back">
            {backLabel}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="fr-find-link"
          onClick={() => leave(tr.call ? tr.call.to : "")}
          data-testid="fr-try-inbox"
        >
          {W.inbox}
        </button>
        <button type="button" className="fr-onward" onClick={() => go("start")} data-testid="fr-try-go">
          {W.continue}
        </button>
      </div>
    </div>
  );
}

/**
 * The test window, as the screen opens and again once it runs out while the owner is still listening (the call webhook
 * proves forwarding only inside one). At most once a window: TRY_WINDOW_MS apart.
 */
function useTestWindow(tr: FirstRunTryVM, flash: (f: LegacyFlash) => void) {
  const opened = useRef(0);
  useEffect(() => {
    const listening = tr.stage === "listen" || tr.stage === "quiet";
    if (!tr.openTest || !listening || Date.now() - opened.current < TRY_WINDOW_MS) return;
    if (!canDo("disconnect")) return;
    opened.current = Date.now();
    void setupVerbs.forwarding.test(tr.openTest).then((r) => {
      if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    });
  }, [tr.openTest, tr.stage]);
}

export const FrTry = ({ tr, W, flash, go, leave, back, backLabel }: TryProps) => {
  const [nudged, setNudged] = useState(false);
  const [busy, setBusy] = useState(false);
  // The choice pressed, shown until Setup's read says the same (the save re-reads it), or let go on a refusal. Saved once
  // the keys settle: arrowing through the three is one save, of the last.
  const [picked, setPicked] = useState<string | null>(null);
  const settled = useSettled(useRef<SettledEntry | null>(null));
  const t0 = tr.transfer;
  useEffect(() => {
    if (picked && t0 && t0.value === picked) setPicked(null);
  }, [t0 && t0.value]);
  useTestWindow(tr, flash);
  const skip = async () => {
    if (!nudged) {
      setNudged(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    const r = await setupVerbs.later(TRY_SKIPPED, true);
    setBusy(false);
    if (!r.ok) {
      flash(refusalToast(r, W.notSaved));
      return;
    }
    go("start");
  };
  const help = async () => {
    if (busy || !canDo("approve")) return;
    setBusy(true);
    const r = await setupVerbs.request("forwarding");
    setBusy(false);
    flash(r.ok ? { tone: "ok", msg: <>{W.helpSent}</> } : refusalToast(r, W.helpFailed));
  };
  // Where a caller who asks for a person goes: the Business tab's own row and patch (an empty number takes a message).
  const choose = (o: Transfer["options"][number]) => {
    const S = businessTabSave();
    if (!S || !canDo("settings")) return;
    // The saver goes on the settings read's config: without it, nothing would be sent, so it says so instead.
    if (!S.saver.base()) {
      flash({ tone: "danger", msg: <>{W.notReadYet}</> });
      return;
    }
    setPicked(o.key);
    settled({
      send: () =>
        S.saver.save({
          row: "handoff_number",
          change: S.PATCH_OF.handoff_number(o.to || ""),
          said: null,
          done: () => flash({ tone: "ok", msg: <>{W.saved}</> }),
          flash: (f: unknown) => {
            if (f && typeof f === "object" && Reflect.get(f, "tone") === "danger") {
              setPicked(null);
              flash(f as LegacyFlash);
            }
          },
        }),
    });
  };
  const skipper = (
    <div className="fr-try-skip" data-testid="fr-try-skip">
      {nudged ? (
        <p className="fr-check-note" data-testid="fr-try-nudge">
          {tr.skip.nudge}
        </p>
      ) : null}
      <div className="fr-code-links">
        {nudged ? (
          <button type="button" className="fr-find-link" onClick={() => setNudged(false)} data-testid="fr-try-stay">
            {tr.skip.stay}
          </button>
        ) : null}
        <button
          type="button"
          className="fr-find-link"
          onClick={() => void skip()}
          disabled={busy}
          data-testid="fr-try-skip-go"
        >
          {nudged ? tr.skip.anyway : tr.skip.label}
        </button>
      </div>
    </div>
  );
  if (tr.stage === "listen" || tr.stage === "quiet")
    return listenStage({ tr, W, go, help: () => void help(), busy, skipper });
  if (tr.stage === "call") {
    return (
      <div className="fr-line-step" data-testid="fr-try" data-stage="call">
        <p className="fr-line-started" data-testid="fr-try-proof">
          <Icon name="check" size={12} />
          {tr.call && tr.call.line}
        </p>
        {turnsOf(tr)}
        <p className="fr-line-detail">{tr.call && tr.call.behind}</p>
      </div>
    );
  }
  if (!t0) return null;
  return doneStage({ tr, t: t0, value: picked || t0.value, W, choose, go, leave, back, backLabel });
};
