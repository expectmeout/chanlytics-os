/**
 * What People says and decides that is not markup: the states an address may name, the receptionist's word beside a
 * state, the sorts a phone offers, the empty drafts of its sheets, the scopes and where each goes, who a search finds,
 * a face on a card, a selection as a CSV (moved whole from legacy/pages/people.jsx, decision 0015). The pages that have
 * not moved (Leads, the Pipeline, the person page) still read the names published in people-globals.ts.
 */
import { csvCell, stateOf } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { surfaceValue } from "../surface-values";
import { pageClock } from "@/legacy-bridge/zone";
import type { PeopleRead } from "./types";

/** The states an address may still name (state:<x>). Needs you and Waiting on you are lists (decision 0009): their state address opens the list. */
export const PL_TABS = ["new", "quiet", "active"];
const PL_STANDING_LISTS = ["needs_you", "waiting_on_you"];
export const plStandingList = (state: string | null): string | null =>
  state && PL_STANDING_LISTS.includes(state) ? state : null;
export const PL_TAB_LABEL: Record<string, string> = {
  all: "All",
  needs_you: "Needs you",
  waiting_on_you: "Waiting on you",
  new: "New",
  quiet: "Quiet",
  active: "Active",
};

/** The band People's cards use (clients.css, 900px) and the one the Columns menu is judged by. */
export const PL_PHONE_QUERY = "(max-width: 900px)";
export const plPhoneNow = (): boolean => !!(window.matchMedia && window.matchMedia(PL_PHONE_QUERY).matches);

/** The "Offers" column and the CSV read the OFFERS answer, never the conversational consent. */
const NOT_ASKED: readonly [string, string] = ["Not asked", "unasked"];
const PL_OFFERS: Record<string, readonly [string, string]> = {
  opted_in: ["Yes", "yes"],
  opted_out: ["No", "no"],
  unknown: NOT_ASKED,
};
export const offersOf = (marketing: string): readonly [string, string] => PL_OFFERS[marketing] ?? NOT_ASKED;

/**
 * A selection as a CSV, in its own fixed columns, whatever the Columns menu shows: one cell as contracts spell it
 * (csvCell, the rule the route's export of everyone uses), both consent answers, nothing the schema does not hold.
 */
export const plCsv = (rows: readonly PersonRowVM[]): string => {
  const head = ["Name", "Phone", "Email", "State", "Last contact", "Consent", "Offers", "Next visit", "First contact"];
  const lines = rows.map((p) =>
    [
      p.name,
      p.phone || "",
      p.email || "",
      p.stateLabel,
      p.lastContact.label,
      p.consent.label,
      offersOf(p.consent.marketing)[0],
      p.nextVisit || "",
      p.firstContact.label,
    ]
      .map(csvCell)
      .join(","),
  );
  return [head.map(csvCell).join(","), ...lines].join("\r\n");
};

/** The receptionist, in one word beside the state, only when it is not simply answering. */
export const PL_RECEPT_MARK: Record<string, string> = {
  escalated: "escalated",
  queued: "reply queued",
  snoozed: "snoozed",
  paused: "held for you",
  silent: "silent",
};
/** The receptionist's word says what the state pill beside it already says: "escalated" is why they need you, "held for you" is waiting on you. */
export const plReceptSaysTheState = (p: PersonRowVM): boolean =>
  (p.receptionist.tone === "escalated" && p.state === "needs_you") ||
  (p.receptionist.tone === "paused" && p.state === "waiting_on_you");

/** The sorts a phone offers from its more-menu, in the words it says them in. */
export const PL_PHONE_SORTS: readonly {
  by: string;
  dir: "asc" | "desc";
  label: string;
  needs?: (x: { withCalendar: boolean }) => boolean;
}[] = [
  { by: "state", dir: "desc", label: "Needs you first" },
  { by: "last", dir: "desc", label: "Latest contact first" },
  { by: "name", dir: "asc", label: "Name, A to Z" },
  { by: "name", dir: "desc", label: "Name, Z to A" },
  { by: "visits", dir: "asc", label: "Soonest visit first", needs: (x) => x.withCalendar },
];

/** A phone sheet's draft of Add a person and of a list's name and words: the page's state. */
export interface AddDraft {
  name: string;
  phone: string;
  busy: boolean;
  error: string | null;
}
export interface ListDraft {
  name: string;
  busy: boolean;
  error: string | null;
  mode?: string;
}
export const PL_ADD_EMPTY: AddDraft = { name: "", phone: "", busy: false, error: null };
export const PL_LIST_EMPTY: ListDraft = { name: "", busy: false, error: null };
/** How a yes was given, as a phone's Record a yes draws it: a person, a phone, a form. */
export const PL_SOURCE_GLYPH: Record<string, string> = { in_person: "user", phone: "phone", form: "content" };

/** A stable empty list, so a workspace without saved lists does not re-run the table's memo on every render. */
export const PL_NO_LISTS: never[] = [];

/**
 * What a scope has before its surface lands. People's route waits for People and Leads' for Leads, so the other scope's
 * surface may not be read yet: the rail's switch is drawn in both, and neither may throw for want of the one it is not showing.
 */
export const PL_NO_PEOPLE: PeopleRead = {
  rows: [],
  lists: PL_NO_LISTS,
  saved: PL_NO_LISTS,
  aggregates: { total: 0, needsYou: 0, reachedWeek: 0 },
  views: {},
  attention: {},
  savedRead: true,
};

export const PL_DEFAULT_GROUPS = [
  { id: "attention", label: "Attention" },
  { id: "journey", label: "Journey" },
  { id: "reach", label: "Reach" },
];

/** The page's scopes, in the switch's order: People and Leads everywhere, the Pipeline only where deals are on. */
const PL_SCOPES = [
  { id: "people", label: "People" },
  { id: "leads", label: "Leads" },
  { id: "pipeline", label: "Pipeline" },
];
export const plScopes = (dealsOn: boolean): typeof PL_SCOPES => (dealsOn ? PL_SCOPES : PL_SCOPES.slice(0, 2));
/** Where the switch goes: each scope is an address of People's. */
export const plScopeRoute = (to: string): string =>
  to === "leads" ? "clients/leads" : to === "pipeline" ? "clients/pipeline" : "clients";

/** The receptionist's four modes for a selection; the words are contracts' (PERSON_MODE_WORDS, through the chrome bridge). */
export const PL_MODES = [
  { id: "auto", icon: "sparkle" },
  { id: "ask", icon: "eye" },
  { id: "never", icon: "pause" },
  { id: "inherit", icon: "refresh" },
] as const;
export const plModeWord = (id: string): string => stateOf("mode", id).label;

export const plIsNumber = (name: string | null | undefined): boolean => /^[+\d(]/.test(name || "");
/** A person shown by their address because they have no name and no number (contracts personName). */
export const plIsAddress = (p: { email: string | null; name: string }): boolean => !!p.email && p.name === p.email;
/** A person's face on a card: their initials, or the glyph for what names them while nobody has named them. */
export const plFace = (p: {
  initials: string;
  name: string;
  email: string | null;
}): { initials: string; glyph: string | null } => ({
  initials: p.initials,
  glyph: plIsNumber(p.name) ? "phone" : plIsAddress(p) ? "mail" : null,
});

/** What the search box says it finds, in both of its places: the desktop's placeholder and the phone's bar. */
export const PL_SEARCH_LABEL = "Search by name or phone";

/** Who the words in the box find, or null for no words, which finds everyone. */
export const plMatcher = (
  q: string,
):
  | ((p: {
      name: string;
      waName?: string | null;
      email?: string | null;
      phone?: string | null;
      quote?: string | null;
      nextVisit?: string | null;
      lastVisit?: string | null;
      deal?: { service?: string | null } | null;
    }) => boolean)
  | null => {
  const needle = q.trim().toLowerCase();
  if (!needle) return null;
  const digits = needle.replace(/\D/g, "");
  return (p) =>
    p.name.toLowerCase().includes(needle) ||
    (p.waName || "").toLowerCase().includes(needle) ||
    (p.email || "").includes(needle) ||
    (digits.length >= 3 && (p.phone || "").replace(/\D/g, "").includes(digits)) ||
    (p.quote || "").toLowerCase().includes(needle) ||
    (p.nextVisit || "").toLowerCase().includes(needle) ||
    (p.lastVisit || "").toLowerCase().includes(needle) ||
    ((p.deal && p.deal.service) || "").toLowerCase().includes(needle);
};

/** The exact moment, by the business's clock: "Sep 6, 2026 · 3:10 PM". */
export const plWhen = (iso: string | null | undefined): string | undefined => {
  const ms = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(ms)) return undefined;
  const clock = pageClock();
  return `${clock.dateYear(ms)} · ${clock.time(ms)}`;
};

/** The batch doors take fifty people at a time (contacts/consent, /receptionist, /notes). */
export const PL_BATCH = 50;
/** The loaded rows and what a search found past them, each person once. */
export const plWithFound = (loaded: PersonRowVM[], found: PersonRowVM[]): PersonRowVM[] => {
  const seen = new Set(loaded.map((p) => p.id));
  return [...loaded, ...found.filter((p) => !seen.has(p.id))];
};
/** What People says while more people follow than it has loaded ("1,000 of 1,400 loaded"). */
export const plLoadedWords = (loaded: number, total: number): string =>
  `${loaded.toLocaleString()} of ${total.toLocaleString()} loaded`;

/** A list just made, by its own answer's id; by name only when the answer carries none. */
export const plMadeId = (c: { data?: { id?: string } | null }, name: string): string | null =>
  (c.data && c.data.id) || (surfaceValue("people")?.saved || []).find((s) => s.name === name)?.id || null;

/**
 * Typing: a field that takes words, or a radio, whose arrow keys move its choice. A row's checkbox is not one, so
 * after a click on it J, K, x and Esc still work.
 */
export const plTyping = (el: Element | null): boolean => {
  const t: { tagName?: string; type?: string; isContentEditable?: boolean } | null = el;
  return (
    !!t &&
    ((t.tagName === "INPUT" && !/^checkbox$/i.test(t.type || "")) ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      !!t.isContentEditable)
  );
};
/** What Enter and Space press when it has focus, instead of the row under the cursor. */
export const PL_CONTROL =
  'button, a[href], input, select, textarea, [role="button"], [role="menuitem"], [role="menuitemcheckbox"], [role="tab"], [role="option"]';
/**
 * What can be open over the page and has the keys while it is: a menu, Ask, the ? sheet, the notifications, a sidebar
 * menu, the phone's drawer. Only the app's (every one sits inside .app-root). Not the page's own overlays, which the
 * listener names apart.
 */
export const PL_OVERLAY =
  '.app-root [role="menu"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-plan), .app-root [role="dialog"]:not(.pl-sheet):not(.pl-cols-menu):not(.pl-peek):not(.pl-plan)';

/**
 * Where a list's own route lands now that Lists is a view of People: the list, picked, by its kind. A link that named the
 * old page (Playbooks' list, an answer's jump, an address someone kept) still arrives. The shell asks (window.__listRoute).
 */
export const plListRoute = (id: string | null | undefined): string => {
  const people = surfaceValue("people");
  if (!id || !people) return "clients";
  if ([...(people.saved || []), ...(people.archived || [])].some((s) => s.id === id)) return `clients/list:${id}`;
  if ((people.lists || []).some((l) => l.id === id)) return `clients/seg:${id}`;
  // One People doesn't have: its own address all the same, where People says it isn't here rather than showing Everyone. A
  // saved list's id is a uuid; a built-in's is a word.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ? `clients/list:${id}`
    : `clients/seg:${id}`;
};
