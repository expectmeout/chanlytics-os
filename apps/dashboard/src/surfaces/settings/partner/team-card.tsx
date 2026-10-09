/**
 * Settings › Team, below the team (0020), moved from legacy/pages/partner-real.jsx (decision 0015 step 11): the
 * workspace's partner, or asking one by their code. The owner's alone: for anyone else the read is refused and nothing is
 * drawn, and an owner's View as another role sees what that role does.
 */
import { useEffect, useState, type SyntheticEvent } from "react";
import type { WorkspacePartnerVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { RecordField } from "../../kit/record/field";
import { RecordRow } from "../../kit/record/row";
import { gate, onRolesChanged, viewAsRole, type LegacyFlash } from "../../legacy-verbs";
import { TeamSection } from "../team/team";
import { partnerVerbs } from "./surface";

type Flash = (f: LegacyFlash) => void;

interface CardState {
  vm: WorkspacePartnerVM | null;
  problem: string | null;
  hidden: boolean;
}

function TeamPartnerCard({ flash }: { flash: Flash }) {
  const api = partnerVerbs;
  const W = api.inviteWords;
  const [state, setState] = useState<CardState>({ vm: null, problem: null, hidden: false });
  const [again, setAgain] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setViewing] = useState(0);
  useEffect(() => {
    let live = true;
    void api.team.read().then((r) => {
      if (!live) return;
      if (r.ok) setState({ vm: r.vm, problem: null, hidden: false });
      else setState({ vm: null, problem: r.message, hidden: r.code === "forbidden" });
    });
    return () => {
      live = false;
    };
  }, [api, again]);
  // View as is announced as team:changed (the role store's setViewAs).
  useEffect(() => onRolesChanged(() => setViewing((n) => n + 1)), []);
  const viewingAs = viewAsRole();
  const previewing = !!viewingAs && viewingAs !== "owner";
  if (state.hidden || previewing) return null;
  if (state.problem) {
    return (
      <FailedRead
        kind="card"
        what={W.failed}
        why={state.problem}
        onRetry={() => setAgain((n) => n + 1)}
        testid="team-partner-failed"
      />
    );
  }
  if (!state.vm) return null;
  const vm = state.vm;
  const ask = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    const r = await api.team.invite(code);
    setBusy(false);
    // Read again either way: a refusal that came after the ask was kept (a timeout) must not invite a second press.
    setAgain((n) => n + 1);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setCode("");
    if (!r.sent) flash({ tone: "warn", msg: <>{W.notSent}</> });
  };
  const withdraw = async () => {
    if (busy) return;
    setBusy(true);
    const r = await api.team.withdraw();
    setBusy(false);
    if (!r.ok) {
      flash({
        tone: "warn",
        msg: (
          <>
            Couldn't take back {W.failedAnswer}: {r.message}
          </>
        ),
      });
      return;
    }
    setAgain((n) => n + 1);
  };
  return (
    <section className="rec-card set-card" data-testid="team-partner" aria-labelledby="team-partner-title">
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="team-partner-title">
          {W.title}
        </h2>
      </div>
      {vm.sentence || vm.canWithdraw ? (
        <RecordRow
          id="team-partner-status"
          label="Status"
          value={vm.sentence ? <span data-testid={`team-partner-${vm.state}`}>{vm.sentence}</span> : null}
          act={
            vm.canWithdraw
              ? {
                  label: busy ? W.withdrawing : W.withdraw,
                  onClick: () => {
                    if (!busy) void withdraw();
                  },
                  gate: gate("team", "take back the invitation"),
                  testid: "team-partner-withdraw",
                }
              : null
          }
        />
      ) : null}
      {vm.canInvite && vm.state === "none" ? (
        <RecordRow id="team-partner-about" label="A partner" value={<span className="rec-row-hint">{W.intro}</span>} />
      ) : null}
      {vm.canInvite ? (
        <form onSubmit={ask} className="set-invite" data-testid="team-partner-form">
          <RecordField
            id="team-partner-code"
            label={null}
            aria-label={W.codeLabel}
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            placeholder={W.codePlaceholder}
            autoComplete="off"
            spellCheck={false}
            data-testid="team-partner-code"
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || !code.trim()}
            aria-busy={busy || undefined}
            data-testid="team-partner-ask"
            {...gate("team", "ask a partner to join")}
          >
            {busy ? W.inviting : W.invite}
          </Button>
          {error ? (
            <p className="set-error" role="alert" data-testid="team-partner-error">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}

/** Settings › Team: the team, then its partner card. Published on the Partner pane as its Team (settings/globals.ts). */
export function PaneTeam({ flash }: { flash: Flash }) {
  return (
    <>
      <TeamSection flash={flash} />
      <TeamPartnerCard flash={flash} />
    </>
  );
}
