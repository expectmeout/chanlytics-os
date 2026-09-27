/**
 * The partner surface (decision 0012): the caller's partner account, read once at boot (`GET partner` →
 * window.__PARTNER), and the one verb, becoming one. The pane is pages/partner-real.jsx; every sentence it says is
 * contracts' (partnerVM, PARTNER_WORDS), and the count of workspaces brought is read off the workspace list the
 * seam already holds: a membership whose role is partner is one the link brought.
 */
import {
  FIRST_RUN_ROUTE,
  SECOND_FACTOR_WORDS,
  HANDOVER_WORDS,
  handoverRoom,
  partnerHandoverVM,
  PARTNER_SHARE_BP_DEFAULT,
  PARTNER_WORDS,
  partnerVM,
  partnerWorkspacesVM,
  shareWords,
  type PartnerBalanceRow,
  type PartnerDto,
  type PartnerHandoverVM,
  type PartnerVM,
  type PartnerWorkspacesVM,
} from "@chanlytics/contracts";
import { switchWorkspace, type SurfaceOverride, type Workspace } from "./surface-data";
import { api, read } from "./api";
import { refreshSurfaces } from "./surface-runner";
import { createClient } from "../lib/supabase/client";
import { confirmEnrolment, factorState, startEnrolment, type Enrolment } from "../auth/second-factor";

export interface PartnerSurface {
  dto: PartnerDto | null;
  /** What the ledger holds for this partner, by currency and state (00203). */
  balance: PartnerBalanceRow[];
  fetchedAt: number;
}

/** The workspaces a partner brought, and the handovers of those they set up for a business (0016). */
export interface PartnerWorkspacesRead {
  vm: PartnerWorkspacesVM;
  /** Each workspace they set up, and where its handover stands, by workspace. */
  handovers: Record<string, PartnerHandoverVM>;
  /** Why another cannot be set up now (ten waiting), or null. */
  full: string | null;
}

export interface PartnerApi {
  words: typeof PARTNER_WORDS;
  handoverWords: typeof HANDOVER_WORDS;
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
  /** The workspaces this partner brought, judged as the back office judges them, with their standing and money (P4). */
  workspaces(): Promise<({ ok: true } & PartnerWorkspacesRead) | { ok: false; message: string }>;
  /** Set a workspace up for a business and hand it to its owner (0016), then go into it at its first run once the
   *  invitation went. */
  setUp(input: { name: string; email: string }): Promise<{ ok: true; sent: boolean } | { ok: false; message: string }>;
  /** Send a handover again, to the same address or another. `sent` says whether the invitation went. */
  resend(tenantId: string, email: string): Promise<{ ok: true; sent: boolean } | { ok: false; message: string }>;
  /** Go into one of them: the switcher's own way. */
  open(tenantId: string): void;
  /** The account's second factor (0013): whether it is on, and setting one up. Supabase Auth holds it. */
  secondFactor: {
    words: typeof SECOND_FACTOR_WORDS;
    state(): Promise<{ ok: true; on: boolean } | { ok: false; message: string }>;
    start(): Promise<{ ok: true; enrolment: Enrolment } | { ok: false; unavailable: boolean; message: string }>;
    /** Finish with the first code: null when it worked, else the sentence to say. */
    confirm(factorId: string, code: string): Promise<string | null>;
  };
  /** The daily letter on or off (0014). The surface is written from the answer, so the switch shows what is kept. */
  setLetters(on: boolean): Promise<{ ok: boolean; message: string }>;
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
    handoverWords: HANDOVER_WORDS,
    // Each makes its client when pressed, and answers rather than throws when it cannot: a page with no Supabase
    // settings (a stand-in, a test) reads the step as unreadable, never a crash.
    secondFactor: {
      words: SECOND_FACTOR_WORDS,
      state: async () => {
        try {
          return await factorState(createClient());
        } catch (e) {
          return { ok: false, message: e instanceof Error ? e.message : String(e) };
        }
      },
      start: async () => {
        try {
          return await startEnrolment(createClient());
        } catch {
          return {
            ok: false,
            unavailable: false,
            message: "We could not start the setup just now. Try again in a minute.",
          };
        }
      },
      confirm: async (factorId, code) => {
        try {
          return await confirmEnrolment(createClient(), factorId, code);
        } catch {
          return "We could not check that code just now. Try again in a minute.";
        }
      },
    },
    offerShare: shareWords(PARTNER_SHARE_BP_DEFAULT),
    // The server's count (partner_tenants) when it sends one; the seats held, from an older server.
    vm: (dto, balance) => partnerVM(dto, win.location.origin, dto.brought ?? brought(), balance ?? []),
    broughtCount: brought,
    async become(code) {
      const r = await api()("POST partner", { body: { code, terms: true } });
      if (!r.ok) return { ok: false, message: r.message };
      win.__PARTNER = { dto: r.data.partner, balance: [], fetchedAt: Date.now() };
      win.dispatchEvent(new Event("surface:partner"));
      return { ok: true, message: "" };
    },
    refresh: () => refreshSurfaces([partnerOverride]),
    async workspaces() {
      const r = await api()("GET partner/workspaces");
      if (!r.ok) return { ok: false, message: r.message };
      const status = (win as unknown as { __PARTNER?: { dto?: { status?: string } } | null }).__PARTNER?.dto?.status;
      const now = Date.now();
      // An older server sends no handovers: none were made there.
      const lines = r.data.handovers ?? [];
      return {
        ok: true,
        vm: partnerWorkspacesVM(r.data.overview, r.data.money, now, status ?? "active"),
        handovers: Object.fromEntries(lines.map((h) => [h.tenantId, partnerHandoverVM(h, now)])),
        full: handoverRoom(lines).words,
      };
    },
    async setUp(input) {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
      const r = await api()("POST partner/workspaces", { body: { name: input.name, email: input.email, timezone } });
      if (!r.ok) return { ok: false, message: r.message };
      // Into the new workspace at its first run, by its slug: it is not on the switcher's list yet. Unless the
      // invitation did not go: then the partner stays here to be told, and sends it again from its row.
      if (r.data.sent) switchWorkspace(r.data.workspace.id, r.data.workspace.slug, `#/${FIRST_RUN_ROUTE}`);
      return { ok: true, sent: r.data.sent };
    },
    async resend(tenantId, email) {
      const r = await api()("POST partner/workspaces/[id]/resend", { params: { id: tenantId }, body: { email } });
      if (!r.ok) return { ok: false, message: r.message };
      return { ok: true, sent: r.data.sent };
    },
    open(tenantId) {
      const shell = (win as unknown as { __shell?: { switchWorkspace(id: string): void } }).__shell;
      if (shell) shell.switchWorkspace(tenantId);
    },
    async setLetters(on) {
      const r = await api()("PATCH partner", { body: { letters: on } });
      if (!r.ok) return { ok: false, message: r.message };
      const now = win.__PARTNER;
      if (now?.dto) win.__PARTNER = { ...now, dto: { ...now.dto, letters: r.data.letters } };
      win.dispatchEvent(new Event("surface:partner"));
      return { ok: true, message: "" };
    },
  };
}
