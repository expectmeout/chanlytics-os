/**
 * Settings' sections (moved from legacy/pages/settings.jsx with the frame, decision 0015 step 11): the rail's tabs, the
 * back office's, and the rule that names the pane a route opens, which the page and its crumb both ask, so one route
 * is never described two ways.
 *
 * Settings, in the order a person needs them: yourself, then the business, then the people, then what the receptionist
 * is allowed to do, then the account.
 *
 * It used to be one "Workspace" tab holding three unrelated audiences -- the business your CUSTOMERS hear about, the
 * workspace record, and YOU -- with your own name buried in the Team card underneath a roster of other people. The
 * sidebar's own menu said "Your name" and navigated there, so the one link that promised you delivered the business
 * instead.
 *
 * `workspace` keeps its route id: the label is what a person reads, and renaming the id would break every bookmark, the
 * Ask answer that links to it and four e2e specs for a word.
 *
 * AI memory is not here on purpose. It renders the "not built" pane for every real workspace, so as a rail item it was
 * a permanent promise of nothing -- the route still answers, because an old link should land somewhere honest.
 */
// No imports: the route table reads this module (src/surfaces/routes.ts) as the frame boots, before the bridge's modules
// have run, so it holds the rule alone; a tab's warm read is the page's (page.tsx WARM).

export interface SetTab {
  id: string;
  label: string;
  icon: string;
  group?: string;
}

/** The first section, and where a route that names no pane a person may open lands. */
const PROFILE_TAB: SetTab = { id: "profile", label: "Profile", icon: "user", group: "You" };

export const SET_TABS: readonly SetTab[] = [
  PROFILE_TAB,
  // A partner's account and link (0012): the offer for everyone else. On the account, like Profile.
  { id: "partner", label: "Partner", icon: "users", group: "You" },
  { id: "workspace", label: "Business", icon: "home", group: "Workspace" },
  { id: "team", label: "Team", icon: "users", group: "Workspace" },
  { id: "autonomy", label: "Autonomy", icon: "shield", group: "Workspace" },
  // The tab reads Connections; its ROUTE id stays "integrations". Notification rows written before today carry route
  // "admin/integrations" in the database, and a rename would turn every one of those bells into a dead link. The word
  // an owner sees is worth changing -- Connections is what this list is, and what the contract behind it has always
  // called them -- and the identifier is not worth breaking to match.
  { id: "integrations", label: "Connections", icon: "external", group: "Workspace" },
  { id: "notifications", label: "Notifications", icon: "bell", group: "Workspace" },
  { id: "billing", label: "Billing", icon: "money", group: "Workspace" },
  // Both ledgers, readable by the owner: who did what, and what happened (its tab warms its read: page.tsx WARM).
  { id: "activity", label: "Activity", icon: "clock", group: "Workspace" },
];
/** Routes that still answer but no longer earn a place in the rail. */
const SET_TABS_UNLISTED: readonly SetTab[] = [{ id: "memory", label: "AI memory", icon: "sparkle" }];
/**
 * The back office. Not in SET_TABS: it exists for the two or three people who run Chanlytics and for nobody else, and a
 * customer who types the route lands on Profile rather than on a locked door they now know about.
 *
 * `platform_admin` rides on the workspace payload the seam already fetches at boot, so the rail knows synchronously and
 * never flickers a tab in. It is NOT the authorization -- every platform route asks the database again, and both answer
 * 404 to everyone else.
 */
export const SET_TABS_PLATFORM: readonly SetTab[] = [
  { id: "platform", label: "Back office", icon: "monitor", group: "Chanlytics" },
];
export const isPlatformAdmin = (): boolean =>
  !!(Reflect.get(window, "__ME") as { platform_admin?: boolean } | null | undefined)?.platform_admin;

/** The pane a route's tab opens: a listed tab, the back office for those it is for, an unlisted route, else Profile. */
export const SET_TAB = (id: string): SetTab =>
  SET_TABS.find((t) => t.id === id) ||
  (isPlatformAdmin() ? SET_TABS_PLATFORM.find((t) => t.id === id) : null) ||
  SET_TABS_UNLISTED.find((t) => t.id === id) ||
  PROFILE_TAB;

/**
 * The crumbs the frame draws over Settings (src/surfaces/routes.ts): the pane the route opens, named by the rule
 * Settings itself uses (SET_TAB), so the two cannot say different things about one route. The bare route opens
 * Business, a retired route answers under its own name, and the back office is found only for the people it exists
 * for -- anyone else lands on Profile, and so does the crumb.
 */
export const settingsCrumbs = (param: string | null) => [
  { label: "Settings", to: "admin" },
  SET_TAB(param || "workspace").label,
];
