/**
 * Two rows of a partner's account (moved from legacy/pages/partner-real.jsx, decision 0015 step 11): the daily letter
 * (0014), and two-step sign-in (0013), which the offer waits on too.
 */
import { useEffect, useState, type SyntheticEvent } from "react";
import type { Enrolment } from "@/auth/second-factor";
import { Button } from "../../kit/button/button";
import { RecordField, RecordSwitch } from "../../kit/record/field";
import type { LegacyFlash } from "../../legacy-verbs";
import type { PartnerApi } from "./surface";

type Flash = (f: LegacyFlash) => void;

/** The daily letter (0014): shown only when the server says where it stands, so an older database shows no switch. */
export function PartnerLettersRow({
  api,
  letters,
  flash,
}: {
  api: PartnerApi;
  letters: boolean | null | undefined;
  flash: Flash;
}) {
  const W = api.words;
  const [busy, setBusy] = useState(false);
  if (typeof letters !== "boolean") return null;
  const toggle = async (on: boolean) => {
    if (busy) return;
    setBusy(true);
    const r = await api.setLetters(on);
    setBusy(false);
    if (!r.ok)
      flash({
        tone: "warn",
        msg: (
          <>
            Couldn't change {W.lettersFailed}: {r.message}
          </>
        ),
      });
  };
  return (
    <div className="set-row" data-testid="partner-letters-row">
      <div className="set-check">
        <RecordSwitch
          labelledBy="partner-letters-label"
          on={letters}
          readOnly={busy}
          onChange={(on) => void toggle(on)}
          testid="partner-letters"
        />
        <span id="partner-letters-label">{W.letters}</span>
      </div>
    </div>
  );
}

type FactorState =
  | { phase: "reading" | "on" | "off" | "unavailable" }
  | { phase: "failed"; message: string }
  | { phase: "setup"; enrolment: Enrolment };

/** The step's hint, by its test id. */
const hint = (id: string, text: string) => (
  <span className="set-row-hint" data-testid={id}>
    {text}
  </span>
);

/**
 * Two-step sign-in (0013): a partner's account changes the receptionist of every business they brought, so it asks
 * for an authenticator's code at sign-in. Read from Supabase Auth, which holds the factor; set up in two presses:
 * scan (or type the key), then the first code, which turns it on. A project with TOTP switched off says so.
 */
export function PartnerSecondFactor({ api, flash, onOn }: { api: PartnerApi; flash: Flash; onOn?: () => void }) {
  const F = api.secondFactor;
  const W = F.words;
  const [state, setState] = useState<FactorState>({ phase: "reading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void F.state().then((r) => {
      if (live) setState(r.ok ? { phase: r.on ? "on" : "off" } : { phase: "failed", message: r.message });
    });
    return () => {
      live = false;
    };
  }, [F]);
  // Before becoming a partner, the offer waits on this (M3): partner_become asks for a session that showed a code.
  useEffect(() => {
    if (state.phase === "on" && onOn) onOn();
  }, [state.phase, onOn]);
  const start = async () => {
    setBusy(true);
    setError(null);
    const r = await F.start();
    setBusy(false);
    if (r.ok) setState({ phase: "setup", enrolment: r.enrolment });
    else if (r.unavailable) setState({ phase: "unavailable" });
    else setError(r.message);
  };
  const confirm = async (e: SyntheticEvent) => {
    e.preventDefault();
    if (busy || state.phase !== "setup") return;
    setBusy(true);
    setError(null);
    const refused = await F.confirm(state.enrolment.factorId, code);
    setBusy(false);
    if (refused) {
      setError(refused);
      return;
    }
    setCode("");
    setState({ phase: "on" });
    flash({ tone: "ok", msg: <>{W.done}</> });
  };
  return (
    <div className="set-row" data-testid="partner-second-factor">
      <div className="set-row-info">
        <span className="set-row-label">{W.title}</span>
        {state.phase === "reading" && hint("partner-second-factor-reading", W.reading)}
        {state.phase === "failed" &&
          hint("partner-second-factor-failed", `Couldn't read ${W.failed}: ${state.message}`)}
        {state.phase === "unavailable" && hint("partner-second-factor-unavailable", W.unavailable)}
        {state.phase === "on" && hint("partner-second-factor-on", W.on)}
        {state.phase === "off" && hint("partner-second-factor-intro", W.intro)}
        {state.phase === "setup" && (
          <form onSubmit={confirm} className="set-form" data-testid="partner-second-factor-setup">
            <span className="set-row-hint">{W.scan}</span>
            <img src={state.enrolment.qr} alt="" width="176" height="176" data-testid="partner-second-factor-qr" />
            <span className="set-row-hint">
              {W.keyLabel}: <code data-testid="partner-second-factor-key">{state.enrolment.secret}</code>
            </span>
            <RecordField
              label={W.codeLabel}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(words) => {
                setCode(words);
                setError(null);
              }}
              data-testid="partner-second-factor-code"
            />
            <div className="set-form-actions">
              <Button
                type="submit"
                size="sm"
                variant="primary"
                disabled={busy || !code.trim()}
                aria-busy={busy || undefined}
                data-testid="partner-second-factor-confirm"
              >
                {busy ? W.confirming : W.confirm}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                onClick={() => {
                  setState({ phase: "off" });
                  setCode("");
                  setError(null);
                }}
                disabled={busy}
                data-testid="partner-second-factor-cancel"
              >
                {W.cancel}
              </Button>
            </div>
          </form>
        )}
        {(state.phase === "on" || state.phase === "setup") && hint("partner-second-factor-lost", W.lost)}
        {error ? (
          <p className="set-error" role="alert" data-testid="partner-second-factor-error">
            {error}
          </p>
        ) : null}
      </div>
      {state.phase === "off" && (
        <Button
          size="sm"
          onClick={() => void start()}
          disabled={busy}
          aria-busy={busy || undefined}
          data-testid="partner-second-factor-start"
        >
          {busy ? W.starting : W.start}
        </Button>
      )}
    </div>
  );
}
