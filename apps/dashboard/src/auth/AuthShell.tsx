import type { ReactNode } from "react";

/**
 * The signed-out pages, in the product's own clothes.
 *
 * WHY THIS EXISTS. Sign-in, sign-up and the reset each rendered a lone card
 * on a dark green page, in the system font, with a teal button -- a palette
 * and a typeface the product does not use anywhere else. The OS is ink and
 * coral, set in Geist (tokens.css). Somebody signing in met one product and
 * landed in another, which is the moment a new customer decides whether this
 * is a serious piece of software.
 *
 * It takes the OS's own tokens rather than a second spelling of them, so a
 * change to the palette moves these pages too.
 *
 * THE FORM IS THE WORK, so it comes first in the markup and it is what a
 * phone gets: the panel beside it is hidden under 900px rather than stacked
 * above the fields (the app's own phone rule -- nothing decorative above the
 * thing you came to do). On a wide screen the panel earns its half by saying
 * what the product does, once.
 */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-split">
      <main className="auth-col">
        <div className="auth-colinner">
          <div className="auth-mark">
            <span className="auth-mark-dot" aria-hidden="true" />
            <span className="auth-mark-name">Chanlytics</span>
          </div>
          {children}
          {/* One copy, for the three pages. Each door carried its own, which
              is three places to forget one when a platform review asks. */}
          <p className="auth-foot">
            <a href="/privacy">Privacy</a>
            <span aria-hidden="true"> · </span>
            <a href="/terms">Terms</a>
          </p>
        </div>
      </main>
      <AuthPanel />
    </div>
  );
}

/**
 * The half beside the form: what this is, and a picture of it happening.
 *
 * The sentence is the product's own (the app's description), not a new claim
 * invented for a login page. The conversation under it is an EXAMPLE and says
 * so -- no workspace's real messages go on a page anybody can open, and a
 * fabricated number on a surface this product spent a month making truthful
 * would be the wrong first impression. It is aria-hidden: a screen reader
 * gets the sentence, not a dialogue it would have to disbelieve.
 */
function AuthPanel() {
  return (
    <aside className="auth-aside">
      <div className="auth-aside-inner">
        <h2 className="auth-aside-title">The work happens while you are with a customer.</h2>
        <p className="auth-aside-lead">
          Chanlytics answers your messages and calls, books what it can, and hands you anything it should not decide
          alone.
        </p>
        <div className="auth-show" aria-hidden="true">
          <div className="auth-show-head">
            <span className="auth-show-live" />
            WhatsApp · 9:41 PM · closed
          </div>
          <div className="auth-show-msg">Hi! Do you have anything Saturday?</div>
          <div className="auth-show-msg auth-show-out">
            We have 1:30 and 3:00 for a gloss and trim — about 90 minutes. Shall I hold one?
          </div>
          <div className="auth-show-foot">An example of your receptionist answering</div>
        </div>
      </div>
    </aside>
  );
}
