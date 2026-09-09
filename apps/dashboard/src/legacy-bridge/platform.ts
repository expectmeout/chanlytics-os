/**
 * The back office, on the classic pages.
 *
 * Read ON DEMAND rather than published as a surface, for the same reason the
 * business-record form is: this is opened by one person, rarely, and a surface
 * would make every customer's browser fetch a page it will never be allowed to
 * see. `window.__ME.platform_admin` is the one bit the nav needs at boot, and it
 * rides on the workspace payload the seam already fetches.
 *
 * Nothing here decides who may look. Both reads answer 404 to everybody else --
 * the same answer a URL that does not exist gives, so a customer who guesses it
 * learns nothing.
 */
import {
  platformRows, platformSummary, platformNumber, setupSteps,
  platformLineActions, platformActionWarning,
  PLATFORM_VERDICTS, PLATFORM_QUIET_DAYS,
  type PlatformTenantDto, type SetupDto, type PlatformLineAction,
} from "@chanlytics/contracts";
import { scoped } from "./surface-data";

export interface PlatformEventVM {
  kind: string;
  category: string;
  subject_type: string | null;
  created_at: string;
  // No `data`. The payload is unbounded -- emitEvent writes numbers, addresses
  // and provider ids from every corner of the product -- and the page renders
  // none of it. Shipping another business's payloads to a browser to be thrown
  // away is not a thing a cross-tenant surface gets to do by accident.
}

export interface PlatformTenantDetail {
  tenant: { id: string; slug: string; name: string; status: string; timezone: string; created_at: string };
  setup: SetupDto;
  events: PlatformEventVM[];
}

export interface PlatformApi {
  /** Every workspace, as facts. `ok: false` is the ordinary answer for anybody who is not an admin. */
  list(): Promise<{ ok: boolean; tenants: PlatformTenantDto[]; message: string }>;
  /** One workspace: its identity, the Setup its owner sees, and what has happened lately. */
  one(tenantId: string): Promise<{ ok: boolean; detail: PlatformTenantDetail | null; message: string }>;
  /** The judgement and the words. Pure, from contracts. */
  rows: typeof platformRows;
  summary: typeof platformSummary;
  verdicts: typeof PLATFORM_VERDICTS;
  quietDays: typeof PLATFORM_QUIET_DAYS;
  number: typeof platformNumber;
  /** The customer's own Setup rows, run for their workspace. The same function their page runs. */
  steps: typeof setupSteps;
  /** What may be done to a line right now, and what each one spends. */
  actions: typeof platformLineActions;
  warning: typeof platformActionWarning;
  /**
   * Do one of them. Named actions only -- the routes each carry one operation,
   * and this passes the name rather than anything the edge would execute.
   */
  act(action: PlatformLineAction, tenantId: string, lineId: string): Promise<{ ok: boolean; message: string }>;
}

declare global {
  interface Window {
    __platform?: PlatformApi;
  }
}

async function get<T>(path: string, body?: unknown): Promise<{ ok: boolean; data: T | null; message: string }> {
  try {
    const res = await fetch(scoped(path), body === undefined ? undefined : {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json().catch(() => null)) as { ok?: boolean; data?: T; error?: { message?: string } } | null;
    if (!j || j.ok !== true) return { ok: false, data: null, message: j?.error?.message ?? "That did not load. Try again in a moment." };
    return { ok: true, data: (j.data ?? null) as T | null, message: "" };
  } catch {
    return { ok: false, data: null, message: "The connection dropped. Try again in a moment." };
  }
}

export function installPlatform(win: Window = window): void {
  win.__platform = {
    async list() {
      const r = await get<{ tenants: PlatformTenantDto[] }>("/api/v1/platform/overview");
      return { ok: r.ok, tenants: r.data?.tenants ?? [], message: r.message };
    },
    async one(tenantId) {
      const r = await get<PlatformTenantDetail>(`/api/v1/platform/tenants/${encodeURIComponent(tenantId)}`);
      return { ok: r.ok, detail: r.data, message: r.message };
    },
    async act(action, tenantId, lineId) {
      const r = await get<{ ok: boolean; status: number; result: Record<string, unknown> | null }>(
        `/api/v1/platform/lines/${action}`,
        { tenant_id: tenantId, line_id: lineId },
      );
      if (!r.ok) return { ok: false, message: r.message };
      // The edge's own words when it refused. `already_registered`,
      // `the line is answering, not failed` -- these are facts about the line,
      // and support needs the actual one rather than "that did not work".
      const res = r.data?.result ?? null;
      if (r.data?.ok !== true) {
        const why = res && typeof res.error === "string" ? res.error : `HTTP ${r.data?.status ?? "?"}`;
        const hint = res && typeof res.hint === "string" ? ` — ${res.hint}` : "";
        return { ok: false, message: `${why}${hint}` };
      }
      return { ok: true, message: "Done. This page will show it on the next read." };
    },
    rows: platformRows,
    summary: platformSummary,
    verdicts: PLATFORM_VERDICTS,
    quietDays: PLATFORM_QUIET_DAYS,
    number: platformNumber,
    steps: setupSteps,
    actions: platformLineActions,
    warning: platformActionWarning,
  };
}
