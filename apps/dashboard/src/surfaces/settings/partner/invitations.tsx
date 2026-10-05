/**
 * The workspaces asking this partner to join them (0020), moved from legacy/pages/partner-real.jsx (decision 0015 step
 * 11): each says who asked and until when. Joining says whether it earns a share, here on the pane, and the partner's
 * workspaces are read again so it is there to open.
 */
import { useEffect, useState } from "react";
import { FailedRead } from "../../kit/empty/empty";
import type { LegacyFlash } from "../../legacy-verbs";
import type { PartnerApi } from "./surface";

interface Asked {
  workspaceId: string;
  sentence: string;
}

export function PartnerInvitations({
  api,
  flash,
  onJoined,
}: {
  api: PartnerApi;
  flash: (f: LegacyFlash) => void;
  onJoined: () => void;
}) {
  const W = api.inviteWords;
  const [state, setState] = useState<{ rows: Asked[]; problem: string | null }>({ rows: [], problem: null });
  const [busy, setBusy] = useState<{ id: string; join: boolean } | null>(null);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    let live = true;
    void api.invitations().then((r) => {
      if (live) setState(r.ok ? { rows: r.rows, problem: null } : { rows: [], problem: r.message });
    });
    return () => {
      live = false;
    };
  }, [api, again]);
  if (state.problem) {
    return (
      <FailedRead
        kind="card"
        what={W.failedInvitations}
        why={state.problem}
        onRetry={() => setAgain((n) => n + 1)}
        testid="partner-invitations-failed"
      />
    );
  }
  if (!state.rows.length) return null;
  const answer = async (workspaceId: string, join: boolean) => {
    if (busy) return;
    setBusy({ id: workspaceId, join });
    const r = await api.answer(workspaceId, join);
    if (r.ok) setState((s) => ({ ...s, rows: s.rows.filter((x) => x.workspaceId !== workspaceId) }));
    setBusy(null);
    if (!r.ok) {
      flash({
        tone: "warn",
        msg: (
          <>
            Couldn't answer {W.failedAnswer}: {r.message}
          </>
        ),
      });
      return;
    }
    if (join) {
      flash({ tone: "ok", msg: <>{r.message}</> });
      onJoined();
    }
    setAgain((n) => n + 1);
  };
  const pressing = (id: string, join: boolean) => !!busy && busy.id === id && busy.join === join;
  return (
    <section
      className="rec-card set-card"
      data-testid="partner-invitations"
      aria-labelledby="partner-invitations-title"
    >
      <div className="rec-card-head">
        <h2 className="rec-card-title" id="partner-invitations-title">
          {W.invitationsTitle}
        </h2>
      </div>
      {state.rows.map((i) => (
        <div className="set-row" key={i.workspaceId} data-testid={`partner-invitation-${i.workspaceId}`}>
          <div className="set-row-info">
            <span className="set-row-hint">{i.sentence}</span>
          </div>
          <div className="set-form-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => void answer(i.workspaceId, true)}
              disabled={!!busy}
              aria-busy={pressing(i.workspaceId, true) || undefined}
              data-testid={`partner-invitation-join-${i.workspaceId}`}
            >
              {pressing(i.workspaceId, true) ? W.accepting : W.accept}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => void answer(i.workspaceId, false)}
              disabled={!!busy}
              aria-busy={pressing(i.workspaceId, false) || undefined}
              data-testid={`partner-invitation-decline-${i.workspaceId}`}
            >
              {pressing(i.workspaceId, false) ? W.declining : W.decline}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
