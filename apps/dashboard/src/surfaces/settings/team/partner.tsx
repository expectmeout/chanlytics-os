/**
 * Settings › Team, its last group: the workspace's partner, or asking one by their code (decision 0020), moved from the
 * card of its own it was under the team (partner/team-card.tsx). One card now says who has access, a partner among them.
 *
 * The owner's alone: for anyone else the read is refused and nothing is drawn, and an owner previewing another role sees
 * what that role does. A group of its own under the people, as the invitations waiting are, and drawn as their rows are:
 * a disc, where things stand (nobody yet, an invitation waiting, declined or expired, a partner) with the sentence under
 * it, and the one act. It was a label-and-value row under the roles' row, the one row of the card in another grammar
 * (Ruben, 10 Oct 2026). With nobody asked it offers "Ask a partner", which opens the code's field and says what a partner
 * is.
 */
import { useEffect, useState, type SyntheticEvent } from "react";
import type { WorkspacePartnerState, WorkspacePartnerVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { RecordField } from "../../kit/record/field";
import { gate, type LegacyFlash } from "../../legacy-verbs";
import { partnerVerbs } from "../partner/surface";

/**
 * Where things stand, in a few words: the row's name. The sentence under it is contracts' (workspacePartnerVM). A partner
 * removed or gone is still the workspace's one partner (the state `partner`, not seated): "Former partner", never "Your".
 */
const PARTNER_STATE_WORDS: Record<WorkspacePartnerState, string> = {
  none: "No partner yet",
  waiting: "Invitation waiting",
  declined: "Invitation declined",
  expired: "Invitation expired",
  partner: "Your partner",
};
const partnerWords = (vm: WorkspacePartnerVM): string =>
  vm.state === "partner" && !vm.seated ? "Former partner" : PARTNER_STATE_WORDS[vm.state];
/** What a partner is, under "No partner yet": the field's own intro says the rest once it is opened. */
const PARTNER_NONE_LINE = "Someone who sets up and runs your receptionist with you.";

interface PartnerState {
  vm: WorkspacePartnerVM | null;
  problem: string | null;
  hidden: boolean;
}

/** The code's field, what a partner is, and Ask. */
function PartnerAsk({
  code,
  setCode,
  busy,
  error,
  onAsk,
}: {
  code: string;
  setCode: (v: string) => void;
  busy: boolean;
  error: string | null;
  onAsk: (e: SyntheticEvent) => void;
}) {
  const W = partnerVerbs.inviteWords;
  return (
    <form onSubmit={onAsk} className="set-team-partner-ask" data-testid="team-partner-form">
      <RecordField
        id="team-partner-code"
        label={W.codeLabel}
        value={code}
        onChange={setCode}
        hint={W.intro}
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
  );
}

/** The partner's row, read on its own (GET team/partner), under the members. */
export function PartnerRow({ flash, previewing }: { flash: (f: LegacyFlash) => void; previewing: boolean }) {
  const api = partnerVerbs;
  const W = api.inviteWords;
  // What the tab last held, drawn at once: read on mount, the card came a beat after the members on every visit, 97 to 135 px
  // at once (the Settings load review, 28 Oct 2026). The read below replaces it.
  const [state, setState] = useState<PartnerState>(() => ({ vm: api.team.held(), problem: null, hidden: false }));
  const [again, setAgain] = useState(0);
  const [asking, setAsking] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  if (state.hidden || previewing) return null;
  if (state.problem)
    return (
      <FailedRead
        kind="card"
        what={W.failed}
        why={state.problem}
        onRetry={() => setAgain((n) => n + 1)}
        testid="team-partner-failed"
      />
    );
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
    setAsking(false);
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
            Couldn&apos;t take back {W.failedAnswer}: {r.message}
          </>
        ),
      });
      return;
    }
    setAgain((n) => n + 1);
  };
  const act = vm.canWithdraw ? (
    <Button
      size="sm"
      variant="quiet"
      onClick={() => {
        if (!busy) void withdraw();
      }}
      aria-busy={busy || undefined}
      aria-describedby="team-partner-note"
      data-testid="team-partner-withdraw"
      {...gate("team", "take back the invitation")}
    >
      {busy ? W.withdrawing : W.withdraw}
    </Button>
  ) : vm.canInvite && !asking ? (
    <Button
      size="sm"
      variant="quiet"
      onClick={() => setAsking(true)}
      aria-describedby="team-partner-note"
      data-testid="team-partner-open"
    >
      {vm.state === "none" ? "Ask a partner" : "Ask again"}
    </Button>
  ) : null;
  // A partner on the team is somebody here, as a member is; anything else is somebody not, drawn as an invitation is.
  const here = vm.state === "partner" && vm.seated;
  return (
    <div className="set-team-partner" data-testid="team-partner">
      <h3 className="set-team-group">Partner</h3>
      {/* Drawn by the team row's rules, and never a member: it has no data-me, and the tests that count the card's
          people read a class that starts with set-team-row. */}
      <div className={`set-team-partner-row set-team-row${here ? "" : " pending"}`} data-testid="team-partner-row">
        <Face className="set-team-face" glyph={<Icon name={here ? "check" : "users"} size={13} />} />
        <span className="set-team-body">
          <span className="set-team-name">{partnerWords(vm)}</span>
          <span className="set-team-note" id="team-partner-note" data-testid={`team-partner-${vm.state}`}>
            {vm.sentence ?? PARTNER_NONE_LINE}
          </span>
        </span>
        {act && <span className="set-team-partner-act">{act}</span>}
      </div>
      {vm.canInvite && asking ? (
        <PartnerAsk
          code={code}
          setCode={(v) => {
            setCode(v);
            setError(null);
          }}
          busy={busy}
          error={error}
          onAsk={(e) => void ask(e)}
        />
      ) : null}
    </div>
  );
}
