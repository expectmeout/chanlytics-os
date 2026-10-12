/**
 * What a surface that has left the shell reads from the seam, typed (decision 0015, step 3).
 *
 * A legacy page reads its rows off `window` (`window.__PEOPLE`), which is the only place a script the frame loads can
 * find them. A TSX surface imports: it asks for its surface by key (`useSurface("reports")`, src/surfaces/use-surface.ts)
 * and is handed the value the override published, of the type the key says. This is the store behind that: one value
 * for each key, written by the override that owns the surface (`setSurfaceValue`), and the surface cache's (it keeps
 * the value beside the window's globals, and gives it back before React draws, `restoreSurfaceValue`).
 *
 * A key may also name a **mirror**, the window global the pages that have not moved still read (Today's own day is read as
 * `TODAY_DATA`). The mirror is written whenever the value is, so the two never say different things, and it is a line
 * to delete on the day its last reader moves: `declareSurfaceValue("calendar", "__CALENDAR")` is the whole of it. Reports'
 * went on 6 October 2026, when Today and Ask, its last readers, moved to the seam.
 *
 * A value is a surface's whole answer, an object the override replaces and never changes in place, so a component that
 * holds it sees it change by identity (React's `useSyncExternalStore` asks for exactly that).
 */
import type { ReportsSurface } from "./reports/surface";
import type { ReviewsSurface } from "./reports/reviews-surface";
import type { ReceptionistSurface } from "./reports/receptionist-surface";
import type { PeopleSurface as ReportsPeopleSurface } from "./reports/people-surface";
import type { CampaignsSurface } from "./reports/campaigns-surface";
import type { GoogleSurface } from "../legacy-bridge/google";
import type { BroadcastsSurface } from "./campaigns/broadcasts/surface";
import type { PlaybooksSurface } from "./campaigns/playbooks/surface";
import type { ReachOutsSurface } from "./campaigns/reach-out/surface";
import type { CampaignResultsSurface } from "./campaigns/home/results-surface";
import type { SettingsSurface } from "../legacy-bridge/surfaces/settings";
import type { ConversationsSurface, InboxSurface } from "./inbox/types";
import type { ReportHeadlineVM, TodayVM } from "@chanlytics/contracts";
import type { LiveSurface } from "./live/surface";
import type { PeopleSurface } from "./people/surface";
import type { CalendarSurface } from "./calendar/surface";
import type { LeadsSurface } from "./leads/surface";
import type { SetupSurface } from "./setup/surface";
import type { BillingSurface } from "./settings/billing/surface";
import type { PartnerSurface } from "./settings/partner/surface";
import type { AlertsSurface } from "./settings/notifications/surface";

/** Every surface a TSX surface can read, by the key its override is registered under. */
export interface SurfaceValues {
  reports: ReportsSurface;
  /** Today's one small read of the period (contracts ReportHeadlineVM): the card's period line and Worth a look read it. */
  reports_headline: ReportHeadlineVM;
  /** The Reviews lens's own read, folded once: its figures and cards, and the sentence at its head (reports/reviews-surface.ts). It follows the period (reports/period-surface.ts). */
  reports_reviews: ReviewsSurface;
  /** The Receptionist lens's own read, as the route gave it: the page folds it (reports/receptionist-surface.ts). It follows the period (reports/period-surface.ts). */
  reports_receptionist: ReceptionistSurface;
  /** The People lens's own read, as the route gave it: the page folds it (reports/people-surface.ts). It follows the period (reports/period-surface.ts). */
  reports_people: ReportsPeopleSurface;
  /** The Campaigns lens's own reads, each as its route gave it (null where it failed): the page folds them (reports/campaigns-surface.ts). It follows the period (reports/period-surface.ts). */
  reports_campaigns: CampaignsSurface;
  google: GoogleSurface;
  inbox: InboxSurface;
  conversations: ConversationsSurface;
  today: TodayVM;
  playbooks: PlaybooksSurface;
  broadcasts: BroadcastsSurface;
  reach_outs: ReachOutsSurface;
  /** Campaigns' own 30 days, read where Campaigns is drawn (campaigns/home/results-surface.ts): the funnel's and each row's. */
  campaign_results: CampaignResultsSurface;
  settings: SettingsSurface;
  live: LiveSurface;
  people: PeopleSurface;
  calendar: CalendarSurface;
  leads: LeadsSurface;
  /** Undefined until read; null when the read failed, so a page shows a retry rather than "Reading…" for ever. */
  setup: SetupSurface | null;
  /** Undefined until read; null when the read failed, so the pane shows a retry rather than "Reading…" for ever. */
  billing: BillingSurface | null;
  /** Undefined until read; null when the read failed. `dto` is null for a person who is not a partner. */
  partner: PartnerSurface | null;
  /** What reaches this member's phones (decision 0040). Undefined until read; null when the read failed. */
  alerts: AlertsSurface | null;
}

export type SurfaceKey = keyof SurfaceValues;

const values = new Map<SurfaceKey, SurfaceValues[SurfaceKey]>();
const mirrors = new Map<SurfaceKey, string>();

/** Name the window global the pages still on the shell read this surface under, and publish what is held under it. */
export function declareSurfaceValue(key: SurfaceKey, mirror: string): void {
  mirrors.set(key, mirror);
  const have = values.get(key);
  if (have !== undefined) mirrorTo(key, have);
}

function mirrorTo(key: SurfaceKey, value: SurfaceValues[SurfaceKey] | undefined): void {
  const name = mirrors.get(key);
  if (name && typeof window !== "undefined") Reflect.set(window, name, value);
}

/**
 * Where a read that follows the period Reports shows stands against it (reports/period-surface.ts): "current" when what is
 * published is of the period shown, "coming" while the read for it is out (what is published, if anything, is of a period left),
 * "failed" when that read could not be made.
 */
export type FollowState = "current" | "coming" | "failed";

const followers = new Map<SurfaceKey, () => FollowState>();

/** A surface that follows the period says how it stands against it, for `useFollower` (use-surface.ts) to read. */
export function declareFollower(key: SurfaceKey, state: () => FollowState): void {
  followers.set(key, state);
}

/** How a surface stands against the period shown: a surface that follows nothing is current once it holds a value. */
export function followState(key: SurfaceKey): FollowState {
  const state = followers.get(key);
  if (state) return state();
  return values.has(key) ? "current" : "coming";
}

/** The override's answer, published: held here, and mirrored where the pages that have not moved look. */
export function setSurfaceValue<K extends SurfaceKey>(key: K, value: SurfaceValues[K] | undefined): void {
  if (value === undefined) values.delete(key);
  else values.set(key, value);
  mirrorTo(key, value);
}

/** Whether a value is a plain record (what a view model is made of), as against a list, a date, a map or a function. */
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/** The id a list's element goes by, where it has one: a list of rows is matched by id, never by where a row stands. */
const listItemId = (v: unknown): string | null => (isRecord(v) && typeof v.id === "string" ? v.id : null);

/**
 * What a surface publishes again, with every part that did not change kept as the object it was: a row, a list, the
 * map of what each person needs. A refresh built every row anew, so a table's row memo never held and every row was
 * drawn again for one changed person (People, 5 Oct 2026). A list whose every element has an `id` is matched by id, so
 * a row that moved keeps its object; a part that changed is the new one, and so is everything holding it.
 */
export function shareUnchanged<T>(was: unknown, now: T): T {
  if (Object.is(was, now)) return now;
  if (Array.isArray(now)) {
    if (!Array.isArray(was)) return now;
    const before: readonly unknown[] = was;
    const after: readonly unknown[] = now;
    const byId =
      after.every((v) => listItemId(v) !== null) && before.every((v) => listItemId(v) !== null)
        ? new Map<string | null, unknown>(before.map((v): [string | null, unknown] => [listItemId(v), v]))
        : null;
    let same = before.length === after.length;
    const kept = after.map((v, i): unknown => {
      const it: unknown = shareUnchanged(byId ? byId.get(listItemId(v)) : before[i], v);
      if (it !== before[i]) same = false;
      return it;
    });
    return (same ? before : kept) as T;
  }
  if (!isRecord(now) || !isRecord(was)) return now;
  const keys = Object.keys(now);
  let same = keys.length === Object.keys(was).length;
  const kept: Record<string, unknown> = {};
  for (const k of keys) {
    kept[k] = Object.hasOwn(was, k) ? shareUnchanged(was[k], now[k]) : now[k];
    if (!Object.hasOwn(was, k) || kept[k] !== was[k]) same = false;
  }
  return (same ? was : kept) as T;
}

/** What the surface last published, or nothing before its first read. */
export function surfaceValue<K extends SurfaceKey>(key: K): SurfaceValues[K] | undefined {
  return values.get(key) as SurfaceValues[K] | undefined;
}

/** The cache handing a surface's value back at boot: a value read in an earlier visit, painted before the first read. */
export function restoreSurfaceValue(key: string, value: unknown): void {
  if (!isSurfaceKey(key)) return;
  setSurfaceValue(key, value as SurfaceValues[SurfaceKey]);
}

/** Whether a name is a key of `SurfaceValues`: the cache is written by keys of every surface, the typed or not. */
function isSurfaceKey(key: string): key is SurfaceKey {
  return Object.hasOwn(SURFACE_KEYS, key);
}

// The keys as a value, so a name from the cache is checked against the same list the type is. A key added to
// `SurfaceValues` without a line here is a type error.
const SURFACE_KEYS: Record<SurfaceKey, true> = {
  reports: true,
  reports_headline: true,
  reports_reviews: true,
  reports_receptionist: true,
  reports_people: true,
  reports_campaigns: true,
  google: true,
  inbox: true,
  conversations: true,
  today: true,
  playbooks: true,
  broadcasts: true,
  reach_outs: true,
  campaign_results: true,
  settings: true,
  live: true,
  people: true,
  calendar: true,
  leads: true,
  setup: true,
  billing: true,
  partner: true,
  alerts: true,
};
