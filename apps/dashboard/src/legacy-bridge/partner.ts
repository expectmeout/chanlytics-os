/**
 * The partner surface (decision 0012): the caller's partner account, read once at boot (`GET partner` →
 * window.__PARTNER), and the one verb, becoming one. The pane is pages/partner-real.jsx; every sentence it says is
 * contracts' (partnerVM, PARTNER_WORDS), and the count of workspaces brought is read off the workspace list the
 * seam already holds: a membership whose role is partner is one the link brought.
 */
import {
  PARTNER_SHARE_BP_DEFAULT,
  PARTNER_WORDS,
  partnerVM,
  shareWords,
  type PartnerBalanceRow,
  type PartnerDto,
  type PartnerVM,
} from "@chanlytics/contracts";
import type { SurfaceOverride, Workspace } from "./surface-data";
import { api, read } from "./api";
import { refreshSurfaces } from "./surface-runner";

export interface PartnerSurface {
  dto: PartnerDto | null;
  /** What the ledger holds for this partner, by currency and state (00203). */
  balance: PartnerBalanceRow[];
  fetchedAt: number;
}

export interface PartnerApi {
  words: typeof PARTNER_WORDS;
  /** The share every new partner account starts with, as a sentence: the offer says it before there is a row. */
  offerShare: string;
  /** The pane's sentences, from the row, the ledger's sums and the workspaces this person holds as partner. */
  vm(dto: PartnerDto, balance?: PartnerBalanceRow[]): PartnerVM;
  /** How many of the workspaces on the switcher this person is the partner of. */
  broughtCount(): number;
  /** Become a partner with this code, the terms agreed. The surface is written from the answer. */
  become(code: string): Promise<{ ok: boolean; message: string }>;
  /** Read the account again (the failed card's retry). */
  refresh(): Promise<void>;
}

declare global {
  interface Window {
    __PARTNER?: PartnerSurface | null;
    __partner?: PartnerApi;
  }
}

export const partnerOverride: SurfaceOverride = {
  key: "partner",
  globals: ["__PARTNER"],
  events: ["surface:partner"],
  apply: async () => {
    try {
      const d = await read("GET partner");
      window.__PARTNER = { dto: d.partner, balance: d.balance ?? [], fetchedAt: Date.now() };
    } catch (e) {
      // Null, not undefined: the pane draws its failed card with a retry instead of "Reading…" for ever.
      window.__PARTNER = null;
      throw e;
    }
  },
};

export function installPartner(win: Window = window): void {
  const brought = () =>
    ((win as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES ?? []).filter((w) => w.role === "partner").length;
  win.__partner = {
    words: PARTNER_WORDS,
    offerShare: shareWords(PARTNER_SHARE_BP_DEFAULT),
    vm: (dto, balance) => partnerVM(dto, win.location.origin, brought(), balance ?? []),
    broughtCount: brought,
    async become(code) {
      const r = await api()("POST partner", { body: { code, terms: true } });
      if (!r.ok) return { ok: false, message: r.message };
      win.__PARTNER = { dto: r.data.partner, balance: [], fetchedAt: Date.now() };
      win.dispatchEvent(new Event("surface:partner"));
      return { ok: true, message: "" };
    },
    refresh: () => refreshSurfaces([partnerOverride]),
  };
}
