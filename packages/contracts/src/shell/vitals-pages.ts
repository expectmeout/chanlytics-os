/**
 * What the shell times a page by, with no schema: the metrics, the page a route is, each page's first part, the phone's
 * width and how many reports a beacon carries. Every page reads them as it loads (the dashboard's client/page-speed.ts and
 * field-data.ts); vitals.ts, which builds the report's schema, read whole carried zod into every first load beside them
 * (the loadability review, 19 Oct 2026). vitals.ts reads them from here.
 */
import { ROUTE_WORDS } from "./address";

/** The browser's five, in the order the back office says them (web-vitals). */
export const PAGE_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type PageVital = (typeof PAGE_VITALS)[number];
/**
 * The shell's own two (decision 0053): a page or a part of one drawn with its rows, from the press that asked for it
 * (or the document's start), and every surface the page draws read. What a person waits for, which the browser's five
 * cannot say: a paint of "Reading…" is a contentful paint.
 */
const PAGE_SPEED = ["READY", "SETTLED"] as const;
export type PageSpeedMetric = (typeof PAGE_SPEED)[number];
/** Every metric the table keeps. Held to page_vitals.metric (shared/schema-sets.ts). */
export const PAGE_METRICS = [...PAGE_VITALS, ...PAGE_SPEED] as const;
export type PageMetric = (typeof PAGE_METRICS)[number];
/** The two shapes of screen a report is from: the kit's one phone width (kit.css, 900px) and under is a phone. Held to page_vitals.device. */
export const PAGE_DEVICES = ["desk", "phone"] as const;
export type PageDevice = (typeof PAGE_DEVICES)[number];
/** The media query the shell reads a phone by: the kit's one phone width. */
export const PAGE_PHONE_QUERY = "(max-width: 900px)";

/** A page's name as the table keeps it (page_vitals.page), and a part's (page_vitals.part): a word in lower case. */
export const PAGE_NAME = /^[a-z][a-z0-9-]{0,31}$/;

/** The most reports one beacon carries: a tab that moved all morning sends its moves in several. */
export const PAGE_VITALS_PER_BEACON = 100;

/**
 * People's scopes, each a page of its own in the field data (decision 0053): what is drawn differs, and so does its time.
 * A person's page is theirs on every tab (`clients/<id>/history`): a tab's press was counted as a visit to the People list
 * (the wiring's second audit, S5-2).
 */
const PEOPLE_SCOPES: ReadonlyArray<readonly [RegExp, string]> = [
  [/^leads(:|$)/, "leads"],
  [/^pipeline(:|$)/, "pipeline"],
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/|$)/i, "person"],
];

/**
 * The page a report is of, from the shell's route (address.ts routeOfAddress): its first segment in the product's
 * word (contracts ROUTE_WORDS: "settings" for "admin", "people" for "clients"), People's scopes by their own names
 * ("leads", "pipeline", "person" for "clients/<id>"), Today for the workspace's own address, and "other" for a route
 * the table would refuse.
 */
export function vitalsPageOf(route: string): string {
  const path = (route ?? "").split("?")[0] ?? "";
  const at = path.indexOf("/");
  const head = at < 0 ? path : path.slice(0, at);
  const rest = at < 0 ? "" : path.slice(at + 1);
  if (head === "") return "today";
  if (head === "clients") return PEOPLE_SCOPES.find(([test]) => test.test(rest))?.[1] ?? "people";
  // Messages is a view of Campaigns (`campaigns/messages`, 19 Oct 2026) and keeps the page name its field data has always had.
  if (head === "campaigns" && /^messages(\/|$)/.test(rest)) return ROUTE_WORDS.messages ?? "templates";
  const word = ROUTE_WORDS[head] ?? head;
  return PAGE_NAME.test(word) ? word : "other";
}

/**
 * Each page's first part (decision 0053): the one its READY is said by, a page drawn with the rows a person came for.
 * A page not named here is READY when the frame's gate opens on it and the page is painted.
 */
export const PRIMARY_PART: Readonly<Record<string, string>> = {
  today: "queue",
  inbox: "list",
  conversations: "list",
  live: "list",
  people: "table",
  leads: "table",
  pipeline: "board",
  person: "hero",
  calendar: "board",
  // Campaigns is Sequences' list (decision 0060): its rows, which the page's code arrives with (a chunk of its own).
  campaigns: "list",
  // Messages, Campaigns' view beside Sequences: its list of messages, drawn as the view is shown.
  templates: "list",
};
