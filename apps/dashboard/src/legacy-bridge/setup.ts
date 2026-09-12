/**
 * Setup on the legacy page: the facts from /api/v1/setup, the rows from
 * contracts/setup.ts, "Later" as a preference on this device, one verb that
 * asks a person at Chanlytics for a line, and the landing rule — an owner
 * whose receptionist answers nowhere yet lands on Setup once per session.
 * Every write goes through the typed client; after one lands the refresh
 * map re-reads this surface.
 */
import {
  setupSteps, setupRoute, shouldLandOnSetup, type SetupDto, type SetupVM,
  forwardingCodes, forwardingTestOpen, CARRIERS, FORWARDING_MODES, CARRIER_WORDS, MODE_WORDS, formatPhoneDisplay, agoWords,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "./surface-data";
import { api, read } from "./api";
import { refreshSurfaces } from "./surface-runner";
import { getActiveWorkspace } from "./workspace";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  vm: SetupVM;
  fetchedAt: number;
}

export interface SetupApi {
  /** Put an optional row off, or take it back. A preference on this device. */
  later(id: string, on: boolean): void;
  /** Ask a person at Chanlytics for something the product cannot provision yet. */
  request(what: "line"): Promise<{ ok: boolean; already: boolean; message: string }>;
  /** The owner switches a tested capability on: a record, not a claim. Owners only; the route says so. */
  activate(kind: string): Promise<{ ok: boolean; message: string }>;
  /** And off again: the row stays, the history does. Owners only. */
  deactivate(kind: string): Promise<{ ok: boolean; message: string }>;
  /** Read the workspace again: the failed card's retry. */
  refresh(): Promise<void>;
  /** The product's own line: numbers to choose from, the one chosen, a retry. Owners only; the route says so. */
  lines: {
    search(areaCode: string): Promise<{ ok: boolean; numbers: LineChoice[]; message: string }>;
    buy(number: string, areaCode: string): Promise<{ ok: boolean; queued: boolean; message: string }>;
    retry(lineId: string): Promise<{ ok: boolean; queued: boolean; message: string }>;
  };
  /** Keep the number you have: save the carrier and the mode, then open the test window. Owners only; the route says so. */
  forwarding: {
    set(o: { number: string; carrier: string; mode: string; test_from: string }): Promise<{ ok: boolean; message: string }>;
    test(lineId: string): Promise<{ ok: boolean; message: string }>;
  };
}

/** The words and the codes the forwarding card needs, published for the classic page. */
export interface ForwardingWords {
  codes: typeof forwardingCodes;
  testOpen: typeof forwardingTestOpen;
  carriers: readonly string[];
  modes: readonly string[];
  carrierWords: Record<string, string>;
  modeWords: Record<string, string>;
  display: (e164: string | null | undefined) => string | null;
  ago: (iso: string) => string;
}

export interface LineChoice {
  e164: string;
  friendly: string;
  locality: string | null;
  region: string | null;
}

declare global {
  interface Window {
    /** Undefined until read; null when the read failed, so the page shows a retry rather than "Reading…" for ever. */
    __SETUP?: SetupSurface | null;
    __setup?: SetupApi;
    __forwarding?: ForwardingWords;
  }
}

const laterKey = () => `chanlytics.setup.later.${getActiveWorkspace() ?? "default"}`;

export function readLater(storage: Pick<Storage, "getItem"> | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(laterKey());
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeLater(ids: string[]): void {
  try { safeStorage()?.setItem(laterKey(), JSON.stringify(ids)); } catch { /* a preference, not a fact */ }
}

function safeStorage(): Storage | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

function publish(dto: SetupDto, role: string): void {
  window.__SETUP = { dto, role, vm: setupSteps({ ...dto, later: readLater() }), fetchedAt: Date.now() };
}

export const setupOverride: SurfaceOverride = {
  key: "setup",
  globals: ["__SETUP"],
  events: ["surface:setup"],
  // Every row this page derives from: a line's saga steps and the bell a step
  // raises; a channel connected or switched off; the owner's activations; the
  // business record the carriers read; Stripe's answer; the Google profile.
  // Each is published by the database (00057, 00066, 00108, 00075, 00073,
  // 00070, 00117), so a change in another tab, or by a webhook, repaints here.
  refreshOnTables: ["lines", "notifications", "tenant_channels", "capability_activations", "business_records", "billing_accounts", "google_connections"],
  apply: async () => {
    try {
      const d = await read("GET setup");
      publish(d.setup, d.role);
    } catch (e) {
      // Null, not undefined: the page draws a card with a retry instead of "Reading your workspace…" for ever.
      window.__SETUP = null;
      throw e;
    }
  },
};

export function installSetup(win: Window = window): void {
  win.__forwarding = {
    codes: forwardingCodes,
    testOpen: forwardingTestOpen,
    carriers: CARRIERS,
    modes: FORWARDING_MODES,
    carrierWords: CARRIER_WORDS,
    modeWords: MODE_WORDS,
    display: formatPhoneDisplay,
    ago: (iso) => agoWords(Date.parse(iso), Date.now()),
  };
  win.__setup = {
    later(id, on) {
      const ids = readLater();
      writeLater(on ? [...new Set([...ids, id])] : ids.filter((x) => x !== id));
      const s = win.__SETUP;
      if (s) {
        publish(s.dto, s.role);
        win.dispatchEvent(new CustomEvent("surface:setup"));
      }
    },
    async activate(kind) {
      const r = await api()("POST capabilities/[kind]", { params: { kind }, body: {} });
      return { ok: r.ok, message: r.ok ? "" : r.message };
    },
    async deactivate(kind) {
      const r = await api()("DELETE capabilities/[kind]", { params: { kind } });
      return { ok: r.ok, message: r.ok ? "" : r.message };
    },
    async refresh() {
      api().forget();
      await refreshSurfaces([setupOverride]);
    },
    lines: {
      async search(areaCode) {
        const r = await api()("POST lines/search", { body: { area_code: areaCode } });
        if (!r.ok) return { ok: false, numbers: [], message: r.message };
        return { ok: true, numbers: r.data.numbers as LineChoice[], message: "" };
      },
      async buy(number, areaCode) {
        const r = await api()("POST lines/buy", { body: { number, area_code: areaCode } });
        if (!r.ok) return { ok: false, queued: false, message: r.message };
        return { ok: r.data.ok, queued: r.data.queued, message: "" };
      },
      async retry(lineId) {
        const r = await api()("POST lines/retry", { body: { line_id: lineId } });
        if (!r.ok) return { ok: false, queued: false, message: r.message };
        return { ok: r.data.ok, queued: r.data.queued, message: r.data.ok ? "" : "It stopped again — a person at Chanlytics has it." };
      },
    },
    forwarding: {
      async set(o) {
        const r = await api()("POST lines/forwarding", { body: o });
        return { ok: r.ok, message: r.ok ? "" : r.message };
      },
      async test(lineId) {
        const r = await api()("POST lines/forwarding/test", { body: { line_id: lineId } });
        return { ok: r.ok, message: r.ok ? "" : r.message };
      },
    },
    async request(what) {
      const r = await api()("POST setup/request", { body: { what } });
      if (!r.ok) return { ok: false, already: false, message: r.message };
      const req = r.data.request;
      const already = !!req && typeof req === "object" && "already" in req && (req as { already?: unknown }).already === true;
      return { ok: true, already, message: "" };
    },
  };
  win.addEventListener("surface:setup", () => {
    let landed = false;
    try { landed = win.sessionStorage.getItem("chanlytics.setup.landed") === "1"; } catch { landed = false; }
    const s = win.__SETUP;
    if (!s || !shouldLandOnSetup(s.role, s.vm.readiness.answering, setupRoute(win.location.hash), landed)) return;
    try { win.sessionStorage.setItem("chanlytics.setup.landed", "1"); } catch { /* still land, once */ }
    const nav = (win as unknown as { appNavigate?: (to: string) => void }).appNavigate;
    if (nav) nav("admin/setup");
    else win.location.hash = "/admin/setup";
  });
}
