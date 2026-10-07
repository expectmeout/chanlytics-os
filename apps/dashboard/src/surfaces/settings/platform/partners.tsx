/**
 * The back office's partners card (0012, P5), moved from legacy/pages/platform.jsx (decision 0015 step 11): what each
 * partner is owed, their status and second factor, and the workspaces the nightly check held for a person.
 */
import { useState } from "react";
import type { PlatformPartnerRowVM, PlatformPartnerWorkspaceDto } from "@chanlytics/contracts";
import type { PlatformApi } from "@/legacy-bridge/platform";
import { Confirm } from "../../kit/confirm/confirm";
import type { LegacyFlash } from "../../legacy-verbs";

type Flash = (f: LegacyFlash) => void;
type Outcome = { ok: boolean; message: string };
const DID_NOT_GO = { ok: false, message: "That did not go through." };
/** A reason or a reference is said, and fits. */
const fits = (s: string, most: number) => s.trim().length > 0 && s.trim().length <= most;

/**
 * A partner's authenticator, removed after a person checked it is them (0013): once per partner, on their first line.
 * It arms, asks why and how you checked, and says what happens; the partner sets up a new one at their next sign-in.
 */
function PartnerFactorReset({ row, P, flash }: { row: PlatformPartnerRowVM; P: PlatformApi; flash: Flash }) {
  const W = P.secondFactorWords;
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState("");
  if (!row.first || !W) return null;
  const run = async () => {
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.resetSecondFactor(row.partnerId, row.code, why.trim()))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(false);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
  };
  return (
    <div className="set-row" data-testid={`platform-partner-factor-${row.code}`}>
      <div className="set-row-info">
        {arm && (
          <Confirm
            block
            question={W.resetQuestion(row.code)}
            detail={W.resetDetail}
            yes={W.resetYes}
            no="Not now"
            danger
            typed={W.resetTyped}
            value={why}
            onType={setWhy}
            ready={fits(why, 500)}
            busy={busy}
            onYes={() => void run()}
            onNo={() => {
              setArm(false);
              setWhy("");
            }}
            testid={`platform-partner-factor-reset-${row.code}`}
          />
        )}
      </div>
      {!arm && (
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setArm(true)}
          disabled={busy}
          data-testid={`platform-partner-factor-arm-${row.code}`}
        >
          {W.resetLabel}
        </button>
      )}
    </div>
  );
}

/** A partner's line: what they earned in one currency, and on their first line the second factor's reset (0013). */
export function PartnerLine({
  row,
  P,
  onDone,
  flash,
}: {
  row: PlatformPartnerRowVM;
  P: PlatformApi;
  onDone: () => void;
  flash: Flash;
}) {
  return (
    <>
      <PartnerRow row={row} P={P} onDone={onDone} flash={flash} />
      <PartnerFactorReset row={row} P={P} flash={flash} />
    </>
  );
}

/** What pausing, closing or restoring a partner does, said where it is confirmed. */
const statusDetail = (status: string): string =>
  status === "active"
    ? "They become a partner again on every workspace a pause took them off, where the owner has not removed them since."
    : "They become a viewer on every workspace they brought, and what they hold in its conversations is released. Their earnings are kept, and mature only once they are restored.";

/**
 * One partner and one currency of what they earned (0012, P5). The one action records a payout sent by hand: it arms,
 * asks for the payment's reference, and SENDS NOTHING -- the money left from the bank, and this is the record of it.
 */
export function PartnerRow({
  row,
  P,
  onDone,
  flash,
}: {
  row: PlatformPartnerRowVM;
  P: PlatformApi;
  onDone: () => void;
  flash: Flash;
}) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");
  // The partner's own status, on their first line only: pause, close or restore, each with why.
  const [armStatus, setArmStatus] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const runStatus = async () => {
    if (!armStatus) return;
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.setStatus(row.partnerId, row.code, armStatus, why.trim()))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArmStatus(null);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const statusChoice = armStatus ? row.statusChoices.find((c) => c.status === armStatus) : null;
  const run = async () => {
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.markPaid(row.partnerId, row.code, row.currency ?? "", ref.trim(), row.payableCents))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(false);
    setRef("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    onDone();
  };
  return (
    <div className="set-row" data-testid={`platform-partner-${row.code}`}>
      <div className="set-row-info">
        <span className="set-row-label">{row.code}</span>
        <span className="set-row-hint">{row.who}</span>
        <span className="set-row-hint" data-testid={`platform-partner-money-${row.code}`}>
          {row.money}
        </span>
        {arm && (
          <Confirm
            block
            question={`${row.payLabel}?`}
            detail="Nothing is sent. This records a payout you already made, settles every payable share in it, and cannot be undone here."
            yes="Yes, record it"
            no="Not now"
            typed="the payment's reference"
            value={ref}
            onType={setRef}
            ready={fits(ref, 200)}
            busy={busy}
            onYes={() => void run()}
            onNo={() => {
              setArm(false);
              setRef("");
            }}
            testid={`platform-partner-pay-${row.code}`}
          />
        )}
        {statusChoice && armStatus && (
          <Confirm
            block
            question={`${statusChoice.label} ${row.code}?`}
            detail={statusDetail(armStatus)}
            yes={`Yes, ${statusChoice.label.toLowerCase()}`}
            no="Not now"
            danger={armStatus !== "active"}
            typed="why, for the partner"
            value={why}
            onType={setWhy}
            ready={fits(why, 500)}
            busy={busy}
            onYes={() => void runStatus()}
            onNo={() => {
              setArmStatus(null);
              setWhy("");
            }}
            testid={`platform-partner-status-${armStatus}-${row.code}`}
          />
        )}
      </div>
      {!arm && !armStatus && (
        <span className="cl-row-actions">
          {row.canPay && (
            <button
              className="btn btn-sm"
              onClick={() => setArm(true)}
              disabled={busy}
              data-testid={`platform-partner-mark-${row.code}`}
            >
              {row.payLabel}
            </button>
          )}
          {row.first &&
            row.statusChoices.map((c) => (
              <button
                key={c.status}
                className="btn btn-sm"
                onClick={() => setArmStatus(c.status)}
                disabled={busy}
                data-testid={`platform-partner-arm-${c.status}-${row.code}`}
              >
                {c.label}
              </button>
            ))}
        </span>
      )}
    </div>
  );
}

/** What a decision on a workspace a partner brought does, said where it is confirmed. */
const standingDetail = (standing: string): string =>
  standing === "disqualified"
    ? "What it still holds is void and it earns nothing more. What was paid stays paid."
    : standing === "qualified"
      ? "Its shares become payable as each one's thirty days end; any already past it are payable now."
      : "What it holds waits until somebody decides.";

/**
 * A workspace a partner brought, and a person's decision on it. The nightly check decided once; this is where what it
 * held for review is looked at. Each decision asks why -- the partner is written to about it -- and is recorded against
 * the person who made it.
 */
export function PartnerStandingRow({
  ws,
  name,
  P,
  onDone,
  flash,
}: {
  ws: PlatformPartnerWorkspaceDto;
  name: string | undefined;
  P: PlatformApi;
  onDone: () => void;
  flash: Flash;
}) {
  const vm = P.partnerStanding(ws);
  const [arm, setArm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState("");
  const run = async () => {
    if (!arm) return;
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.setStanding(ws.tenant_id, arm, why.trim()))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(null);
    setWhy("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const choice = arm ? vm.choices.find((c) => c.standing === arm) : null;
  return (
    <div className="set-row" data-testid={`platform-standing-${ws.tenant_id}`}>
      <div className="set-row-info">
        <span className="set-row-label">{name || ws.tenant_id}</span>
        <span className="set-row-hint">{vm.by}</span>
        <span className="set-row-hint" data-tone={vm.tone} data-testid={`platform-standing-words-${ws.tenant_id}`}>
          {vm.standing}
        </span>
        {choice && arm && (
          <Confirm
            block
            question={`${choice.label} ${name || "this workspace"}?`}
            detail={standingDetail(arm)}
            yes={`Yes, ${choice.label.toLowerCase()}`}
            no="Not now"
            danger={arm === "disqualified"}
            typed="why, for the partner"
            value={why}
            onType={setWhy}
            ready={fits(why, 500)}
            busy={busy}
            onYes={() => void run()}
            onNo={() => {
              setArm(null);
              setWhy("");
            }}
            testid={`platform-standing-${arm}-${ws.tenant_id}`}
          />
        )}
      </div>
      {!arm && (
        <span className="cl-row-actions">
          {vm.choices.map((c) => (
            <button
              key={c.standing}
              className="btn btn-sm"
              onClick={() => setArm(c.standing)}
              disabled={busy}
              data-testid={`platform-standing-arm-${c.standing}-${ws.tenant_id}`}
            >
              {c.label}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
