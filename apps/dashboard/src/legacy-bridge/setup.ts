/**
 * Setup on the legacy page: the facts from /api/v1/setup, the rows from
 * contracts/setup.ts, "Later" as a preference on this device, one verb that
 * asks a person at Chanlytics for a line, and the landing rule — an owner
 * whose receptionist answers nowhere yet lands on Setup once per session.
 */
import { setupSteps, setupRoute, shouldLandOnSetup, type SetupDto, type SetupVM } from "@chanlytics/contracts";
import { fetchEnvelope, getActiveWorkspace, scoped, type SurfaceOverride } from "./surface-data";
import { refreshSurfaces } from "./surface-runner";

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
  /** The product's own line: numbers to choose from, the one chosen, a retry. Owners only; the route says so. */
  lines: {
    search(areaCode: string): Promise<{ ok: boolean; numbers: LineChoice[]; message: string }>;
    buy(number: string, areaCode: string): Promise<{ ok: boolean; message: string }>;
    retry(lineId: string): Promise<{ ok: boolean; message: string }>;
  };
}

export interface LineChoice {
  e164: string;
  friendly: string;
  locality: string | null;
  region: string | null;
}

declare global {
  interface Window {
    __SETUP?: SetupSurface;
    __setup?: SetupApi;
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
  // A line's saga records every step on its row, and the bell a step raises.
  refreshOnTables: ["lines", "notifications"],
  apply: async () => {
    const d = await fetchEnvelope<{ setup: SetupDto; role: string }>("/api/v1/setup");
    publish(d.setup, d.role);
  },
};

/** One POST to a v1 route: the envelope's data, or its error in a sentence. Never throws. */
async function post<T>(path: string, body: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const parsed = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
    if (res.ok) return { ok: true, data: parsed?.data ?? null, message: "" };
    return { ok: false, data: null, message: parsed?.error?.message ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, data: null, message: e instanceof Error ? e.message : String(e) };
  }
}

export function installSetup(win: Window = window): void {
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
    lines: {
      async search(areaCode) {
        const r = await post<{ numbers?: LineChoice[] }>("/api/v1/lines/search", { area_code: areaCode });
        return { ok: r.ok, numbers: r.ok ? (r.data?.numbers ?? []) : [], message: r.message };
      },
      async buy(number, areaCode) {
        const r = await post<{ ok?: boolean; error?: string | null }>("/api/v1/lines/buy", { number, area_code: areaCode });
        await refreshSurfaces([setupOverride]);
        if (!r.ok) return { ok: false, message: r.message };
        return { ok: r.data?.ok === true, message: r.data?.ok ? "" : "" };
      },
      async retry(lineId) {
        const r = await post<{ ok?: boolean; error?: string | null }>("/api/v1/lines/retry", { line_id: lineId });
        await refreshSurfaces([setupOverride]);
        if (!r.ok) return { ok: false, message: r.message };
        return { ok: r.data?.ok === true, message: r.data?.ok ? "" : "It stopped again — a person at Chanlytics has it." };
      },
    },
    async request(what) {
      try {
        const res = await fetch(scoped("/api/v1/setup/request"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ what }) });
        const body = (await res.json().catch(() => null)) as { data?: { request?: { already?: boolean } }; error?: { message?: string } } | null;
        if (res.ok) {
          await refreshSurfaces([setupOverride]);
          return { ok: true, already: !!body?.data?.request?.already, message: "" };
        }
        return { ok: false, already: false, message: body?.error?.message ?? `HTTP ${res.status}` };
      } catch (e) {
        return { ok: false, already: false, message: e instanceof Error ? e.message : String(e) };
      }
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
