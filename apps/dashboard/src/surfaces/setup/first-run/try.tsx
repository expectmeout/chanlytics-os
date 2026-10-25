/**
 * Try it (canvas R6–R8, P6, P7, V7, V8, 5B; contracts first-run-try.ts; moved from legacy/pages/first-run.jsx, decision
 * 0015): the owner calls the number customers call, and the page follows the call on the Live page's own read --
 * listening, "It picked up" the moment it starts, the words a turn behind, then the whole call and where a caller who asks
 * for a person goes. Since decision 0073 it is Go live's "Check my line", in Switch it on's list, so it says its own
 * heading and lead. `tr` is the step as contracts say it. For a kept number not yet proven, the test window opens as the
 * screen does (the call webhook proves forwarding only inside one). The transfer saves through the Business tab's one
 * saver, as that tab's row does; the skip asks once (V8), then puts the wait off for this member (TRY_SKIPPED), and Today
 * keeps its row.
 *
 * It draws its own foot at every stage: Back where it has one, and on a phone the number as a press that dials it
 * (`tr.dial`), since the phone the page is read on is most often the phone the call is made from.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { TRY_SKIPPED, type FIRST_RUN_TRY_WORDS, type FirstRunTryVM } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { RecordToggleGroup } from "../../kit/record/field";
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
  /** "Show me the code again", where the code is drawn beside it (Go live's forwarding row): back to it. */
  onShowCode?: () => void;
}

/** The step's way back, where it has one. */
function backOf(back: string | null, backLabel: string, go: (to: string) => void): ReactNode {
  return back ? (
    <button type="button" className="btn btn-sm btn-ghost" onClick={() => go(back)} data-testid="fr-back">
      {backLabel}
    </button>
  ) : (
    <span />
  );
}

/** The call's words, a turn each. */
function turnsOf(tr: FirstRunTryVM): ReactNode {
  return tr.call ? (
    <ol className="fr-turns" data-testid="fr-try-turns">
      {tr.call.turns.map((t, i) => (
        <li className="panel panel-inset panel-sm fr-turn" key={i}>
          <span className="fr-label">{t.who}</span>
          <span className="fr-sentence">{t.text}</span>
        </li>
      ))}
    </ol>
  ) : null;
}

/** What it says it is doing, over each stage: listening, it picked up, that's your receptionist. */
function tryHead(tr: FirstRunTryVM): ReactNode {
  return (
    <div className="fr-try-head">
      <h3 className="fr-sub" data-testid="fr-try-heading">
        {tr.heading}
      </h3>
      {tr.lead ? <p className="fr-quiet">{tr.lead}</p> : null}
    </div>
  );
}

/** Listening, or still nothing: the number to call, why nothing may have come, and the skip. */
function listenStage(o: {
  tr: FirstRunTryVM;
  W: TryWords;
  showCode: () => void;
  help: () => void;
  busy: boolean;
  skipper: ReactNode;
  back: ReactNode;
}) {
  const { tr, W, showCode, help, busy, skipper, back } = o;
  const l = tr.listening;
  return (
    <div className="fr-line-step" data-testid="fr-try" data-stage={tr.stage}>
      {tryHead(tr)}
      <div className="panel fr-pane">
        <span className="fr-dial tabular" data-testid="fr-try-number">
          {tr.number}
        </span>
        <div className="fr-listen" role="status">
          <span className="fr-pulse" aria-hidden="true" />
          <span className="fr-sentence">{l && l.sentence}</span>
          <span className="fr-detail">{l && l.detail}</span>
        </div>
        {l && l.route ? (
          <p className="fr-quiet" data-testid="fr-try-route">
            {l.route}
          </p>
        ) : null}
      </div>
      {tr.causes.length ? (
        <dl className="fr-causes" data-testid="fr-try-causes">
          {tr.causes.map((c) => (
            <div key={c.question}>
              <dt>{c.question}</dt>
              <dd>{c.answer}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {tr.stage === "quiet" ? (
        <div className="fr-links">
          {tr.forwarded ? (
            <button type="button" className="link-btn" onClick={showCode} data-testid="fr-try-code">
              {W.showCode}
            </button>
          ) : null}
          {tr.help ? (
            <button
              type="button"
              className="link-btn"
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
      <div className="fr-foot">
        {back}
        {tr.dial ? (
          <a className="btn btn-lg btn-primary fr-go fr-call" href={tr.dial.tel} data-testid="fr-try-dial">
            <Icon name="phone" size={14} />
            {tr.dial.label}
          </a>
        ) : null}
      </div>
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
  back: ReactNode;
}) {
  const { tr, t, value, W, choose, go, leave, back } = o;
  return (
    <div className="fr-line-step" data-testid="fr-try" data-stage="done">
      {tryHead(tr)}
      <div className="panel fr-pane">
        <p className="fr-detail" data-testid="fr-try-meta">
          {tr.call && tr.call.line}
        </p>
        {turnsOf(tr)}
      </div>
      <div className="panel fr-pane">
        <span className="fr-label" id="fr-try-transfer-label">
          {t.label}
        </span>
        <div className="fr-stack">
          <RecordToggleGroup<string>
            id="fr-try-transfer"
            labelledBy="fr-try-transfer-label"
            value={value}
            options={t.options.map((op) => ({ value: op.key, label: op.label, hint: op.sentence }))}
            onChange={(key) => {
              const op = t.options.find((x) => x.key === key);
              if (op) choose(op);
            }}
            gate={gate("settings", "choose where callers are put through")}
            testid="fr-try-transfer"
          />
        </div>
        {t.note ? (
          <p className="fr-quiet" data-testid="fr-try-note">
            {t.note}
          </p>
        ) : null}
      </div>
      <div className="fr-foot">
        {back}
        <button
          type="button"
          className="link-btn"
          onClick={() => leave(tr.call ? tr.call.to : "")}
          data-testid="fr-try-inbox"
        >
          {W.inbox}
        </button>
        <button
          type="button"
          className="btn btn-lg btn-primary fr-go"
          onClick={() => go("start")}
          data-testid="fr-try-go"
        >
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

export const FrTry = ({ tr, W, flash, go, leave, back, backLabel, onShowCode }: TryProps) => {
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
    if (!canDo("settings")) return;
    const { saver, PATCH_OF } = businessTabSave;
    // The saver goes on the settings read's config: without it, nothing would be sent, so it says so instead.
    if (!saver.base()) {
      flash({ tone: "danger", msg: <>{W.notReadYet}</> });
      return;
    }
    setPicked(o.key);
    settled({
      send: () =>
        saver.save({
          row: "handoff_number",
          change: PATCH_OF.handoff_number(o.to || ""),
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
    <div className="fr-skip" data-testid="fr-try-skip">
      {nudged ? (
        <p className="fr-note" data-testid="fr-try-nudge">
          {tr.skip.nudge}
        </p>
      ) : null}
      <div className="fr-links">
        {nudged ? (
          <button type="button" className="link-btn" onClick={() => setNudged(false)} data-testid="fr-try-stay">
            {tr.skip.stay}
          </button>
        ) : null}
        <button
          type="button"
          className="link-btn"
          onClick={() => void skip()}
          disabled={busy}
          data-testid="fr-try-skip-go"
        >
          {nudged ? tr.skip.anyway : tr.skip.label}
        </button>
      </div>
    </div>
  );
  const way = backOf(back, backLabel, go);
  if (tr.stage === "listen" || tr.stage === "quiet")
    return listenStage({
      tr,
      W,
      showCode: onShowCode ?? (() => go("start/live")),
      help: () => void help(),
      busy,
      skipper,
      back: way,
    });
  if (tr.stage === "call") {
    return (
      <div className="fr-line-step" data-testid="fr-try" data-stage="call">
        {tryHead(tr)}
        <div className="panel fr-pane">
          <p className="fr-proof" data-testid="fr-try-proof">
            <Icon name="check" size={12} />
            {tr.call && tr.call.line}
          </p>
          {turnsOf(tr)}
          <p className="fr-detail">{tr.call && tr.call.behind}</p>
        </div>
        <div className="fr-foot">{way}</div>
      </div>
    );
  }
  if (!t0) return null;
  return doneStage({ tr, t: t0, value: picked || t0.value, W, choose, go, leave, back: way });
};
