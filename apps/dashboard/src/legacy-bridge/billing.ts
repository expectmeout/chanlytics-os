/**
 * Billing on the classic pages: the row as the edge last wrote it
 * (/api/v1/billing → window.__BILLING_ACCOUNT, repainted as the webhook
 * writes), the view model the pane and the Setup row derive from it
 * (contracts/billing.ts), and the verbs — checkout and portal leave the app
 * for Stripe's pages; resume and sync apply at once and refresh this
 * surface and Setup's, since the Setup row reads the same facts.
 */
import {
  toBillingVM, dayWords, moneyWords, trialWords, priceWords, CHECKOUT_OUTCOME_WORDS,
  type BillingDto, type BillingVM, type BillingInvoiceDto,
} from "@chanlytics/contracts";
import { scoped, type SurfaceOverride } from "./surface-data";
import { read } from "./api";
import { refreshSurfaces } from "./surface-runner";
import { setupOverride } from "./setup";

export interface BillingSurface {
  dto: BillingDto;
  fetchedAt: number;
}

export interface BillingApi {
  vm(dto: BillingDto, nowMs?: number): BillingVM;
  /** The way to Stripe Checkout: the browser leaves the app and comes back to Billing. Owners only. */
  checkout(): Promise<{ ok: boolean; message: string }>;
  /** The way to Stripe's portal. Owners only. */
  portal(): Promise<{ ok: boolean; message: string }>;
  invoices(): Promise<{ ok: boolean; invoices: BillingInvoiceDto[]; message: string }>;
  resume(): Promise<{ ok: boolean; message: string }>;
  sync(): Promise<{ ok: boolean; message: string }>;
  /** What the browser came back from Stripe with, read once and cleared: "success", "cancel" or "portal". */
  outcome(): string | null;
  outcomeWords: Record<string, string>;
  words: { day: typeof dayWords; money: typeof moneyWords; trial: typeof trialWords; price: typeof priceWords };
}

declare global {
  interface Window {
    __BILLING_ACCOUNT?: BillingSurface | null;
    __billing?: BillingApi;
  }
}

export const billingOverride: SurfaceOverride = {
  key: "billing",
  globals: ["__BILLING_ACCOUNT"],
  events: ["surface:billing"],
  // The webhook writes the row on every Stripe event; the pane repaints on each.
  refreshOnTables: ["billing_accounts"],
  apply: async () => {
    const d = await read("GET billing");
    window.__BILLING_ACCOUNT = { dto: d.billing, fetchedAt: Date.now() };
  },
};

/** One request to a v1 route: the envelope's data, or its error in a sentence. Never throws. */
async function send<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, data: parsed?.data ?? null, message: "" };
    return { ok: false, data: null, message: parsed?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, data: null, message: e instanceof Error ? e.message : String(e) };
  }
}

export function installBilling(win: Window = window): void {
  win.__billing = {
    vm: (dto, nowMs) => toBillingVM(dto, nowMs),
    async checkout() {
      const r = await send<{ url: string }>("/api/v1/billing/checkout", "POST", {});
      if (r.ok && r.data?.url) win.location.assign(r.data.url);
      return { ok: r.ok && !!r.data?.url, message: r.message };
    },
    async portal() {
      const r = await send<{ url: string }>("/api/v1/billing/portal", "POST", {});
      if (r.ok && r.data?.url) win.location.assign(r.data.url);
      return { ok: r.ok && !!r.data?.url, message: r.message };
    },
    async invoices() {
      const r = await send<{ invoices: BillingInvoiceDto[] }>("/api/v1/billing/invoices", "GET");
      return { ok: r.ok, invoices: r.data?.invoices ?? [], message: r.message };
    },
    async resume() {
      const r = await send<{ status: string }>("/api/v1/billing/resume", "POST", {});
      await refreshSurfaces([billingOverride, setupOverride]);
      return { ok: r.ok, message: r.message };
    },
    async sync() {
      const r = await send<{ status: string }>("/api/v1/billing/sync", "POST", {});
      await refreshSurfaces([billingOverride, setupOverride]);
      return { ok: r.ok, message: r.message };
    },
    outcome() {
      try {
        const q = new URLSearchParams(win.location.search);
        const outcome = q.get("billing");
        if (!outcome) return null;
        q.delete("billing");
        const rest = q.toString();
        win.history.replaceState(null, "", `${win.location.pathname}${rest ? `?${rest}` : ""}${win.location.hash}`);
        // Coming back from Stripe: the webhook may still be on its way, so the row is read again now.
        void refreshSurfaces([billingOverride, setupOverride]);
        return outcome;
      } catch {
        return null;
      }
    },
    outcomeWords: CHECKOUT_OUTCOME_WORDS,
    words: { day: dayWords, money: moneyWords, trial: trialWords, price: priceWords },
  };
}
