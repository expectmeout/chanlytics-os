"use client";

/**
 * The handover a partner set up for this person (decision 0016), asked before anything else opens, and the hook the shell
 * asks it through. Moved out of CreateWorkspace.tsx, which the frame now fetches only when it draws the create screen
 * (LegacyApp.tsx): the frame asks this on every boot, the create screen almost never draws.
 */
import { useState } from "react";
import { FIRST_RUN_ROUTE, HANDOVER_WORDS, handoverUntilWords, type OpenHandoverDto } from "@chanlytics/contracts";
import { api } from "../api";
import { switchWorkspace } from "../surface-data";

/**
 * A workspace a partner set up and handed to this person (decision 0016), asked before anything else opens: the
 * create screen for an account with no workspace yet, the app for one with some. Ownership comes with the bill, so it
 * is accepted, never assumed: Accept makes them its owner and opens it at its first run; Decline says no, and the
 * partner hears it; Not now leaves it open until its fourteen days end, and the app opens as it would have.
 *
 * Rendered INSTEAD of the app, as the create screen is. One handover at a time, the oldest first.
 */
function Handover({ handover, onDone }: { handover: OpenHandoverDto; onDone: () => void }) {
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const H = HANDOVER_WORDS;

  const accept = async () => {
    if (busy) return;
    setBusy("accept");
    setError(null);
    const r = await api()("POST handovers/[id]/accept", { params: { id: handover.tenantId } });
    if (!r.ok) {
      setBusy(null);
      setError(r.message);
      return;
    }
    // Into it at its first run, by its slug: it is not on the switcher's list yet.
    switchWorkspace(r.data.workspace.id, r.data.workspace.slug, `#/${FIRST_RUN_ROUTE}`);
  };

  const decline = async () => {
    if (busy) return;
    setBusy("decline");
    setError(null);
    const r = await api()("POST handovers/[id]/decline", { params: { id: handover.tenantId } });
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    onDone();
  };

  return (
    <div className="cw-screen" data-testid="handover">
      <div className="cw-card">
        <h1 className="cw-title">{H.title(handover.workspace)}</h1>
        <p className="cw-lede" data-testid="handover-body">
          {H.body(handover.partnerCode, handover.workspace)}
        </p>
        <p className="cw-hint" data-testid="handover-until">
          {handoverUntilWords(handover.expiresAt)}
        </p>
        {error ? (
          <p className="cw-error" role="alert" data-testid="handover-error">
            {error}
          </p>
        ) : null}
        <button
          className="cw-submit"
          type="button"
          onClick={accept}
          disabled={busy !== null}
          aria-busy={busy === "accept" || undefined}
          data-testid="handover-accept"
        >
          {busy === "accept" ? H.accepting : H.accept}
        </button>
        <p className="cw-legal">
          <button
            className="cw-link"
            type="button"
            onClick={decline}
            disabled={busy !== null}
            data-testid="handover-decline"
          >
            {busy === "decline" ? H.declining : H.decline}
          </button>
          <span aria-hidden="true">·</span>
          <button
            className="cw-link"
            type="button"
            onClick={onDone}
            disabled={busy !== null}
            data-testid="handover-later"
          >
            {H.later}
          </button>
        </p>
      </div>
    </div>
  );
}

/**
 * The ask the shell makes before anything else (0016), once the workspace list is read: the oldest handover waiting
 * for this person (GET workspaces, on the person) that they have not passed over this visit, or null. Not now and
 * Decline pass it over; Accept leaves.
 */
export function useHandoverAsk(ready: boolean, handovers: OpenHandoverDto[] | undefined): React.ReactElement | null {
  const [passed, setPassed] = useState<string[]>([]);
  if (!ready) return null;
  const next = (handovers ?? []).find((h) => !passed.includes(h.tenantId));
  if (!next) return null;
  return <Handover handover={next} onDone={() => setPassed((p) => [...p, next.tenantId])} />;
}
