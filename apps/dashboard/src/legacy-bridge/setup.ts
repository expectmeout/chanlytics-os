/**
 * Setup for the legacy pages: the facts from /api/v1/setup, the rows from
 * contracts/setup.ts, the rows this member put off (their saved view, on every
 * device), one verb that asks a person at Chanlytics for a line, the first
 * run's helpers (contracts/first-run.ts, as window.__firstRun), the first
 * run's ask for the receptionist (set up from what is known), and the landing
 * rule — an owner whose receptionist answers nowhere yet lands on the first
 * run once per session. Every write goes through the typed client; after one
 * lands the refresh map re-reads this surface.
 */
import {
  setupSteps,
  setupLaterOf,
  shouldLandOnFirstRun,
  FIRST_RUN_HELPERS,
  FIRST_RUN_LANDED_KEY,
  FIRST_RUN_ROUTE,
  SETUP_LATER_REFUSED,
  type SetupDto,
  type SetupVM,
  type SetupRequestKind,
  forwardingCodes,
  forwardingTestOpen,
  CARRIERS,
  forwardingDialLabel,
  FORWARDING_MODES,
  CARRIER_WORDS,
  FORWARDING_MODE_WORDS,
  formatPhoneDisplay,
  agoWords,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "./surface-data";
import { api, read } from "./api";
import { refreshSurfaces } from "./surface-runner";
import { saveView } from "./people-detail";
import { goToRoute, routeOnScreen } from "./workspace";

export interface SetupSurface {
  dto: SetupDto;
  role: string;
  /** The rows this member put off: their saved Setup view (memberships.views.setup), the same on every device. */
  later: string[];
  vm: SetupVM;
  fetchedAt: number;
}

/** The first run's rules and words, for the pages that draw it: #/start (first-run.jsx) and Today's card. */
export type FirstRunApi = typeof FIRST_RUN_HELPERS;

export interface SetupApi {
  /** Put optional rows off, or take them back: this member's, saved to their view, on every device. */
  later(ids: string | string[], on: boolean): Promise<{ ok: boolean; message: string }>;
  /**
   * The receptionist from what is known: set up where there is none, from Google's listing when one is linked and the
   * name typed at sign-up otherwise; filled from Google where one states none of it. `wrote` is false when there was
   * nothing to add. Owners only; the route says so.
   */
  receptionist(): Promise<{ ok: boolean; wrote: boolean; message: string }>;
  /** Ask a person at Chanlytics for something the product cannot provision yet. */
  request(what: SetupRequestKind): Promise<{ ok: boolean; already: boolean; message: string }>;
  /** The owner switches a tested capability on: a record, not a claim. Owners only; the route says so. */
  /** `firstRun`: the first run's Finish, whose first activation of calls emails the owner (the capability route). */
  activate(kind: string, opts?: { firstRun?: boolean }): Promise<{ ok: boolean; message: string }>;
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
    set(o: {
      number: string;
      carrier: string;
      mode: string;
      test_from: string;
    }): Promise<{ ok: boolean; message: string }>;
    test(lineId: string): Promise<{ ok: boolean; message: string }>;
  };
}

/** The words and the codes the forwarding card needs, published for the classic page. */
export interface ForwardingWords {
  codes: typeof forwardingCodes;
  dialLabel: typeof forwardingDialLabel;
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
    __firstRun?: FirstRunApi;
  }
}

function publish(dto: SetupDto, role: string, later: string[]): void {
  window.__SETUP = { dto, role, later, vm: setupSteps({ ...dto, later }), fetchedAt: Date.now() };
}

/**
 * The put-off rows' saves: one at a time, each sending the list as it stands when it goes, because a save replaces
 * the page's whole view (member_view_set, 00113) and two in flight can land out of order. While one is on its way a
 * re-read keeps the list on screen, which is newer than anything the read can say.
 */
let laterSaving: Promise<unknown> = Promise.resolve();
let laterPending = 0;
/** Whether the member's saved view was read. A save made without it would replace what they put off with less. */
let laterKnown = false;

export const setupOverride: SurfaceOverride = {
  key: "setup",
  globals: ["__SETUP"],
  events: ["surface:setup"],
  // Every row this page derives from: a line's saga steps and the bell a step
  // raises; a channel connected or switched off; the owner's activations; the
  // business record the carriers read; Stripe's answer; the Google profile.
  // Each is published by the database (00057, 00066, 00108, 00075, 00073,
  // 00070, 00117), so a change in another tab, or by a webhook, repaints here.
  // A call reaching the receptionist makes Try it's row ready (the first run's third step and Today's card): read
  // again when a call ends, until one has reached it, and never for each turn of a call or what follows its end.
  refreshOnTables: [
    "lines",
    "notifications",
    "tenant_channels",
    "capability_activations",
    "business_records",
    "billing_accounts",
    "google_connections",
    "calls",
    // a sending domain added, checked, verified or held by the ten-minute clock: Connections' Email row (00175)
    "sending_domains",
  ],
  refreshWhen: (c) =>
    c.table !== "calls" ||
    (c.event === "UPDATE" && c.row.status === "ended" && !window.__SETUP?.dto?.channels?.voice?.lastInboundAt),
  apply: async () => {
    try {
      // The rows this member put off ride on their own saved view (the door People's view goes through), read beside
      // the workspace's facts. A views read that fails puts nothing off rather than failing Setup.
      const [d, v] = await Promise.all([read("GET setup"), read("GET views").catch(() => null)]);
      const prior = window.__SETUP;
      const later = prior && (laterPending > 0 || !v) ? prior.later : v ? setupLaterOf(v.views.setup) : [];
      laterKnown = !!v || (laterKnown && !!prior);
      publish(d.setup, d.role, later);
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
    dialLabel: forwardingDialLabel,
    testOpen: forwardingTestOpen,
    carriers: CARRIERS,
    modes: FORWARDING_MODES,
    carrierWords: CARRIER_WORDS,
    modeWords: FORWARDING_MODE_WORDS,
    display: formatPhoneDisplay,
    ago: (iso) => agoWords(Date.parse(iso), Date.now()),
  };
  win.__setup = {
    later(ids, on) {
      const s = win.__SETUP;
      if (!s) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.reading });
      if (!laterKnown) return Promise.resolve({ ok: false, message: SETUP_LATER_REFUSED.unread });
      const list = Array.isArray(ids) ? ids : [ids];
      // This call's own change, so a refusal takes back only it, whatever else was put off or back meanwhile.
      const changed = list.filter((x) => s.later.includes(x) !== on);
      if (changed.length === 0) return Promise.resolve({ ok: true, message: "" });
      const move = (off: boolean) => {
        const now = win.__SETUP;
        if (!now) return;
        const next = off ? [...new Set([...now.later, ...changed])] : now.later.filter((x) => !changed.includes(x));
        publish(now.dto, now.role, next);
        win.dispatchEvent(new CustomEvent("surface:setup"));
      };
      move(on);
      laterPending += 1;
      const saved = laterSaving.then(async () => {
        const r = await saveView("setup", { later: win.__SETUP?.later ?? [] });
        laterPending -= 1;
        // Not kept, so not put off (or back): this call's rows return as they were, and the caller says why.
        if (!r.ok) move(!on);
        return r.ok ? { ok: true, message: "" } : { ok: false, message: r.message };
      });
      laterSaving = saved;
      return saved;
    },
    async receptionist() {
      const r = await api()("POST settings/receptionist", { body: {} });
      return r.ok ? { ok: true, wrote: r.data.wrote, message: "" } : { ok: false, wrote: false, message: r.message };
    },
    async activate(kind, opts) {
      const r = await api()("POST capabilities/[kind]", {
        params: { kind },
        body: opts && opts.firstRun ? { first_run: true } : {},
      });
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
        return {
          ok: r.data.ok,
          queued: r.data.queued,
          message: r.data.ok ? "" : "It stopped again — a person at Chanlytics has it.",
        };
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
      const already =
        !!req && typeof req === "object" && "already" in req && (req as { already?: unknown }).already === true;
      return { ok: true, already, message: "" };
    },
  };
  win.addEventListener("surface:setup", () => {
    let landed: boolean;
    try {
      landed = win.sessionStorage.getItem(FIRST_RUN_LANDED_KEY) === "1";
    } catch {
      landed = false;
    }
    const s = win.__SETUP;
    if (!s || !shouldLandOnFirstRun(s.role, s.vm.readiness.answering, routeOnScreen(win), landed)) return;
    try {
      win.sessionStorage.setItem(FIRST_RUN_LANDED_KEY, "1");
    } catch {
      /* still land, once */
    }
    const nav = (win as unknown as { appNavigate?: (to: string) => void }).appNavigate;
    if (nav) nav(FIRST_RUN_ROUTE);
    else goToRoute(FIRST_RUN_ROUTE, {}, win);
  });
  win.__firstRun = FIRST_RUN_HELPERS;
}
