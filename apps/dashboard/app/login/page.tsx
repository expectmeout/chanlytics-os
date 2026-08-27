"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Email OTP-code sign-in (no magic-link redirect allowlist to manage).
 * Step 1: email -> Supabase sends a 6-digit code. Step 2: verify the code.
 */
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) setError(error.message);
    else setStage("code");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    setBusy(false);
    if (error) setError(error.message);
    else {
      router.replace("/");
      router.refresh();
    }
  }

  return (
    <main className="auth-card">
      <h1>Chanlytics OS</h1>
      <p>Sign in with your work email.</p>
      {stage === "email" ? (
        <form onSubmit={sendCode}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />
          <button disabled={busy}>{busy ? "Sending code…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={verifyCode}>
          <label htmlFor="code">Enter the 6-digit code sent to {email}</label>
          <input
            id="code"
            inputMode="numeric"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <button disabled={busy}>{busy ? "Verifying…" : "Sign in"}</button>
        </form>
      )}
      {error && <div className="error">{error}</div>}
      <div className="hint">Access is invite-only. Ask your Chanlytics contact to add you.</div>
    </main>
  );
}
