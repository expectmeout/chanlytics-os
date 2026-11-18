"use client";

/**
 * It's yours (decision 0079's amendment of 18 November 2026; the redesign's canvas, 8): the moment a preview becomes
 * theirs, drawn by the sign-up screen (SignupScreen.tsx) in place of its form once a claim is made, before the
 * workspace's setup opens.
 */
import { LEAD_PREVIEW_WORDS, SECOND_MS } from "@chanlytics/contracts";
import AuthShell from "@/auth/AuthShell";
import { openClaimed, type SignupPreview } from "@/auth/preview-claim";

/** How long It's yours stands before its setup opens by itself. */
export const YOURS_OPENS_MS = 6 * SECOND_MS;

/**
 * It's yours (the redesign's canvas, 8): the moment a preview becomes theirs, said before its setup opens. That it is
 * theirs, what came with it, counted from its record (server/previews/claim.ts), Continue, and what happens next: its
 * setup opens by itself, and leaves out what they already did on the preview.
 */
export function yoursCard(preview: SignupPreview, slug: string) {
  const words = LEAD_PREVIEW_WORDS.signup.yours;
  return (
    <AuthShell bare>
      <div className="auth-card auth-claim auth-yours" role="status" data-testid="signup-yours">
        <span className="auth-done" aria-hidden="true">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20 6 9 17l-5-5" pathLength={1} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <h1>{words.title}</h1>
        <p>{words.body(preview.business)}</p>
        {preview.counts.length ? (
          <div className="auth-counts" data-testid="signup-yours-counts">
            {preview.counts.map((count) => (
              <span key={count}>{count}</span>
            ))}
          </div>
        ) : null}
        <button type="button" onClick={() => openClaimed(slug)} data-testid="signup-yours-go">
          {words.go}
        </button>
        <div className="hint">{preview.skips ? `${words.next} ${preview.skips}` : words.next}</div>
      </div>
    </AuthShell>
  );
}
