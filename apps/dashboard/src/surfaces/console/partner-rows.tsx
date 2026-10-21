/**
 * The partners' rows (0012, P5), moved from the back office (surfaces/settings/platform/partners.tsx) to the Console's
 * Partners (decision 0066): what each partner is owed, their status and second factor, and the workspaces the nightly
 * check held for a person. Every act asks why first, and the partner reads the note of a decision about them, so there
 * the note is asked for. A role is offered only what it may take (staffMay): the money is Billing's and the owner's, a
 * partner's status and second factor Support's and the owner's.
 */
import { useState } from "react";
import {
  staffMay,
  type ConsoleWhy,
  type PARTNER_STANDINGS,
  type PARTNER_STATUSES,
  type PlatformPartnerRowVM,
  type PlatformPartnerWorkspaceDto,
  type StaffRole,
} from "@chanlytics/contracts";
import type { PlatformApi } from "@/legacy-bridge/platform";
import { Button } from "../kit/button/button";
import { Field } from "../kit/field/field";
import type { LegacyFlash } from "../legacy-verbs";
import { WhyAsk } from "./why";

type Flash = (f: LegacyFlash) => void;
type Outcome = { ok: boolean; message: string };
type Standing = (typeof PARTNER_STANDINGS)[number];
type PartnerStatus = (typeof PARTNER_STATUSES)[number];
const DID_NOT_GO = { ok: false, message: "That did not go through." };
const THE_PARTNER = "the partner";

/**
 * A partner's authenticator, removed after a person checked it is them (0013): once per partner, on their first line.
 * It arms, asks why and how you checked, and says what happens; the partner sets up a new one at their next sign-in.
 */
function PartnerFactorReset({ row, P, flash }: { row: PlatformPartnerRowVM; P: PlatformApi; flash: Flash }) {
  const W = P.secondFactorWords;
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row.first || !W) return null;
  const run = async (why: ConsoleWhy) => {
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.resetSecondFactor(row.partnerId, row.code, why))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(false);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
  };
  return (
    <div className="set-row" data-testid={`platform-partner-factor-${row.code}`}>
      <div className="set-row-info">
        {arm && (
          <WhyAsk
            question={W.resetQuestion(row.code)}
            detail={W.resetDetail}
            yes={W.resetYes}
            danger
            noteFor={THE_PARTNER}
            busy={busy}
            onYes={(why) => void run(why)}
            onNo={() => setArm(false)}
            testid={`platform-partner-factor-reset-${row.code}`}
          />
        )}
      </div>
      {!arm && (
        <Button
          size="sm"
          variant="quiet"
          onClick={() => setArm(true)}
          disabled={busy}
          data-testid={`platform-partner-factor-arm-${row.code}`}
        >
          {W.resetLabel}
        </Button>
      )}
    </div>
  );
}

/** A partner's line: what they earned in one currency, and on their first line the second factor's reset (0013). */
export function PartnerLine({
  row,
  P,
  role,
  onDone,
  flash,
}: {
  row: PlatformPartnerRowVM;
  P: PlatformApi;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  return (
    <>
      <PartnerRow row={row} P={P} role={role} onDone={onDone} flash={flash} />
      {staffMay(role, "partner_second_factor") && <PartnerFactorReset row={row} P={P} flash={flash} />}
    </>
  );
}

/** What pausing, closing or restoring a partner does, said where it is confirmed. */
const statusDetail = (status: string): string =>
  status === "active"
    ? "They become a partner again on every workspace a pause took them off, where the owner has not removed them since."
    : "They become a viewer on every workspace they brought, and what they hold in its conversations is released. Their earnings are kept, and mature only once they are restored.";

/**
 * One partner and one currency of what they earned (0012, P5). Recording a payout sent by hand arms, asks for the
 * payment's reference and why, and SENDS NOTHING -- the money left from the bank, and this is the record of it.
 */
export function PartnerRow({
  row,
  P,
  role,
  onDone,
  flash,
}: {
  row: PlatformPartnerRowVM;
  P: PlatformApi;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");
  // The partner's own status, on their first line only: pause, close or restore, each with why.
  const [armStatus, setArmStatus] = useState<PartnerStatus | null>(null);
  const runStatus = async (why: ConsoleWhy) => {
    if (!armStatus) return;
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.setStatus(row.partnerId, row.code, armStatus, why))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArmStatus(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const statusChoice = armStatus ? row.statusChoices.find((c) => c.status === armStatus) : null;
  const reference = ref.trim();
  const run = async (why: ConsoleWhy) => {
    if (!reference || reference.length > 200) return;
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.markPaid(row.partnerId, row.code, row.currency ?? "", reference, row.payableCents, why))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(false);
    setRef("");
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    onDone();
  };
  const mayPay = row.canPay && staffMay(role, "partner_payout");
  const mayStatus = row.first && staffMay(role, "partner_status");
  return (
    <div className="set-row" data-testid={`platform-partner-${row.code}`}>
      <div className="set-row-info">
        <span className="set-row-label">{row.code}</span>
        <span className="set-row-hint">{row.who}</span>
        <span className="set-row-hint" data-testid={`platform-partner-money-${row.code}`}>
          {row.money}
        </span>
        {arm && (
          <WhyAsk
            question={`${row.payLabel}?`}
            detail="Nothing is sent. This records a payout you already made, settles every payable share in it, and cannot be undone here."
            yes="Yes, record it"
            whole={!!reference && reference.length <= 200}
            busy={busy}
            onYes={(why) => void run(why)}
            onNo={() => {
              setArm(false);
              setRef("");
            }}
            testid={`platform-partner-pay-${row.code}`}
          >
            <Field
              label="The payment's reference"
              value={ref}
              onValueChange={setRef}
              maxLength={200}
              spellCheck={false}
              data-testid={`platform-partner-pay-${row.code}-typed`}
            />
          </WhyAsk>
        )}
        {statusChoice && armStatus && (
          <WhyAsk
            question={`${statusChoice.label} ${row.code}?`}
            detail={statusDetail(armStatus)}
            yes={`Yes, ${statusChoice.label.toLowerCase()}`}
            danger={armStatus !== "active"}
            noteFor={THE_PARTNER}
            busy={busy}
            onYes={(why) => void runStatus(why)}
            onNo={() => setArmStatus(null)}
            testid={`platform-partner-status-${armStatus}-${row.code}`}
          />
        )}
      </div>
      {!arm && !armStatus && (mayPay || mayStatus) && (
        <span className="cl-row-actions">
          {mayPay && (
            <Button
              size="sm"
              onClick={() => setArm(true)}
              disabled={busy}
              data-testid={`platform-partner-mark-${row.code}`}
            >
              {row.payLabel}
            </Button>
          )}
          {mayStatus &&
            row.statusChoices.map((c) => (
              <Button
                key={c.status}
                size="sm"
                onClick={() => setArmStatus(c.status)}
                disabled={busy}
                data-testid={`platform-partner-arm-${c.status}-${row.code}`}
              >
                {c.label}
              </Button>
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
 * held for review is looked at. Each decision asks why -- the partner is written to about it -- and is written down
 * against the person who made it.
 */
export function PartnerStandingRow({
  ws,
  name,
  P,
  role,
  onDone,
  flash,
}: {
  ws: PlatformPartnerWorkspaceDto;
  name: string | undefined;
  P: PlatformApi;
  role: StaffRole;
  onDone: () => void;
  flash: Flash;
}) {
  const vm = P.partnerStanding(ws);
  const [arm, setArm] = useState<Standing | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (why: ConsoleWhy) => {
    if (!arm) return;
    setBusy(true);
    const r: Outcome = await Promise.resolve()
      .then(() => P.setStanding(ws.tenant_id, arm, why))
      .catch(() => DID_NOT_GO);
    setBusy(false);
    setArm(null);
    flash({ tone: r.ok ? "ok" : "danger", msg: <>{r.message}</> });
    if (r.ok) onDone();
  };
  const choice = arm ? vm.choices.find((c) => c.standing === arm) : null;
  const may = staffMay(role, "partner_standing");
  return (
    <div className="set-row" data-testid={`platform-standing-${ws.tenant_id}`}>
      <div className="set-row-info">
        <span className="set-row-label">{name || ws.tenant_id}</span>
        <span className="set-row-hint">{vm.by}</span>
        <span className="set-row-hint" data-tone={vm.tone} data-testid={`platform-standing-words-${ws.tenant_id}`}>
          {vm.standing}
        </span>
        {choice && arm && (
          <WhyAsk
            question={`${choice.label} ${name || "this workspace"}?`}
            detail={standingDetail(arm)}
            yes={`Yes, ${choice.label.toLowerCase()}`}
            danger={arm === "disqualified"}
            noteFor={THE_PARTNER}
            busy={busy}
            onYes={(why) => void run(why)}
            onNo={() => setArm(null)}
            testid={`platform-standing-${arm}-${ws.tenant_id}`}
          />
        )}
      </div>
      {!arm && may && (
        <span className="cl-row-actions">
          {vm.choices.map((c) => (
            <Button
              key={c.standing}
              size="sm"
              onClick={() => setArm(c.standing)}
              disabled={busy}
              data-testid={`platform-standing-arm-${c.standing}-${ws.tenant_id}`}
            >
              {c.label}
            </Button>
          ))}
        </span>
      )}
    </div>
  );
}
