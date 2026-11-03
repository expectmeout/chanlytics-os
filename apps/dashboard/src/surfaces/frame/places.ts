/**
 * The frame's places: the sidebar's three groups and the phone's tab bar, by their ids, glyphs and words. Pure, so the
 * frame draws them (sidebar/sidebar.tsx, phone-tabs.tsx) and the document's outline draws the same rows before the app's
 * code has run (outline.tsx, prerendered for every address).
 */

/** A row of the sidebar. */
export interface NavItem {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  urgent?: boolean;
  demoOnly?: boolean;
  badge?: string | number | null;
  expandable?: boolean;
  children?: ReadonlyArray<{ id: string; label: string; badge?: string | number | null }>;
}

export const NAV_PRIMARY: readonly NavItem[] = [
  { id: "home", icon: "home", label: "Today", hint: "Live brief" },
  { id: "inbox", icon: "inbox", label: "Inbox", urgent: true },
];

// Flat nav: merged surfaces are views (SurfaceTabs), not places. Conversations is NOT an item here: it and the Inbox read
// the SAME table (surface-data.ts, `GET conversations`), so they are one door with three views in the strip: Needs you ·
// Conversations · Live.
export const NAV_WORK: readonly NavItem[] = [
  { id: "people", icon: "users", label: "People" },
  { id: "calendar", icon: "calendar", label: "Calendar" },
  { id: "campaigns", icon: "bolt", label: "Campaigns" },
];

// Agents (fleet, store, studio, tasks) is the mockup's: hidden outside a demo session, with the rest of the mockup (see
// surface-registry.ts). Settings is no place in this list: it is the first door of the account's menu at the foot.
export const NAV_INTEL: readonly NavItem[] = [
  { id: "agents", icon: "agents", label: "Agents", demoOnly: true },
  { id: "reports", icon: "trending-up", label: "Reports" },
];

/** The sidebar's groups in order, each with the label it says over its rows when the sidebar is open. */
export const NAV_GROUPS: ReadonlyArray<{ items: readonly NavItem[]; label?: string }> = [
  { items: NAV_PRIMARY },
  { items: NAV_WORK, label: "Workspace" },
  { items: NAV_INTEL, label: "Intelligence" },
];

/**
 * Route id -> the sidebar's place it lights (sidebar/sidebar.tsx): a merged surface lights its group's. Conversations and
 * Live light the Inbox: they are its views, not their own place.
 */
const PLACE_GROUPS: Readonly<Record<string, readonly string[]>> = {
  people: ["clients", "leads", "segments", "pipeline"],
  inbox: ["inbox", "conversations", "live", "calls", "chats", "email"],
  campaigns: ["campaigns", "outbound", "content", "broadcasts", "messages"],
  agents: ["fleet", "store", "studio", "tasks"],
};

/** The place a route's `activeNav` lights: its group's, or its own. */
export function placeLit(activeNav: string): string {
  for (const [place, routes] of Object.entries(PLACE_GROUPS)) if (routes.includes(activeNav)) return place;
  return activeNav;
}

/**
 * What the document's outline knows of an address before the app's code has run (contracts outlineBootScript,
 * outline.css): the place each first word of a route lights, as the path writes it (contracts ROUTE_WORDS: `people` for
 * the shell's `clients`), and the routes whose page says its list's search in Ask's line (kit/head/page-search.ts: the
 * Inbox's and Conversations' lists, People's list and Pipeline, Leads, Sequences and the Library). The route table's own
 * answer (routes.ts activeNav, through placeLit) and the pages' own say are what these follow;
 * tooling/scripts/tests/shell/address/outline-routes.test.mjs holds the places to the route table.
 */
export const OUTLINE_ROUTES = {
  lit: {
    "": "home",
    today: "home",
    start: "home",
    inbox: "inbox",
    conversations: "inbox",
    live: "inbox",
    people: "people",
    lists: "people",
    leads: "people",
    calendar: "calendar",
    campaigns: "campaigns",
    playbooks: "campaigns",
    templates: "campaigns",
    broadcasts: "campaigns",
    reports: "reports",
  },
  search: String.raw`^(inbox|conversations|leads|templates)(\/|$)|^campaigns(\/(sequences|messages))?$|^people(\/((seg|list|state):[^/]*|pipeline(:[^/]*)?|leads(:[^/]*)?))?$`,
} as const;

/** A place on the phone's tab bar: its route, and the pages it holds (lit on each). */
interface PhonePlace {
  id: string;
  route: string;
  icon: string;
  label: string;
  holds: readonly string[];
}

export const PHONE_TABS: readonly PhonePlace[] = [
  { id: "home", route: "today", icon: "home", label: "Today", holds: ["today"] },
  { id: "inbox", route: "inbox", icon: "inbox", label: "Inbox", holds: ["inbox", "conversations", "live"] },
  // Calendar, not Live. A call is live for minutes a week and holding a slot the rest of the time; "when is my next
  // opening" is asked between every client. A call in progress is the frame's own bar while it is happening
  // (topbar/status-bars.tsx LiveCallBar), the only place with room for it to say who is on the line.
  { id: "calendar", route: "calendar", icon: "calendar", label: "Calendar", holds: ["calendar"] },
  { id: "people", route: "clients", icon: "users", label: "People", holds: ["clients", "segments"] },
];

/** The tab bar's last press, which opens the drawer: no place, so never lit. */
export const PHONE_MORE = { label: "Menu", word: "More", icon: "menu" } as const;
