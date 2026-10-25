/**
 * Stripe's embedded Checkout in the page (decision 0073, R16): the first run's Go live pays where the owner is, with the
 * session our edge made (its client secret) and Stripe's publishable key. Stripe.js is loaded from js.stripe.com, as
 * Stripe requires, on the step that mounts it (never before), and once; the policy names its hosts (csp.ts). No npm
 * package: the loader is this, and the checkout itself is Stripe's frame. This is the one module that touches Stripe.js.
 *
 * What the page hears: the checkout mounted, the payment done (Stripe's own `onComplete`, where no redirect was needed),
 * and a failure to load or mount, told apart from a card Stripe declined, which Stripe says inside its own frame.
 */

/** The part of Stripe.js this uses. */
interface StripeLike {
  initEmbeddedCheckout(o: {
    fetchClientSecret: () => Promise<string>;
    onComplete?: () => void;
  }): Promise<{ mount(el: HTMLElement | string): void; destroy(): void }>;
}

type StripeFactory = (key: string) => StripeLike;

const STRIPE_JS = "https://js.stripe.com/v3/";

let loading: Promise<StripeFactory> | null = null;

/** Stripe.js's own global, once its script has run; null before. */
function stripeOnWindow(): StripeFactory | null {
  const S: unknown = Reflect.get(window, "Stripe");
  return typeof S === "function" ? (S as StripeFactory) : null;
}

/** Stripe.js, loaded once on the first ask. */
const loadStripe = (): Promise<StripeFactory> => {
  if (loading) return loading;
  loading = new Promise<StripeFactory>((resolve, reject) => {
    const ready = () => {
      const S = stripeOnWindow();
      if (S) resolve(S);
      else reject(new Error("Stripe.js loaded without Stripe"));
    };
    if (stripeOnWindow()) return ready();
    const s = document.createElement("script");
    s.src = STRIPE_JS;
    s.async = true;
    s.onload = ready;
    s.onerror = () => {
      loading = null;
      reject(new Error("Stripe.js could not be loaded"));
    };
    document.head.appendChild(s);
  });
  return loading;
};

/** The loader a mount uses: Stripe.js, or a test's own (setStripeLoader). */
let stripeLoader: () => Promise<StripeFactory> = loadStripe;

/** For tests: the loader the next mount uses (null puts the real one back). */
export function setStripeLoader(f: (() => Promise<StripeFactory>) | null): void {
  loading = null;
  stripeLoader = f ?? loadStripe;
}

/** A checkout mounted: taken down when the step goes. */
export interface EmbeddedCheckout {
  destroy(): void;
}

/**
 * Mount Stripe's embedded Checkout in `el` for the session `secret` was made for. `onComplete` is Stripe's: the payment
 * went through without leaving the page (the plan then lands by the webhook, which Setup's read shows). Null where
 * Stripe.js could not be loaded or the checkout not mounted, said as `failed`.
 */
export async function mountCheckout(
  el: HTMLElement,
  o: { key: string; secret: string; onComplete: () => void; failed: (why: string) => void },
): Promise<EmbeddedCheckout | null> {
  try {
    const Stripe = await stripeLoader();
    const checkout = await Stripe(o.key).initEmbeddedCheckout({
      fetchClientSecret: () => Promise.resolve(o.secret),
      onComplete: o.onComplete,
    });
    checkout.mount(el);
    return { destroy: () => checkout.destroy() };
  } catch (e) {
    o.failed(e instanceof Error ? e.message : String(e));
    return null;
  }
}
