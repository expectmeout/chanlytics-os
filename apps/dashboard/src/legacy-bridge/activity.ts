/**
 * The activity log, on the classic Settings page: `window.__activity`.
 *
 * Read on demand rather than published as a surface -- it is opened by an
 * owner, rarely, and a surface would fetch both ledgers into every member's
 * browser on every load. The words come from the route (contracts
 * activityWords); the page only reads them out. A person is found by name or
 * number through the People route, then filtered by id.
 */
import { activityTone, personName, type ActivityPageDto, type PersonRowDto } from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";
import { readCache } from "./read-cache";
import { workspaceZone } from "./zone";

/** The last answer per set of filters, so coming back to the tab paints at once. */
const pages = readCache<ApiResult<ActivityPageDto>>("activity", (r) => r.ok);
const keyOf = (f: ActivityFilters) => [f.person ?? "", f.kind ?? "", f.day ?? "", f.cursor ?? ""].join("|");

export interface ActivityFilters {
  person?: string;
  kind?: string;
  day?: string;
  /** Where the last page ended, as that page's `next_cursor` gave it. */
  cursor?: string;
}

export const activity = {
  // The rows say their times by the business's clock (window.__clock), so its zone is known before they
  // land: a link straight to this page can bring the log before the workspace read. A zone that cannot be
  // read leaves the log readable.
  list: (f: ActivityFilters = {}): Promise<ApiResult<ActivityPageDto>> =>
    pages.through(keyOf(f), async () => {
      const [r] = await Promise.all([
        api()("GET activity", {
          query: {
            ...(f.person ? { person: f.person } : {}),
            ...(f.kind ? { kind: f.kind } : {}),
            ...(f.day ? { day: f.day } : {}),
            ...(f.cursor ? { cursor: f.cursor } : {}),
          },
        }),
        workspaceZone().catch(() => null),
      ]);
      return r;
    }),
  /** The last answer for these filters, if this tab has one. Synchronous: the first paint. */
  peek: (f: ActivityFilters = {}): ApiResult<ActivityPageDto> | null => pages.peek(keyOf(f)),
  /**
   * Read the first page now, before anybody asks for it -- the rail calls this
   * when a pointer or the keyboard reaches the tab, so the pane it opens has
   * its rows already. Costs one request the visit was going to make anyway.
   */
  warm: (f: ActivityFilters = {}): void => {
    pages.warm(keyOf(f), () => activity.list(f));
  },
  /** Somebody wrote; the answers describe the world as it was. */
  forget: (): void => pages.clear(),
  /** What a row means, in the product's six tones. Pure, from contracts. */
  tone: activityTone,
  /** Up to ten people matching a name, a number or an address, to filter by one of them. */
  people: async (q: string): Promise<{ id: string; name: string; phone: string | null }[]> => {
    const r = await api()("GET contacts", { query: { q } });
    if (!r.ok) return [];
    return (r.data.people as PersonRowDto[])
      .slice(0, 10)
      .map((p) => ({ id: p.id, name: personName(p), phone: p.phone_e164 }));
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
