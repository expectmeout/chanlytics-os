/**
 * The activity log, on Settings (the pane imports `activity`; it was once published as `window.__activity` for the
 * classic page, and the name went with that page, O4b).
 *
 * Read on demand rather than published as a surface -- it is opened by an
 * owner, rarely, and a surface would fetch both ledgers into every member's
 * browser on every load. The words come from the route (contracts
 * activityWords); the page only reads them out. A person is found by name or
 * number through the People route, then filtered by id.
 */
import { activityTone, personName, type ActivityFamily, type ActivityPageDto } from "@chanlytics/contracts";
import { api } from "./api";
import type { ApiResult } from "../client/api";
import { readCache } from "./read-cache";
import { workspaceZone } from "./zone";

/**
 * The last answer per set of filters, so coming back to the tab paints at once. Kept in the tab, as a person's page is: the
 * log is this workspace's own rows, and a reload drew its pane as a reader-nothing frame and then the log, 3,300 px at once on
 * a desk (the Settings load review, 28 Oct 2026).
 */
const pages = readCache<ApiResult<ActivityPageDto>>("activity", (r) => r.ok, { tab: true });
const keyOf = (f: ActivityFilters) =>
  [f.person, f.kind, f.family, f.only, f.actor, f.day, f.from, f.to, f.cursor].map((v) => v ?? "").join("|");

export interface ActivityFilters {
  person?: string;
  kind?: string;
  /** Every kind of one family, or only what went wrong: the kind box's two wider answers. */
  family?: ActivityFamily;
  only?: "problems";
  /** Who did it: a member's user id, `receptionist` or `system`. */
  actor?: string;
  day?: string;
  /** A span of days by the workspace's clock, both ends included. */
  from?: string;
  to?: string;
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
          // Only what was asked for: a filter left alone is no parameter at all.
          query: Object.fromEntries(Object.entries(f).filter(([, v]) => !!v)),
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
   * The read begun, which a load at the log's address waits for (settings/frame/pane-reads.ts); null when this tab
   * already holds the page current.
   */
  warm: (f: ActivityFilters = {}): Promise<ApiResult<ActivityPageDto>> | null =>
    pages.warm(keyOf(f), () => activity.list(f)),
  /** Somebody wrote; the answers describe the world as it was. */
  forget: (): void => pages.clear(),
  /** What a row means, in the product's six tones. Pure, from contracts. */
  tone: activityTone,
  /** Up to ten people matching a name, a number or an address, to filter by one of them. */
  people: async (q: string): Promise<{ id: string; name: string; phone: string | null }[]> => {
    const r = await api()("GET contacts", { query: { q } });
    if (!r.ok) return [];
    return r.data.people.slice(0, 10).map((p) => ({ id: p.id, name: personName(p), phone: p.phone_e164 }));
  },
};
