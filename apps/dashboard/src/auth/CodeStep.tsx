"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { SIGNIN_RESEND_COOLDOWN_S, resendLeft } from "@chanlytics/contracts";

/**
 * The six-digit code screen, once, for the three places that need it:
 * confirming a new address, signing in without a password, and resetting a
 * password.
 *
 * It owns the SCREEN, not the meaning. What a code proves differs at each
 * door -- one confirms an address, one opens a session, one authorises a new
 * password -- so verification stays with the page that knows which, and this
 * takes it as `onSubmit`. What is genuinely the same at all three is
 * everything around it: the input, the sixty-second wait before another code
 * may be asked for, the way back to the address field, and the error region
 * that ANNOUNCES rather than merely paints (a screen-reader user otherwise
 * hears nothing and resubmits into silence).
 *
 * The cooldown is counted from when the code went out, not from ticks, so a
 * tab that slept counts what really passed.
 */
export default function CodeStep({
  email,
  label,
  submitLabel,
  onSubmit,
  onResend,
  onBack,
  backLabel = "Use a different email",
  children,
}: {
  email: string;
  label: string;
  submitLabel: string;
  /** Judge the code. Returns a sentence to show, or null when it worked. */
  onSubmit: (code: string) => Promise<string | null>;
  /** Ask for another code. Returns a sentence to show, or null. */
  onResend: () => Promise<string | null>;
  onBack?: () => void;
  backLabel?: string;
  /** Anything the door needs beside the code — the new password, on a reset. */
  children?: ReactNode;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(SIGNIN_RESEND_COOLDOWN_S);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const sentAt = useRef<number | null>(Date.now());
  const field = useRef<HTMLInputElement | null>(null);

  const startCooldown = useCallback(() => {
    sentAt.current = Date.now();
    setCooldown(SIGNIN_RESEND_COOLDOWN_S);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      const left = resendLeft(sentAt.current, Date.now());
      setCooldown(left);
      if (left <= 0 && timer.current) clearInterval(timer.current);
    }, 1000);
  }, []);

  // A code is already on its way when this renders, so the wait starts now.
  useEffect(() => {
    startCooldown();
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [startCooldown]);

  // autoFocus is a no-op under SSR: the node already exists in the server HTML,
  // so React hydrates it and never calls .focus(). Otherwise this screen opens
  // with a dead click into the page.
  useEffect(() => { field.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const said = await onSubmit(code.trim());
    setBusy(false);
    if (said) setError(said);
  }

  async function resend() {
    setBusy(true);
    setError(null);
    const said = await onResend();
    setBusy(false);
    if (said) setError(said);
    else startCooldown();
  }

  return (
    <form onSubmit={submit}>
      {/* The account this form belongs to, for the password manager rather than
          the person. A manager offered a lone six-digit field and a new-password
          field has no idea WHICH credential it is being asked to save, so on the
          reset door it either saves nothing or saves it against the wrong
          account. Hidden, read-only, and never submitted anywhere. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <label htmlFor="code">{label}</label>
      <input
        id="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        required
        ref={field}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="123456"
      />
      {children}
      <button disabled={busy}>{busy ? "Checking…" : submitLabel}</button>
      <div className="hint">
        {cooldown > 0 ? (
          <span>Didn&apos;t get it? Resend in {cooldown}s. </span>
        ) : (
          <button type="button" className="auth-linkbtn" onClick={() => void resend()} disabled={busy}>
            Resend code
          </button>
        )}
        {onBack && (
          <button type="button" className="auth-linkbtn auth-linkbtn-spaced" onClick={onBack} disabled={busy}>
            {backLabel}
          </button>
        )}
      </div>
      <div role="alert" aria-live="assertive">
        {error && <div className="error">{error}</div>}
      </div>
    </form>
  );
}
