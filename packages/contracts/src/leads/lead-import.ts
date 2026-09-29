/**
 * A list of your own (Reach out, Part 7; docs/superpowers/plans/2026-09-28-reach-out-part-7-bring-your-own-list.md,
 * J1-J12): a file of businesses read as leads, and leads chosen on Leads, each a search a reach-out writes to.
 *
 * Pure. The file is read here, the way People's import reads a client list (shared/csv.ts), with the columns a
 * business has: its name, an email, a phone, a website, a city, a state and a category. The two doors' bodies are
 * checked here too, and every sentence the import sheet, *Write to them* and a list's own strip say is spelled once.
 * The doors (00242 lead_search_import, lead_search_choose) read every row again.
 */
import { z } from "zod";
import { COLUMN_SHARE, columnShare, isHeaderRow, parseCsv, phoneShaped } from "../shared/csv";
import { normalizeEmail } from "../shared/email-address";
import { normalizePhone } from "../shared/phone";
import { plural } from "../shared/words";
import { clockDate } from "../shared/clock";
import { LEAD_CARDS } from "./search/cards";
import { LEAD_ESTIMATE_MARGIN } from "./search/caps";
import { US_STATES } from "./search/plan";
import type { LeadSearchVia } from "./search/sets";
import type { LeadSearchRoundDto } from "./lead-dtos";

/** The most rows a file may bring, and leads one press may choose: one checker run's batch (CHECK_BATCH, J5). */
export const LEAD_LIST_MAX = 500;

/** The two ways a search is a list of the owner's own (J1). */
export const LEAD_LIST_VIAS = ["import", "chosen"] as const satisfies readonly LeadSearchVia[];
export type LeadListVia = (typeof LEAD_LIST_VIAS)[number];

/** Whether a search is a list of the owner's own, which nothing searches again (J8, J9). */
export const isLeadList = (s: { via?: string | null } | null | undefined): boolean =>
  !!s && (LEAD_LIST_VIAS as readonly string[]).includes(s.via ?? "");

/* ------------------------------------------------------------------ the file's columns */

/** Where each of a business's facts is in the file, by column; null where the file has none. */
export interface LeadImportColumns {
  name: number | null;
  email: number | null;
  phone: number | null;
  website: number | null;
  city: number | null;
  region: number | null;
  category: number | null;
}

const WORDS: Record<keyof LeadImportColumns, RegExp> = {
  email: /^(e-?mail|email ?address|e-?mail ?address|work ?e-?mail|business ?e-?mail|contact ?e-?mail)$/i,
  phone: /^(phone|phone ?number|telephone|tel|mobile|cell|business ?phone|main ?phone|number)$/i,
  website: /^(website|web ?site|url|site|domain|web|homepage|website ?url)$/i,
  city: /^(city|town|locality)$/i,
  region: /^(state|region|province|st)$/i,
  category: /^(category|industry|type|business ?type|kind|niche|vertical)$/i,
  name: /^(business|business ?name|company|company ?name|name|organi[sz]ation|account|account ?name|store|shop|practice|brand)$/i,
};
/** The order a header's words are tried in: an email's column first, the name last, as People's import does. */
const ORDER: (keyof LeadImportColumns)[] = ["email", "phone", "website", "city", "region", "category", "name"];

/** A website's host from what a file holds: "https://www.Example.com/about" is example.com; anything else, null. */
export function websiteHostOf(raw: string | null | undefined): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
  if (!s || s.length > 120 || s.includes("@")) return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null;
}

/** A state as a listing spells it: "TX" or "Texas" is TX; anything else, null. */
export function regionOf(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const codes = new Set(Object.values(US_STATES));
  if (/^[A-Za-z]{2}$/.test(s) && codes.has(s.toUpperCase())) return s.toUpperCase();
  return US_STATES[s.toLowerCase()] ?? null;
}

/**
 * Where a business's facts are. The first row is a header when none of its cells is an address or a number; a header
 * names its columns by their words, and a column no header names is known by what it holds (six in ten of its filled
 * cells an address, a number or a website). The name is the header's, else the first column of words that is none of
 * those.
 */
export function leadImportColumns(rows: string[][]): { columns: LeadImportColumns; header: boolean } {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns: LeadImportColumns = {
    name: null,
    email: null,
    phone: null,
    website: null,
    city: null,
    region: null,
    category: null,
  };
  const taken = (i: number): boolean => Object.values(columns).includes(i);
  if (header)
    first.forEach((h, i) => {
      const k = ORDER.find((key) => columns[key] === null && WORDS[key].test(h.trim()));
      if (k) columns[k] = i;
    });
  for (let i = 0; i < width; i++) {
    if (taken(i)) continue;
    if (columns.email === null && columnShare(body, i, (v) => normalizeEmail(v) !== null) >= COLUMN_SHARE)
      columns.email = i;
    else if (columns.phone === null && columnShare(body, i, phoneShaped) >= COLUMN_SHARE) columns.phone = i;
    else if (columns.website === null && columnShare(body, i, (v) => websiteHostOf(v) !== null) >= COLUMN_SHARE)
      columns.website = i;
  }
  if (columns.name === null)
    for (let i = 0; i < width; i++) {
      if (taken(i)) continue;
      const words = (v: string) => /\p{L}/u.test(v) && normalizeEmail(v) === null && websiteHostOf(v) === null;
      if (columnShare(body, i, words) >= COLUMN_SHARE) {
        columns.name = i;
        break;
      }
    }
  return { columns, header };
}

/** One row of the file as the door takes it; `line` is its line in the file, for what the sheet says it left out. */
export interface LeadImportRow {
  line: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  website_host: string | null;
  city: string | null;
  region: string | null;
  category: string | null;
}

/** A row the door can take: a business's name and an address (J4). */
export const leadImportReady = (r: LeadImportRow): boolean => !!r.name && !!r.email;

/** The file as a plan: its rows, where the columns are, and the counts the owner sees before anything is written. */
export function leadImportPlanOf(text: string): {
  columns: LeadImportColumns;
  header: boolean;
  headers: string[];
  rows: LeadImportRow[];
  counts: { rows: number; ready: number; noEmail: number; noName: number };
} {
  const cells = parseCsv(text || "");
  const { columns, header } = leadImportColumns(cells);
  const cell = (r: string[], i: number | null): string => (i === null ? "" : (r[i] ?? "").trim());
  const words = (v: string, max: number): string | null =>
    Array.from(v.replace(/\s+/g, " ")).slice(0, max).join("").trim() || null;
  const rows = (header ? cells.slice(1) : cells).map((r, n): LeadImportRow => {
    const carried = (r as { line?: number }).line;
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: words(cell(r, columns.name), 200),
      email: normalizeEmail(cell(r, columns.email)),
      phone: normalizePhone(cell(r, columns.phone)),
      website_host: websiteHostOf(cell(r, columns.website)),
      city: words(cell(r, columns.city), 120),
      region: regionOf(cell(r, columns.region)),
      category: words(cell(r, columns.category), 120),
    };
  });
  return {
    columns,
    header,
    headers: header ? (cells[0] ?? []) : [],
    rows,
    counts: {
      rows: rows.length,
      ready: rows.filter(leadImportReady).length,
      noEmail: rows.filter((r) => !r.email).length,
      noName: rows.filter((r) => !!r.email && !r.name).length,
    },
  };
}

/* ------------------------------------------------------------------ the doors' bodies */

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();

/** One row of POST lead-searches/import, as leadImportPlanOf reads it. */
export const LeadImportRowSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().min(3).max(254),
  phone: nullableText(16),
  website_host: nullableText(120),
  city: nullableText(120),
  region: nullableText(2),
  category: nullableText(120),
});

/** POST lead-searches/import: a list's name, who they are (the search's `asked`), and 1 to 500 rows (J5). */
export const LeadImportSchema = z.object({
  name: z.string().trim().min(1).max(120),
  asked: z.string().trim().max(400).optional(),
  rows: z.array(LeadImportRowSchema).min(1).max(LEAD_LIST_MAX),
});
export type LeadImportInput = z.infer<typeof LeadImportSchema>;

/** POST lead-searches/chosen: the list's name and the chosen leads (J7). */
export const LeadChooseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  lead_ids: z.array(z.string().uuid()).min(1).max(LEAD_LIST_MAX),
});
export type LeadChooseInput = z.infer<typeof LeadChooseSchema>;

/**
 * What checking a file's addresses may cost, reserved as a round's estimate is (J3): the card's own price an address
 * with the finder's margin, never under the checker run's own floor of $0.50 (core check.ts's cap).
 */
export function leadImportEstimateUsd(addresses: number): number {
  const each = LEAD_CARDS.find((c) => c.id === "local_businesses")?.checkPerEmailUsd ?? 0.00089;
  return Math.max(0.5, Math.round(Math.max(0, addresses) * each * LEAD_ESTIMATE_MARGIN * 100) / 100);
}

/* ------------------------------------------------------------------ the words */

export const LEAD_IMPORT_WORDS = {
  importDoor: "Import leads",
  importTitle: "Import leads",
  importSub:
    "A file of businesses you want to write to: a name and an email on each row, and a phone, a website, a city or a state where you have them. Every address is checked before a reach-out may write to it.",
  file: "Choose a CSV file",
  paste: "Or paste the rows",
  pastePlaceholder: "Business,Email,Website,City,State\nZilker Kettlebell Club,hello@example.com,example.com,Austin,TX",
  read: "Read the rows",
  nameLabel: "Name this list",
  askedLabel: "Who are they?",
  askedHint: "A line about them for the emails, like “gyms I met at the Austin expo”. Leave it and the name is used.",
  costs: "Each address that checks out counts as one of this month's leads, as a found lead does.",
  tooMany: `A list takes at most ${LEAD_LIST_MAX} rows. Split the file and import the rest as another list.`,
  nothing: "No row has both a business name and an email address, so there is nothing to import.",
  failed: "The list could not be imported. Nothing was written.",
  write: "Write to them",
  writeHint: "The chosen leads become a list of their own, and the reach-out's sheet opens on it.",
  writing: "Making the list…",
  searchAgain: "A list of your own is not searched again. Start a new search to find more businesses.",
} as const;

/** "142 rows · 138 with a name and an email · 4 without": the preview's first line. */
export function leadImportCountWords(c: { rows: number; ready: number; noEmail: number; noName: number }): string {
  const without = c.rows - c.ready;
  return `${plural(c.rows, "row")} · ${c.ready.toLocaleString()} with a name and an email${without ? ` · ${without.toLocaleString()} without` : ""}`;
}

/** Which column was taken for what, in the header's own words. */
export function leadImportColumnWords(
  plan: Pick<ReturnType<typeof leadImportPlanOf>, "columns" | "header" | "headers">,
): string {
  if (!plan.header) return "No header row: the columns were told apart by what is in them.";
  const said = (i: number | null): string => (i === null ? "not found" : `“${String(plan.headers[i] ?? "").trim()}”`);
  const c = plan.columns;
  return `Columns: business ${said(c.name)}, email ${said(c.email)}, phone ${said(c.phone)}, website ${said(c.website)}.`;
}

/** The import's Save: what it does, and about what it costs. */
export const leadImportSaveLabel = (n: number): string => `Import ${n.toLocaleString()} and check their addresses`;

/** A name for a list the file did not name: the file's own name without its extension, else the day. */
export function leadImportNameOf(fileName: string | null | undefined, nowMs: number, tz: string): string {
  const base = String(fileName ?? "")
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  return (base || `Imported on ${clockDate(nowMs, tz, nowMs)}`).slice(0, 120);
}

/**
 * The name *Write to them* gives the leads it chose: "Chosen on Sep 28", by the day and never by a count, since how
 * many join is the door's to say. Rename changes it.
 */
export const leadChooseNameOf = (nowMs: number, tz: string): string => `Chosen on ${clockDate(nowMs, tz, nowMs)}`;

/** lead_search_import's answer. */
export interface LeadImportAnswer {
  search_id: string;
  added: number;
  checking: number;
  counted: number;
  left_out: { unreadable: number; twice: number; customer: number; never_again: number; elsewhere?: number };
}

/** lead_search_choose's answer. */
export interface LeadChooseAnswer {
  search_id: string;
  counted: number;
  left_out: { not_counted: number; no_email: number; gone: number };
}

const leftOut = (parts: [number, string, string][]): string | null => {
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n.toLocaleString()} ${n === 1 ? one : many}`);
  return said.length ? `Left out: ${said.join(", ")}.` : null;
};

/** What an import did, in the sheet's summary: what joined, what is being checked, what was left out and why. */
export function leadImportAnswerWords(a: LeadImportAnswer, leftByPage = 0): { title: string; lines: string[] } {
  const joined = a.checking + a.counted;
  const lines = [
    a.checking
      ? `Checking ${plural(a.checking, "address", "addresses")} now: each one that checks out joins Ready, usually within a few minutes.`
      : null,
    a.counted
      ? `${plural(a.counted, "lead")} already counted joined as ${a.counted === 1 ? "it is" : "they are"}.`
      : null,
    leftOut([
      [leftByPage + a.left_out.unreadable, "without a name or an address", "without a name or an address"],
      [a.left_out.twice, "twice in the file", "twice in the file"],
      [a.left_out.customer, "already in People", "already in People"],
      [a.left_out.never_again, "on your never-again list", "on your never-again list"],
      [a.left_out.elsewhere ?? 0, "being checked in another search", "being checked in another search"],
    ]),
  ].filter((l): l is string => !!l);
  return { title: `${plural(joined, "business", "businesses")} on the list`, lines };
}

/** What *Write to them* did: how many are on the list, and why any were left off. */
export function leadChooseAnswerWords(a: LeadChooseAnswer): string {
  const off = leftOut([
    [a.left_out.not_counted, "not yet counted: keep them first", "not yet counted: keep them first"],
    [a.left_out.no_email, "with no address", "with no address"],
    [a.left_out.gone, "no longer here", "no longer here"],
  ]);
  return `${plural(a.counted, "lead")} on the list.${off ? ` ${off}` : ""}`;
}

/** A list's strip, in the finder's strip's place (J8): its check while it runs, then what checked out. */
export function leadListStripOf(s: { via?: string | null; round: LeadSearchRoundDto | null } | null): {
  state: "running" | "ended";
  alert: false;
  title: string;
  parts: string[];
  progress: number | null;
  actions: { id: string; label: string; arg?: string; pile?: boolean }[];
} | null {
  if (!s || !isLeadList(s)) return null;
  const r = s.round;
  const qualified = r?.qualified ?? 0;
  const review = r?.review ?? 0;
  // The finder's own pile door (leads-finder.jsx's strip): it opens Needs review.
  const pile = review
    ? [{ id: "review", label: `${review.toLocaleString()} need a look`, arg: "review", pile: true }]
    : [];
  if (s.via === "chosen")
    return {
      state: "ended",
      alert: false,
      title: `${plural(qualified, "lead")} you chose`,
      parts: [],
      progress: null,
      actions: [],
    };
  // No progress bar: a lead the list joined already counted is ready before the check answers anything.
  if (r && r.state !== "ended")
    return {
      state: "running",
      alert: false,
      title: "Checking the addresses on your list",
      parts: [`${qualified.toLocaleString()} ready so far`],
      progress: null,
      actions: [],
    };
  return {
    state: "ended",
    alert: false,
    title: `${qualified.toLocaleString()} of ${(qualified + review).toLocaleString()} on your list are ready`,
    parts: review ? [`${review.toLocaleString()} could not be confirmed and wait in Needs review`] : [],
    progress: null,
    actions: pile,
  };
}

/** What a list's empty table says while its addresses are checked; null for anything else. */
export function leadListEmptyOf(
  s: { via?: string | null; round: LeadSearchRoundDto | null } | null,
): { title: string; body: string; action: null } | null {
  if (!s || s.via !== "import" || !s.round || s.round.state === "ended") return null;
  return {
    title: "Checking the addresses.",
    body: "Each business shows here once its address checks out; the rest wait in Needs review.",
    action: null,
  };
}
