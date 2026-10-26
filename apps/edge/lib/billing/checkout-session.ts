/**
 * Checkout's two shapes (decision 0073, R16): Stripe's hosted page, which the browser is sent to, and the session made in
 * the page (embedded Checkout), which the first run's Go live mounts with its client secret and the publishable key, so
 * the owner never leaves the first run. In the page it comes back by itself where Stripe needs no redirect (a card), and
 * to the step's own address where it does (a bank's page). Pure: billing.ts makes the session.
 */

/** The way to Checkout, as the dashboard is answered: the hosted page, or what mounts it in the page. */
export type CheckoutMade = { ok: true; url: string } | { ok: true; client_secret: string; publishable_key: string };

/** How the session comes back: to the return address in the page, else to success or cancel on the hosted page. */
export function sessionReturn(inPage: boolean, success: string, cancel: string) {
  return inPage
    ? ({ ui_mode: "embedded", redirect_on_completion: "if_required", return_url: success } as const)
    : { success_url: success, cancel_url: cancel };
}

/** The session as the dashboard is answered: in the page with the key (`publishable` given), else its hosted page. */
export function checkoutMadeOf(
  session: { url?: string | null; client_secret?: string | null },
  publishable: string | null,
): CheckoutMade | { ok: false; error: "stripe_refused"; detail: string } {
  if (publishable)
    return session.client_secret
      ? { ok: true, client_secret: session.client_secret, publishable_key: publishable }
      : { ok: false, error: "stripe_refused", detail: "no client secret on the session" };
  return session.url
    ? { ok: true, url: session.url }
    : { ok: false, error: "stripe_refused", detail: "no url on the session" };
}
