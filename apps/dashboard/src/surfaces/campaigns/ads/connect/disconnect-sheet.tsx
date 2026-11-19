/**
 * Disconnect, from the card's caret (the Ads plan's 4.9; decision 0050, call 8 as amended: never refused). Three
 * screens, as the canvas draws them:
 *
 *   1. With an ad left on: "Pause 1 ad and disconnect", "Keep it connected", and a quieter door, "Disconnect without
 *      pausing". With none left on, one plain question.
 *   2. Disconnecting anyway, or where Meta did not confirm a pause: first that the ad stays on, Meta keeps charging,
 *      and after this it can only be stopped in Meta; then "Disconnect anyway".
 *   3. After: the page itself, its ads listed as left in Meta (live/), and the coral button says Connect.
 *
 * An ad is left on where it is running, or where Meta is still checking it with its own switch on: that one starts by
 * itself once approved, after the owner has gone, so it is paused first with the rest and named with them. Where Meta
 * has signed Chanlytics out nothing can be paused from here, so no pause is offered: the sheet opens on the second
 * screen and says why.
 *
 * The owner's alone: the page hands it in only where they may press it.
 */
import { useState } from "react";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Sheet } from "../../../kit/sheet/sheet";
import { DISCONNECT } from "./words";

/** What a disconnect came to, as the page's hook answers it. */
export type Disconnected =
  { outcome: "disconnected" | "not_paused"; names: string[] } | { outcome: "failed"; why: string };

interface DisconnectSheetProps {
  open: boolean;
  /** Who Meta charges, under the title: `Harbor ads · US dollars`. */
  account: string | null;
  /** The ads Meta last said were running, by name. */
  running: readonly string[];
  /** The ads Meta was still checking, their own switch on, by name: each starts once Meta approves it. */
  checking: readonly string[];
  /** Whether Chanlytics can pause an ad now: not where Meta signed it out. */
  canPause: boolean;
  disconnect: (pause: boolean) => Promise<Disconnected>;
  onClose: () => void;
  /** Disconnected: the page reads again and says so. */
  onDone: () => void;
  onFailed: (why: string) => void;
}

export function DisconnectSheet(p: DisconnectSheetProps) {
  // The ads the second screen names: the running ones, or the ones Meta did not confirm a pause for.
  const [leaving, setLeaving] = useState<{ names: readonly string[]; unconfirmed: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setLeaving(null);
    p.onClose();
  };
  const go = async (pause: boolean) => {
    setBusy(true);
    const answer = await p.disconnect(pause);
    setBusy(false);
    if (answer.outcome === "failed") return p.onFailed(answer.why);
    if (answer.outcome === "not_paused") return setLeaving({ names: answer.names, unconfirmed: true });
    setLeaving(null);
    return p.onDone();
  };
  const keep = (
    <Button variant="quiet" onClick={close} data-testid="ads-disc-keep">
      {DISCONNECT.keep}
    </Button>
  );
  const frame = { open: p.open, onClose: close, close: { label: "Close", glyph: <Icon name="x" size={13} /> } };
  const leftOn = [...p.running, ...p.checking];
  const some = leftOn.length > 0;
  // Signed out, nothing can be paused first: the sheet opens on what stays on.
  const staying = leaving ?? (some && !p.canPause ? { names: leftOn, unconfirmed: false } : null);

  if (staying) {
    // The names the second screen says, each as what it is: one Meta was checking, or one that runs.
    const waits = staying.names.filter((name) => p.checking.includes(name));
    const runs = staying.names.filter((name) => !p.checking.includes(name));
    const reason = !p.canPause ? DISCONNECT.cantPause : staying.unconfirmed ? DISCONNECT.notConfirmed : null;
    return (
      <Sheet
        {...frame}
        title={DISCONNECT.leaveTitle(runs.length, waits.length)}
        sub={p.account ?? undefined}
        foot={
          <>
            <Button
              variant="secondary"
              tone="danger"
              disabled={busy}
              onClick={() => void go(false)}
              data-testid="ads-disc-anyway"
            >
              {DISCONNECT.anyway}
            </Button>
            {keep}
          </>
        }
        flatFoot
        fit
        testid="ads-disc-sheet"
      >
        <div className="ads-conn ads-conn-open" data-screen="leave">
          {reason ? <p className="ads-conn-says">{reason}</p> : null}
          <div className="ads-conn-need" data-tone="warn">
            <b>{DISCONNECT.staysOn(runs, waits)}</b>
            <span>{DISCONNECT.onlyInMeta(staying.names.length)}</span>
          </div>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      {...frame}
      title={DISCONNECT.title}
      sub={p.account ?? undefined}
      foot={
        <>
          {some ? (
            <Button variant="primary" disabled={busy} onClick={() => void go(true)} data-testid="ads-disc-go">
              {DISCONNECT.pauseAndGo(leftOn.length)}
            </Button>
          ) : (
            <Button
              variant="secondary"
              tone="danger"
              disabled={busy}
              onClick={() => void go(false)}
              data-testid="ads-disc-go"
            >
              {DISCONNECT.go}
            </Button>
          )}
          {keep}
        </>
      }
      flatFoot
      fit
      testid="ads-disc-sheet"
    >
      <div className="ads-conn ads-conn-open" data-screen="ask">
        {some ? (
          <>
            <p className="ads-conn-says" data-strong="true">
              {DISCONNECT.on(p.running, p.checking)}
            </p>
            <p className="ads-conn-says">{DISCONNECT.pauseFirst(p.running.length, p.checking.length)}</p>
          </>
        ) : null}
        <p className="ads-conn-says">{DISCONNECT.stops}</p>
        {some ? (
          <LinkButton onClick={() => setLeaving({ names: leftOn, unconfirmed: false })} data-testid="ads-disc-without">
            {DISCONNECT.without}
          </LinkButton>
        ) : null}
      </div>
    </Sheet>
  );
}
