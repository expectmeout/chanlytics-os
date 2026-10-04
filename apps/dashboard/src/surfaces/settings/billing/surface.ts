/**
 * Billing (moved from legacy-bridge/billing.ts with Settings › Billing, decision 0015 step 11): the row as the edge last
 * wrote it (/api/v1/billing, repainted as the webhook writes), the view model the pane and the Setup row derive from it
 * (contracts/billing.ts), and the verbs -- checkout and portal leave the app for Stripe's pages; resume and sync apply at
 * once, and after they land the refresh map re-reads this surface and Setup's, since the Setup row reads the same facts.
 *
 * The value is the seam's (`useSurface("billing")`): undefined until read, null when the read failed, so the pane shows
 * a retry rather than "Reading your billing…" for ever. `__BILLING_ACCOUNT` is its mirror and `__billing` the verbs, for
 * the frame's top bar, which says a paused workspace from them (topbar.jsx): lines to delete when the frame moves (step 13).
 */
import {
  toBillingVM,
  billingPill,
  dayWords,
  moneyWords,
  trialWords,
  priceWords,
  invoiceStatusWords,
  CHECKOUT_OUTCOME_WORDS,
  START_PLAN_WORDS,
  type BillingDto,
  type BillingVM,
  type BillingInvoiceDto,
  type CheckoutReturn,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { api, read } from "@/legacy-bridge/api";
import { refreshSurfaces } from "@/legacy-bridge/surface-runner";
import { setupOverride } from "@/surfaces/setup/surface";
import { declareSurfaceValue, setSurfaceValue } from "../../surface-values";

export interface BillingSurface {
  dto: BillingDto;
  fetchedAt: number;
}

interface BillingApi {
  vm(dto: BillingDto, nowMs?: number): BillingVM;
  /**
   * The way to Stripe Checkout: the browser leaves the app and comes back to Billing, or to the first run when it
   * asks (`"start"`). Owners only.
   */
  checkout(back?: CheckoutReturn): Promise<{ ok: boolean; message: string }>;
  /** The way to Stripe's portal. Owners only. */
  portal(): Promise<{ ok: boolean; message: string }>;
  invoices(): Promise<{ ok: boolean; invoices: BillingInvoiceDto[]; message: string }>;
  resume(): Promise<{ ok: boolean; message: string }>;
  /**
   * A free trial's plan started now (contracts maySpend: the trial covers no number, texting or lead search). Ok only
   * when Stripe says the charge went through; the billing and Setup reads are taken again either way.
   */
  startNow(): Promise<{ ok: boolean; message: string }>;
  startWords: typeof START_PLAN_WORDS;
  sync(): Promise<{ ok: boolean; message: string }>;
  /** What the browser came back from Stripe with, read once and cleared: "success", "cancel" or "portal". */
  outcome(): string | null;
  /** Read the row again: the failed card's retry, and nothing else's. */
  refresh(): Promise<void>;
  outcomeWords: Record<string, string>;
  words: {
    day: typeof dayWords;
    money: typeof moneyWords;
    trial: typeof trialWords;
    price: typeof priceWords;
    invoice: typeof invoiceStatusWords;
  };
  /** What a state means for the receptionist, for the pill beside the headline. */
  pill: typeof billingPill;
}

declare global {
  interface Window {
    __billing?: BillingApi;
  }
}

declareSurfaceValue("billing", "__BILLING_ACCOUNT");

export const billingOverride: SurfaceOverride = {
  key: "billing",
  value: "billing",
  events: ["surface:billing"],
  // The webhook writes the row on every Stripe event; the pane repaints on each.
  refreshOnTables: ["billing_accounts"],
  apply: async () => {
    try {
      const d = await read("GET billing");
      setSurfaceValue("billing", { dto: d.billing, fetchedAt: Date.now() });
    } catch (e) {
      // Null, not undefined: the pane draws its failed card with a retry instead of "Reading your billing…" for ever.
      setSurfaceValue("billing", null);
      throw e;
    }
  },
};

/** The billing verbs, each through its door. */
export const billingVerbs: BillingApi = {
  vm: (dto, nowMs) => toBillingVM(dto, nowMs),
  async checkout(back) {
    const r = await api()("POST billing/checkout", { body: back ? { return: back } : {} });
    if (!r.ok) return { ok: false, message: r.message };
    if (r.data.url) window.location.assign(r.data.url);
    return { ok: !!r.data.url, message: "" };
  },
  async portal() {
    const r = await api()("POST billing/portal", { body: {} });
    if (!r.ok) return { ok: false, message: r.message };
    if (r.data.url) window.location.assign(r.data.url);
    return { ok: !!r.data.url, message: "" };
  },
  async invoices() {
    const r = await api()("GET billing/invoices");
    if (!r.ok) return { ok: false, invoices: [], message: r.message };
    return { ok: true, invoices: r.data.invoices, message: "" };
  },
  async resume() {
    const r = await api()("POST billing/resume", { body: {} });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  async startNow() {
    // The client reads Billing and Setup again before it answers (refresh-map.ts).
    const r = await api()("POST billing/start-now", { body: {} });
    if (!r.ok) return { ok: false, message: r.message };
    return r.data.status === "active" ? { ok: true, message: "" } : { ok: false, message: START_PLAN_WORDS.unpaid };
  },
  startWords: START_PLAN_WORDS,
  async sync() {
    const r = await api()("POST billing/sync", { body: {} });
    return { ok: r.ok, message: r.ok ? "" : r.message };
  },
  outcome() {
    try {
      const q = new URLSearchParams(window.location.search);
      const outcome = q.get("billing");
      if (!outcome) return null;
      q.delete("billing");
      const rest = q.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
      );
      // Coming back from Stripe: the webhook may still be on its way, so the row is read again now.
      void refreshSurfaces([billingOverride, setupOverride]);
      return outcome;
    } catch {
      return null;
    }
  },
  outcomeWords: CHECKOUT_OUTCOME_WORDS,
  words: { day: dayWords, money: moneyWords, trial: trialWords, price: priceWords, invoice: invoiceStatusWords },
  pill: billingPill,
  async refresh() {
    api().forget();
    await refreshSurfaces([billingOverride]);
  },
};

/** The verbs for the frame's top bar, which still reads them off the window (topbar.jsx): a line to delete at step 13. */
export function installBilling(win: Window = window): void {
  win.__billing = billingVerbs;
}
