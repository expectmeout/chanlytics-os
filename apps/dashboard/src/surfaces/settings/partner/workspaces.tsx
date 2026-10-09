/**
 * Settings › Partner, under the account (moved from legacy/pages/partner-real.jsx, decision 0015 step 11): the workspaces
 * a partner brought (P4), the back office's own row and verdict for each they still sit on the team of, its standing and
 * what it earned them, and Open, which goes into it the way the switcher does. And (0016) a workspace set up for a
 * business: the form, and each one handed over, what its handover says, with Send again until it is accepted.
 */
import { useEffect, useState, type SyntheticEvent } from "react";
import type { PartnerHandoverVM, PartnerWorkspacesVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { RecordField } from "../../kit/record/field";
import type { LegacyFlash } from "../../legacy-verbs";
import type { PartnerApi } from "./surface";

type Flash = (f: LegacyFlash) => void;

/**
 * Set a workspace up for a business and hand it to its owner (0016): the name, the owner's address, one press. On
 * success the verb goes into the new workspace at its first run; if the invitation did not go, it stays to say so.
 */
function PartnerSetUp({
  api,
  flash,
  full,
  onMade,
}: {
  api: PartnerApi;
  flash: Flash;
  full: string | null;
  onMade: () => void;
}) {
  const H = api.handoverWords;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const make = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await api.setUp({ name: name.trim(), email: email.trim() });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    if (!r.sent) {
      setOpen(false);
      flash({ tone: "warn", msg: <>{H.notSent}</> });
      onMade();
    }
  };
  return (
    <section className="rec-card set-card" data-testid="partner-setup" aria-labelledby="partner-setup-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-setup-title">
          {H.start}
        </h2>
      </div>
      <p className="set-row-hint" data-testid="partner-setup-intro">
        {H.intro}
      </p>
      {full ? (
        <p className="set-row-hint" role="status" data-testid="partner-setup-full">
          {full}
        </p>
      ) : null}
      {!full && !open ? (
        <Button size="sm" variant="primary" onClick={() => setOpen(true)} data-testid="partner-setup-open">
          {H.start}
        </Button>
      ) : null}
      {!full && open ? (
        <form onSubmit={make} className="set-form" data-testid="partner-setup-form">
          <RecordField
            label={H.nameLabel}
            value={name}
            onChange={(words) => {
              setName(words);
              setError(null);
            }}
            autoComplete="organization"
            data-testid="partner-setup-name"
          />
          <RecordField
            label={H.emailLabel}
            type="email"
            value={email}
            onChange={(words) => {
              setEmail(words);
              setError(null);
            }}
            hint={H.emailHint}
            autoComplete="off"
            spellCheck={false}
            data-testid="partner-setup-email"
          />
          {error ? (
            <p className="set-error" role="alert" data-testid="partner-setup-error">
              {error}
            </p>
          ) : null}
          <div className="set-form-actions">
            <Button
              type="submit"
              size="sm"
              variant="primary"
              disabled={busy || name.trim().length < 2 || !email.trim()}
              aria-busy={busy || undefined}
              data-testid="partner-setup-make"
            >
              {busy ? H.making : H.make}
            </Button>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setOpen(false)}
              disabled={busy}
              data-testid="partner-setup-cancel"
            >
              {H.cancel}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

/** Send a handover again, to the address it went to or another, until its owner accepts it. */
function HandoverResend({
  api,
  h,
  flash,
  onSent,
}: {
  api: PartnerApi;
  h: PartnerHandoverVM;
  flash: Flash;
  onSent: () => void;
}) {
  const H = api.handoverWords;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(h.email);
  const [busy, setBusy] = useState(false);
  if (!h.canResend) return null;
  if (!open) {
    return (
      <Button size="sm" variant="quiet" onClick={() => setOpen(true)} data-testid={`partner-resend-open-${h.tenantId}`}>
        {H.resend}
      </Button>
    );
  }
  const send = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const r = await api.resend(h.tenantId, email.trim());
    setBusy(false);
    if (!r.ok) {
      flash({
        tone: "warn",
        msg: (
          <>
            Couldn't send {H.failedResend}: {r.message}
          </>
        ),
      });
      return;
    }
    setOpen(false);
    flash(r.sent ? { tone: "ok", msg: <>{H.sentAgain}</> } : { tone: "warn", msg: <>{H.notSent}</> });
    onSent();
  };
  return (
    <form onSubmit={send} className="set-form" data-testid={`partner-resend-${h.tenantId}`}>
      <RecordField
        label={H.resendTo}
        type="email"
        value={email}
        onChange={setEmail}
        spellCheck={false}
        data-testid={`partner-resend-email-${h.tenantId}`}
      />
      <Button
        type="submit"
        size="sm"
        variant="primary"
        disabled={busy || !email.trim()}
        aria-busy={busy || undefined}
        data-testid={`partner-resend-send-${h.tenantId}`}
      >
        {busy ? H.resending : H.resend}
      </Button>
    </form>
  );
}

/** The workspaces the partner set up that wait for an owner, or were declined: what each handover says, and Send again. */
function PartnerHandovers({
  api,
  handovers,
  flash,
  onSent,
}: {
  api: PartnerApi;
  handovers: Record<string, PartnerHandoverVM>;
  flash: Flash;
  onSent: () => void;
}) {
  const open = Object.values(handovers).filter((h) => h.state !== "accepted");
  if (!open.length) return null;
  return (
    <section className="rec-card set-card" data-testid="partner-handovers" aria-labelledby="partner-handovers-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-handovers-title">
          {api.handoverWords.waiting}
        </h2>
      </div>
      {open.map((h) => (
        <div className="set-row" key={h.tenantId} data-testid={`partner-handover-${h.tenantId}`}>
          <div className="set-row-info">
            <span className="set-row-label">{h.name}</span>
            <span className="set-row-hint" data-testid={`partner-handover-sentence-${h.tenantId}`}>
              {h.sentence}
            </span>
          </div>
          <HandoverResend api={api} h={h} flash={flash} onSent={onSent} />
        </div>
      ))}
    </section>
  );
}

interface WorkspacesState {
  vm: PartnerWorkspacesVM | null;
  handovers: Record<string, PartnerHandoverVM>;
  full: string | null;
  problem: string | null;
}

const NOTHING_YET: WorkspacesState = { vm: null, handovers: {}, full: null, problem: null };

/** The workspaces a partner brought, read when the pane opens (GET partner/workspaces), in the back office's rows. */
export function PartnerWorkspaces({ api, flash, active }: { api: PartnerApi; flash: Flash; active: boolean }) {
  const W = api.words;
  const [state, setState] = useState<WorkspacesState>(NOTHING_YET);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    setState(NOTHING_YET);
    void api.workspaces().then((r) => {
      if (!live) return;
      setState(
        r.ok
          ? { vm: r.vm, handovers: r.handovers || {}, full: r.full || null, problem: null }
          : { ...NOTHING_YET, problem: r.message },
      );
    });
    return () => {
      live = false;
    };
  }, [again, api]);
  if (state.problem) {
    return (
      <FailedRead
        kind="card"
        what={W.failedWorkspaces}
        why={state.problem}
        onRetry={() => setAgain((n) => n + 1)}
        testid="partner-workspaces-failed"
      />
    );
  }
  if (!state.vm) {
    return (
      <section className="rec-card set-card" data-testid="partner-workspaces-reading">
        <div className="set-row">
          <div className="set-row-info">
            <span className="set-row-hint">{W.readingWorkspaces}</span>
          </div>
        </div>
      </section>
    );
  }
  const vm = state.vm;
  const reread = () => setAgain((n) => n + 1);
  return (
    <>
      {active ? <PartnerSetUp api={api} flash={flash} full={state.full} onMade={reread} /> : null}
      <PartnerHandovers api={api} handovers={state.handovers} flash={flash} onSent={reread} />
      <section
        className="rec-card set-card"
        data-testid="partner-workspaces"
        aria-labelledby="partner-workspaces-title"
      >
        <div className="rec-card-head">
          <h2 className="rec-card-title" id="partner-workspaces-title">
            {W.workspaces}
          </h2>
          <span className="set-row-hint" data-testid="partner-workspaces-summary">
            {vm.summary}
          </span>
        </div>
        {/* What waits on the owner: the spend doors refuse until the workspace pays (0012, Risks). */}
        <p className="set-row-hint" data-testid="partner-spend">
          {W.spend}
        </p>
        {vm.rows.length > 0 && (
          <div className="cl-attn-list" data-testid="partner-workspace-rows">
            {vm.rows.map((r) => (
              <AttnRow
                key={r.tenantId}
                glyph="home"
                name={r.name}
                meta={r.money}
                sentence={r.standing ? `${r.sentence} ${r.standing}` : r.sentence}
                status={[r.label]}
                note={r.facts || ""}
                tone={r.tone}
                cta={
                  r.onTeam && r.verdict ? { label: W.open, kind: "ghost", onClick: () => api.open(r.tenantId) } : null
                }
                onOpen={() => {
                  if (r.onTeam && r.verdict) api.open(r.tenantId);
                }}
                testid={`partner-workspace-${r.tenantId}`}
                ctaTestid={`partner-open-${r.tenantId}`}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
