/**
 * The activity log, on the classic Settings page: `window.__activity`.
 *
 * Read on demand rather than published as a surface -- it is opened by an
 * owner, rarely, and a surface would fetch both ledgers into every member's
 * browser on every load. The words come from the route (contracts
 * activityWords); the page only reads them out. A person is found by name or
 * number through the People route, then filtered by id.
 */
import type { ActivityPageDto, PersonRowDto } from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";

export interface ActivityFilters {
  person?: string;
  kind?: string;
  day?: string;
  offset?: number;
}

export const activity = {
  list: (f: ActivityFilters = {}): Promise<ApiResult<ActivityPageDto>> =>
    api()("GET activity", { query: { ...(f.person ? { person: f.person } : {}), ...(f.kind ? { kind: f.kind } : {}), ...(f.day ? { day: f.day } : {}), ...(f.offset ? { offset: f.offset } : {}) } }),
  /** Up to ten people matching a name or a number, to filter by one of them. */
  people: async (q: string): Promise<{ id: string; name: string; phone: string | null }[]> => {
    const r = await api()("GET contacts", { query: { q } });
    if (!r.ok) return [];
    return (r.data.people as PersonRowDto[]).slice(0, 10).map((p) => ({ id: p.id, name: p.display_name || p.wa_profile_name || p.phone_e164 || "Unknown", phone: p.phone_e164 }));
  },
};

declare global {
  interface Window {
    __activity?: typeof activity;
  }
}

export function installActivity(): void {
  window.__activity = activity;
}
