/**
 * Disconnect, from the card's caret (the Ads plan's 4.9; decision 0050, call 8 as amended: never refused). Three
 * screens, as the canvas draws them:
 *
 *   1. With an ad running: "Pause 1 ad and disconnect", "Keep it connected", and a quieter door, "Disconnect without
 *      pausing". With none running, one plain question.
 *   2. Disconnecting anyway, or where Meta did not confirm a pause: first that the ad keeps running, Meta keeps
 *      charging, and after this it can only be stopped in Meta; then "Disconnect anyway".
 *   3. After: the page itself, its ads listed as left in Meta (live/), and the coral button says Connect.
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

  if (leaving)
    return (
      <Sheet
        {...frame}
        title={DISCONNECT.leaveTitle(leaving.names.length)}
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
          {leaving.unconfirmed ? <p className="ads-conn-says">{DISCONNECT.notConfirmed}</p> : null}
          <div className="ads-conn-need" data-tone="warn">
            <b>{DISCONNECT.keepsRunning(leaving.names)}</b>
            <span>{DISCONNECT.onlyInMeta(leaving.names.length)}</span>
          </div>
        </div>
      </Sheet>
    );

  const some = p.running.length > 0;
  return (
    <Sheet
      {...frame}
      title={DISCONNECT.title}
      sub={p.account ?? undefined}
      foot={
        <>
          {some ? (
            <Button variant="primary" disabled={busy} onClick={() => void go(true)} data-testid="ads-disc-go">
              {DISCONNECT.pauseAndGo(p.running.length)}
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
              {DISCONNECT.running(p.running)}
            </p>
            <p className="ads-conn-says">{DISCONNECT.pauseFirst(p.running.length)}</p>
          </>
        ) : null}
        <p className="ads-conn-says">{DISCONNECT.stops}</p>
        {some ? (
          <LinkButton
            onClick={() => setLeaving({ names: p.running, unconfirmed: false })}
            data-testid="ads-disc-without"
          >
            {DISCONNECT.without}
          </LinkButton>
        ) : null}
      </div>
    </Sheet>
  );
}
