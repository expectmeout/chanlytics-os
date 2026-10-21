/**
 * Who is waiting to get in (Home), moved from the back office (surfaces/settings/platform/cards.tsx) to the Console
 * (decision 0066). The platform's own cards that stood beside it are Health's (health/speed.tsx, decision 0068). Every
 * word is the view model's, from contracts.
 */
import { useState } from "react";
import { staffMay, type ConsoleWhy, type PlatformQueueVM, type StaffRole } from "@chanlytics/contracts";
import type { PlatformApi } from "@/legacy-bridge/platform";
import { Button } from "../kit/button/button";
import type { LegacyFlash } from "../legacy-verbs";
import { WhyAsk } from "./why";

type Flash = (f: LegacyFlash) => void;
type WaitingRowVM = PlatformQueueVM["rows"][number];

/**
 * One person waiting. The only action arms first, like every other action on this page -- and unlike them it is not
 * undoable from here, so a mis-click leaves somebody waiting for a mail nobody will write.
 */
export function WaitingRow({
  row,
  P,
  role,
  onDone,
  flash,
}: {
  row: WaitingRowVM;
  P: PlatformApi;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (why: ConsoleWhy) => {
    setBusy(true);
    const r: { ok: boolean; message: string } = await Promise.resolve()
      .then(() => P.markInvited(row.id, why))
      .catch(() => ({ ok: false, message: "That did not go through." }));
    setBusy(false);
    setArm(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  return (
    <div className="set-row" data-testid="platform-queue-row">
      <div className="set-row-info">
        <span className="set-row-label">{row.email}</span>
        <span className="set-row-hint">{[row.detail, row.waited].filter(Boolean).join(" · ")}</span>
        {arm && (
          <WhyAsk
            question="Mark them as invited?"
            detail="Nothing is sent. This only records that somebody wrote to them, and takes them off the list."
            yes="Yes, mark them"
            busy={busy}
            onYes={(why) => void run(why)}
            onNo={() => setArm(false)}
            testid="platform-queue-invited"
          />
        )}
      </div>
      {!arm && staffMay(role, "waitlist_invited") && (
        <Button size="sm" onClick={() => setArm(true)} disabled={busy} data-testid="platform-queue-mark">
          Mark as invited
        </Button>
      )}
    </div>
  );
}

/** Who is knocking: the waiting list, one line when nobody is waiting. */
export function PlatformQueueCard({
  waiting,
  P,
  role,
  onDone,
  flash,
}: {
  waiting: PlatformQueueVM;
  P: PlatformApi;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  return (
    <section className="rec-card set-card" data-testid="platform-queue">
      <div className="rec-card-head">
        <h2 className="rec-card-title">Waiting to get in</h2>
        <span className="rec-card-sub set-says" data-testid="platform-queue-words">
          {waiting.sentence}
        </span>
      </div>
      {waiting.rows.length > 0 && (
        <>
          <div className="set-row">
            <div className="set-row-info">
              <span className="set-row-hint" data-testid="platform-queue-note">
                {waiting.note}
              </span>
            </div>
          </div>
          <div className="cl-attn-list" data-testid="platform-queue-rows">
            {waiting.rows.map((w) => (
              <WaitingRow key={w.id} row={w} P={P} role={role} onDone={onDone} flash={flash} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
