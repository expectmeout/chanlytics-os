"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SECOND_FACTOR_LEVEL,
  SECOND_FACTOR_PATH,
  cleanFactorCode,
  enrolRefusalWords,
  factorCodeWords,
  factorStepNeeded,
} from "@chanlytics/contracts";

/**
 * A second factor (decision 0013), in the browser: Supabase Auth holds the authenticator, and these ask it. One place
 * for the three screens that need it: the sign-in page (where to land), the second step's own page, and the partner's
 * pane (enrolment). Each answers in contracts' words and never throws.
 */

// Any project's client: the pages pass the one they made, a test passes a stand-in.
type Auth = Pick<SupabaseClient["auth"], "mfa">;
type Client = { auth: Auth };

/** Where the first factor lands: the second step's page when the account has a factor the session has not shown. */
export async function pathAfterSignIn(supabase: Client): Promise<string> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return factorStepNeeded(data) ? SECOND_FACTOR_PATH : "/";
  } catch {
    // Unknown is "in": a session that owes its code meets the partner door, which asks again.
    return "/";
  }
}

/**
 * What the second step's page shows (0013): the code, for an account with an authenticator the session has not shown;
 * the setup, for an account a refusal said must have one (`required`, M3) and has none; else in. A read that fails
 * shows the code when one is required (the page can always sign out) and goes in otherwise, where the doors ask again.
 */
export async function secondStep(supabase: Client, required: boolean): Promise<"code" | "enrol" | "in"> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (factorStepNeeded(data)) return "code";
    if (data?.currentLevel === SECOND_FACTOR_LEVEL || !required) return "in";
    return "enrol";
  } catch {
    return required ? "code" : "in";
  }
}

/** The account's verified authenticator, if it has one. */
async function verifiedTotp(supabase: Client): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return data?.totp?.[0]?.id ?? null;
}

/** Show the code: null when it worked (the session is aal2 now), else the sentence to say. */
export async function verifyFactor(supabase: Client, typed: string): Promise<string | null> {
  const code = cleanFactorCode(typed);
  if (!code) return "Type the six digits the app shows.";
  try {
    const factorId = await verifiedTotp(supabase);
    if (!factorId) return "This account has no authenticator. Sign out and sign in again.";
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? factorCodeWords(error.message) : null;
  } catch (e) {
    return factorCodeWords(e instanceof Error ? e.message : String(e));
  }
}

/** Whether the account has a verified authenticator: on, off, or unknown (a read that failed). */
export async function factorState(
  supabase: Client,
): Promise<{ ok: true; on: boolean } | { ok: false; message: string }> {
  try {
    return { ok: true, on: (await verifiedTotp(supabase)) !== null };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** An authenticator being set up: the QR code to scan (an image address), the key to type, and its id. */
export interface Enrolment {
  factorId: string;
  qr: string;
  secret: string;
}

/** The QR code as an image address, whichever form the Auth server sent it in. */
function qrSource(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

/**
 * Start setting up an authenticator. A setup begun and never finished leaves an unverified factor behind, which would
 * refuse the next one by its name: those go first. `unavailable` says the project has not switched TOTP on.
 */
export async function startEnrolment(
  supabase: Client,
): Promise<{ ok: true; enrolment: Enrolment } | { ok: false; unavailable: boolean; message: string }> {
  try {
    const listed = await supabase.auth.mfa.listFactors();
    for (const f of listed.data?.all ?? []) {
      if (f.factor_type === "totp" && f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Chanlytics" });
    if (error || !data) {
      const r = enrolRefusalWords(error?.message);
      return { ok: false, unavailable: r.unavailable, message: r.words };
    }
    return { ok: true, enrolment: { factorId: data.id, qr: qrSource(data.totp.qr_code), secret: data.totp.secret } };
  } catch (e) {
    const r = enrolRefusalWords(e instanceof Error ? e.message : String(e));
    return { ok: false, unavailable: r.unavailable, message: r.words };
  }
}

/** Finish it with the first code: null when it worked (the factor is verified and the session aal2), else words. */
export async function confirmEnrolment(supabase: Client, factorId: string, typed: string): Promise<string | null> {
  const code = cleanFactorCode(typed);
  if (!code) return "Type the six digits the app shows.";
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    return error ? factorCodeWords(error.message) : null;
  } catch (e) {
    return factorCodeWords(e instanceof Error ? e.message : String(e));
  }
}
