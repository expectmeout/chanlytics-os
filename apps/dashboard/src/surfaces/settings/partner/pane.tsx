/**
 * Settings › Partner (decision 0012), moved from legacy/pages/partner-real.jsx (decision 0015 step 11). Settings' page
 * draws it by its old name, `PanePartner`, and Team by `PanePartner.Team`, which seed-globals publishes
 * (settings/globals.ts).
 *
 * For a person who is not a partner: the offer, the code to choose, the terms, one press. For a partner: the link to
 * hand out, the share their row holds, how many workspaces came through the link, and what the ledger holds for them:
 * held, payable and paid. Nothing here states a number the database does not hold: the share is the row's, the count is
 * the memberships', and every sum is partner_balance's (00203); a zero is said as a zero. Under it, the workspaces they
 * brought (workspaces.tsx), and the workspaces asking them to join (invitations.tsx).
 */
import { useCallback, useState, type SyntheticEvent } from "react";
import { FailedRead } from "../../kit/empty/empty";
import { Icon } from "../../kit/icon/icon";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { PartnerLettersRow, PartnerSecondFactor } from "./account";
import { PartnerInvitations } from "./invitations";
import { partnerVerbs, type PartnerSurface } from "./surface";
import { PartnerWorkspaces } from "./workspaces";

type Flash = (f: LegacyFlash) => void;

/** How long the link's button says it was copied. */
const COPIED_MS = 1500;

/** The offer, for a person who is not a partner yet. Two-step sign-in comes first (0013, M3). */
function PartnerOffer({ flash }: { flash: Flash }) {
  const api = partnerVerbs;
  const W = api.words;
  const [code, setCode] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorOn, setFactorOn] = useState(false);
  const factorIsOn = useCallback(() => setFactorOn(true), []);
  // The offer's own row, and the button waits for it to be on.
  const needsFactor = !!api.secondFactor && !factorOn;
  const become = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || !agreed || needsFactor) return;
    setBusy(true);
    setError(null);
    const r = await api.become(code);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    flash({ tone: "ok", msg: <>You are a partner. Your link is below.</> });
  };
  return (
    <section className="rec-card set-card" data-testid="set-partner-offer" aria-labelledby="set-partner-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="set-partner-title">
          {W.title}
        </h2>
      </div>
      <p className="set-row-hint" data-testid="partner-offer">
        {W.offer} The share is {api.offerShare}.
      </p>
      {api.secondFactor ? (
        <>
          {needsFactor ? (
            <p className="set-row-hint" data-testid="partner-factor-first">
              {api.secondFactor.words.becomeFirst}
            </p>
          ) : null}
          <PartnerSecondFactor api={api} flash={flash} onOn={factorIsOn} />
        </>
      ) : null}
      <form onSubmit={become} className="set-form" data-testid="partner-become-form">
        <label className="set-field">
          <span className="set-field-label">{W.codeLabel}</span>
          <input
            className="input"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(null);
            }}
            placeholder="your-name"
            autoComplete="off"
            spellCheck={false}
            data-testid="partner-code"
          />
          <span className="set-row-hint">{W.codeHint}</span>
        </label>
        <p className="set-row-hint" data-testid="partner-terms">
          {W.terms}
        </p>
        <label className="set-check">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            data-testid="partner-agree"
          />
          <span>{W.termsAgree}</span>
        </label>
        {error ? (
          <p className="set-error" role="alert" data-testid="partner-error">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="btn"
          disabled={busy || !agreed || !code.trim() || needsFactor}
          aria-busy={busy || undefined}
          data-testid="partner-become"
        >
          {busy ? W.becoming : W.become}
        </button>
      </form>
    </section>
  );
}

/** A partner's account: the link, the share, the ledger, the count; then who asks them in, and what they brought. */
function PartnerAccount({
  account,
  flash,
}: {
  account: PartnerSurface & { dto: NonNullable<PartnerSurface["dto"]> };
  flash: Flash;
}) {
  const api = partnerVerbs;
  const W = api.words;
  const [copied, setCopied] = useState(false);
  const [joined, setJoined] = useState(0);
  const vm = api.vm(account.dto, account.balance);
  const E = vm.earnings;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vm.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      flash({ tone: "warn", msg: <>Couldn't copy — select the link and copy it yourself.</> });
    }
  };
  return (
    <>
      <section className="rec-card set-card" data-testid="set-partner" aria-labelledby="set-partner-title">
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="set-partner-title">
            {W.tab}
          </h2>
        </div>
        {vm.standing ? (
          <p className="set-row-hint" role="status" data-testid="partner-standing">
            {vm.standing}
          </p>
        ) : null}
        <div className="set-row" data-testid="partner-link-row">
          <div className="set-row-info">
            <span className="set-row-label">{W.linkLabel}</span>
            <code className="set-row-value" data-testid="partner-link">
              {vm.link}
            </code>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => void copy()} data-testid="partner-copy">
            <Icon name="copy" size={13} /> {copied ? W.copied : W.copy}
          </button>
        </div>
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-label">Your share</span>
            <span className="set-row-hint" data-testid="partner-share">
              {vm.share}, for as long as it pays.
            </span>
          </div>
        </div>
        <div className="set-row" data-testid="partner-earnings">
          <div className="set-row-info">
            <span className="set-row-label">{W.earnings}</span>
            {E.none ? (
              <span className="set-row-hint" data-testid="partner-earnings-none">
                {W.noneYet}
              </span>
            ) : (
              <>
                <span className="set-row-hint" data-testid="partner-held">
                  {E.held}
                </span>
                <span className="set-row-hint" data-testid="partner-payable">
                  {E.payable}
                </span>
                <span className="set-row-hint" data-testid="partner-paid">
                  {E.paid}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint" data-testid="partner-brought">
              {vm.brought}
            </span>
            <span className="set-row-hint" data-testid="partner-since">
              {vm.since}
            </span>
          </div>
        </div>
        <PartnerLettersRow api={api} letters={account.dto.letters} flash={flash} />
        {api.secondFactor ? <PartnerSecondFactor api={api} flash={flash} /> : null}
      </section>
      <PartnerInvitations api={api} flash={flash} onJoined={() => setJoined((n) => n + 1)} />
      <PartnerWorkspaces key={joined} api={api} flash={flash} active={account.dto.status === "active"} />
    </>
  );
}

export function PanePartner({ flash }: { flash: Flash }) {
  const P = useSurface("partner");
  const W = partnerVerbs.words;
  if (P === undefined) {
    return (
      <section className="fl-card set-card" data-testid="partner-loading">
        <div className="fl-card-head">
          <h2 className="fl-card-title">{W.tab}</h2>
        </div>
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">{W.reading}</span>
          </div>
        </div>
      </section>
    );
  }
  if (P === null) {
    return (
      <FailedRead
        kind="card"
        what={W.failed}
        body="Nothing changes while this page cannot read it."
        onRetry={() => void partnerVerbs.refresh()}
        testid="partner-failed"
        retryTestid="partner-retry"
      />
    );
  }
  if (!P.dto) return <PartnerOffer flash={flash} />;
  return <PartnerAccount account={{ ...P, dto: P.dto }} flash={flash} />;
}
