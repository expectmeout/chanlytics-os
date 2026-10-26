/**
 * Settings' sections (moved from legacy/pages/settings.jsx with the frame, decision 0015 step 11): the rail's tabs, the
 * back office's, and the rule that names the pane a route opens, which the page and its crumb both ask, so one route
 * is never described two ways.
 *
 * Settings, in the order a person needs them: yourself, then the business, then its receptionist, then the account.
 * One page per question (Ruben, 17 Oct 2026, the "Settings, split" canvas): Business was one page of 34 rows for three
 * readers -- the facts a customer asks for, how the receptionist talks, and the account's own records -- and is now
 * Details, Hours & booking and How it answers, with its limits on Autonomy and its records on Billing.
 *
 * It used to be one "Workspace" tab holding three unrelated audiences -- the business your CUSTOMERS hear about, the
 * workspace record, and YOU -- with your own name buried in the Team card underneath a roster of other people. The
 * sidebar's own menu said "Your name" and navigated there, so the one link that promised you delivered the business
 * instead.
 *
 * `workspace` keeps its route id for Details: the label is what a person reads, and renaming the id would break every
 * bookmark, the Ask answer that links to it and four e2e specs for a word. A row the old address names
 * (`workspace/hours`) opens the page that holds it now (paneOfRow).
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
  /** In the rail only for a person who is a partner: everyone else meets the offer as a row on Profile. */
  partners?: boolean;
}

/** The first section, and where a route that names no pane a person may open lands. */
const PROFILE_TAB: SetTab = { id: "profile", label: "Profile", icon: "user", group: "You" };

/** Details: what a customer asks for by name, and what the business sells. Where the bare route lands on a desk. */
const DETAILS_TAB: SetTab = { id: "workspace", label: "Details", icon: "home", group: "Business" };

export const SET_TABS: readonly SetTab[] = [
  PROFILE_TAB,
  // A partner's account and link (0012). On the account, like Profile.
  { id: "partner", label: "Partner", icon: "users", group: "You", partners: true },
  DETAILS_TAB,
  // When people can come, and how they book: what the Calendar's "Hours and rules" shows, kept in one place.
  { id: "hours", label: "Hours & booking", icon: "calendar", group: "Business" },
  // What the receptionist says: its voice, what it knows, what it can do, and what it is told.
  { id: "receptionist", label: "How it answers", icon: "chat", group: "Receptionist" },
  // What it may do without you, and every limit it keeps.
  { id: "autonomy", label: "Autonomy", icon: "shield", group: "Receptionist" },
  { id: "team", label: "Team", icon: "users", group: "Workspace" },
  // The tab reads Connections; its ROUTE id stays "integrations". Notification rows written before today carry route
  // "admin/integrations" in the database, and a rename would turn every one of those bells into a dead link. The word
  // an owner sees is worth changing -- Connections is what this list is, and what the contract behind it has always
  // called them -- and the identifier is not worth breaking to match.
  { id: "integrations", label: "Connections", icon: "external", group: "Workspace" },
  { id: "notifications", label: "Notifications", icon: "bell", group: "Workspace" },
  // The plan, and the workspace's own records: what the account itself is.
  { id: "billing", label: "Billing", icon: "money", group: "Workspace" },
  // What Ask remembers about the business, and its journal of the days (decision 0070): every member's Ask reads it.
  { id: "memory", label: "Memory", icon: "sparkle", group: "Workspace" },
  // Both ledgers, readable by the owner: who did what, and what happened (its tab warms its read: page.tsx WARM).
  { id: "activity", label: "Activity", icon: "clock", group: "Workspace" },
];
/** Routes that still answer but no longer earn a place in the rail. */
const SET_TABS_UNLISTED: readonly SetTab[] = [];
/**
 * The Console (decision 0066, once the back office): a link to its own place. Not in SET_TABS: it exists for the two or three people who run Chanlytics and for nobody else, and a
 * customer who types the route lands on Profile rather than on a locked door they now know about.
 *
 * `platform_admin` rides on the workspace payload the seam already fetches at boot, so the rail knows synchronously and
 * never flickers a tab in. It is NOT the authorization -- every platform route asks the database again, and both answer
 * 404 to everyone else.
 */
export const SET_TABS_PLATFORM: readonly SetTab[] = [
  { id: "platform", label: "The Console", icon: "monitor", group: "Chanlytics" },
];
export const isPlatformAdmin = (): boolean =>
  !!(Reflect.get(window, "__ME") as { platform_admin?: boolean } | null | undefined)?.platform_admin;

/**
 * Which page holds each of the business's rows that left Details, by the id the fold registry opens it by. A row not
 * named here is Details'. One table, read by the address (an old `workspace/<row>` opens the page that holds it), by
 * every door that opens a row (the gap line, What it can do, the prompt's blocks), and by the gap's mark in the rail.
 */
const ROW_PANES: Readonly<Record<string, string>> = {
  hours: "hours",
  timezone: "hours",
  closures: "hours",
  // The booking tool's fold (contracts CALENDAR_SETTING_ROUTE names it: `admin/workspace/calendar`).
  calendar: "hours",
  booking_link: "hours",
  booking_rules: "hours",
  consult_first: "hours",
  // Whether walk-ins are taken (decision 0073), on the Booking card with what happens when someone wants to book.
  walk_ins: "hours",
  tone: "receptionist",
  phone_greeting: "receptionist",
  languages: "receptionist",
  notes: "receptionist",
  extra_instructions: "receptionist",
  fallbacks: "receptionist",
  prompt: "receptionist",
  // Rehearse (business/rehearse/rehearse.tsx), which was Try it: the receptionist rehearsed, opened by `admin/receptionist/try`.
  try: "receptionist",
  // The transfer number, on How it answers' On calls with the greeting (the Settings wiring review, items 6-7).
  handoff_number: "receptionist",
  // The voice callers hear it in, on On calls (item 11), which Ask's card opens too (item 14).
  phone_voice: "receptionist",
  // Its name (How it talks) and how fast it speaks (On calls), decision 0073, which Ask's card opens too.
  assistant_name: "receptionist",
  phone_pace: "receptionist",
  guardrails: "autonomy",
  escalate_when: "autonomy",
};

/** The page a row of the business is on: Hours & booking, How it answers, Autonomy, or else Details. */
export const paneOfRow = (row: string): string => ROW_PANES[row] ?? DETAILS_TAB.id;

/** The address that opens a row of the business, open, on the page that holds it. */
export const settingsRowRoute = (row: string): string => `admin/${paneOfRow(row)}/${row}`;

/** The section an address under Settings names: what stands before a row it may name (`workspace/calendar` is `workspace`). */
const sectionOf = (id: string): string => (id.includes("/") ? id.slice(0, id.indexOf("/")) : id);

/** The sections an address may name a row of: the business's pages and Autonomy's, and the part Activity opens on. */
const SECTIONS_WITH_ROWS = new Set(["workspace", "hours", "receptionist", "autonomy", "activity"]);

/**
 * The row an address names after its section, or null: `workspace/calendar` names the booking tool's row (contracts
 * CALENDAR_SETTING_ROUTE), and `activity/team` the log of the team's changes (Team's Activity, 9 Oct 2026). A door on
 * another page that says "Check the link" or "Look at them" lands on the row it means, open, where it landed at the top
 * of the tab with the row a screen down (7 Oct 2026). An address that names one anywhere else names none.
 */
export const settingsRowOf = (param: string | null | undefined): string | null => {
  const p = param || "";
  if (!SECTIONS_WITH_ROWS.has(sectionOf(p)) || !p.includes("/")) return null;
  return p.slice(p.indexOf("/") + 1).split("/")[0] || null;
};

/**
 * The pane a route's tab opens: a listed tab, the back office for those it is for, an unlisted route, else Profile. An
 * address under `workspace` that names a row opens the page that holds the row now, so every door written before the
 * split (a bell, an Ask answer, the Calendar's rules) lands where the row is.
 */
export const SET_TAB = (param: string): SetTab => {
  const section = sectionOf(param);
  const row = section === DETAILS_TAB.id ? settingsRowOf(param) : null;
  const id = row ? paneOfRow(row) : section;
  return (
    SET_TABS.find((t) => t.id === id) ||
    (isPlatformAdmin() ? SET_TABS_PLATFORM.find((t) => t.id === id) : null) ||
    SET_TABS_UNLISTED.find((t) => t.id === id) ||
    PROFILE_TAB
  );
};

/**
 * The address a Settings address names now: an old `workspace/<row>` whose row has moved names the page that holds it
 * (`workspace/hours` is `hours/hours`), so the address, the crumbs and the tab's title say the page that is drawn; any
 * other address is itself. The page draws the right pane either way (SET_TAB); this is what it replaces the address with.
 */
export const settingsAddressNow = (param: string): string => {
  const row = sectionOf(param) === DETAILS_TAB.id ? settingsRowOf(param) : null;
  const pane = row ? paneOfRow(row) : DETAILS_TAB.id;
  return pane === DETAILS_TAB.id ? param : `${pane}/${param.slice(param.indexOf("/") + 1)}`;
};

/** The width under which the frame wears a phone's head (kit.css's one breakpoint), and Settings opens on its list. */
export const SETTINGS_PHONE_QUERY = "(max-width: 900px)";

/** Whether Settings is on a phone now: its bare address is the list there, and Details on a desk. */
export const settingsOnPhone = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia(SETTINGS_PHONE_QUERY).matches;

/**
 * The crumbs the frame draws over Settings (src/surfaces/routes.ts): the pane the route opens, named by the rule
 * Settings itself uses (SET_TAB), so the two cannot say different things about one route. The bare route is the list
 * of sections on a phone, which is Settings itself and has no way back of its own, and Details on a desk; a retired
 * route answers under its own name, and the back office is found only for the people it exists for -- anyone else
 * lands on Profile, and so does the crumb. On a phone the way back from a section is the crumb before it: the list. On a
 * desk the sections are the rail beside the pane, so "Settings" is words with no address, and the frame draws no way
 * back: it went to the bare address, which on a desk is Details, so "‹ Settings" over Details went nowhere.
 */
export const settingsCrumbs = (param: string | null) =>
  !param && settingsOnPhone()
    ? ["Settings"]
    : [settingsOnPhone() ? { label: "Settings", to: "admin" } : "Settings", SET_TAB(param || DETAILS_TAB.id).label];
