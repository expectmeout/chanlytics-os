import { COLUMN_SHARE, columnShare, isHeaderRow, parseCsv, phoneShaped } from "../imports/csv.js";
import { normalizeEmail } from "../shared/email-address.js";
import { normalizePhone } from "../shared/phone.js";
import { plural } from "../shared/words.js";
import { clockDate } from "../shared/clock.js";
import { LEAD_CARDS } from "./search/cards.js";
import { LEAD_ESTIMATE_MARGIN } from "./search/caps.js";
import { US_STATES } from "./search/plan.js";
export const LEAD_LIST_MAX = 500;
export const LEAD_IMPORT_MAX_BYTES = 2e6;
export const LEAD_LIST_VIAS = ["import", "chosen"];
export const isLeadList = (s) => !!s && LEAD_LIST_VIAS.includes(s.via ?? "");
const WORDS = {
  email: /^(e-?mail|email ?address|e-?mail ?address|work ?e-?mail|business ?e-?mail|contact ?e-?mail)$/i,
  phone: /^(phone|phone ?number|telephone|tel|mobile|cell|business ?phone|main ?phone|number)$/i,
  website: /^(website|web ?site|url|site|domain|web|homepage|website ?url)$/i,
  city: /^(city|town|locality)$/i,
  region: /^(state|region|province|st)$/i,
  category: /^(category|industry|type|business ?type|kind|niche|vertical)$/i,
  name: /^(business|business ?name|company|company ?name|name|organi[sz]ation|account|account ?name|store|shop|practice|brand)$/i
};
const ORDER = ["email", "phone", "website", "city", "region", "category", "name"];
export function websiteHostOf(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/^www\./, "").split(/[/?#:]/)[0];
  if (!s || s.length > 120 || s.includes("@")) return null;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : null;
}
export function regionOf(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const codes = new Set(Object.values(US_STATES));
  if (/^[A-Za-z]{2}$/.test(s) && codes.has(s.toUpperCase())) return s.toUpperCase();
  return US_STATES[s.toLowerCase()] ?? null;
}
export function leadImportColumns(rows) {
  const first = rows[0] ?? [];
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  const header = isHeaderRow(first);
  const body = header ? rows.slice(1) : rows;
  const columns = {
    name: null,
    email: null,
    phone: null,
    website: null,
    city: null,
    region: null,
    category: null
  };
  const taken = (i) => Object.values(columns).includes(i);
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
      const words = (v) => /\p{L}/u.test(v) && normalizeEmail(v) === null && websiteHostOf(v) === null;
      if (columnShare(body, i, words) >= COLUMN_SHARE) {
        columns.name = i;
        break;
      }
    }
  return { columns, header };
}
export const leadImportReady = (r) => !!r.name && !!r.email;
export function leadImportPlanOf(text) {
  const cells = parseCsv(text || "");
  const { columns, header } = leadImportColumns(cells);
  const cell = (r, i) => i === null ? "" : (r[i] ?? "").trim();
  const words = (v, max) => Array.from(v.replace(/\s+/g, " ")).slice(0, max).join("").trim() || null;
  const rows = (header ? cells.slice(1) : cells).map((r, n) => {
    const carried = r.line;
    return {
      line: carried ?? n + (header ? 2 : 1),
      name: words(cell(r, columns.name), 200),
      email: normalizeEmail(cell(r, columns.email)),
      phone: normalizePhone(cell(r, columns.phone)),
      website_host: websiteHostOf(cell(r, columns.website)),
      city: words(cell(r, columns.city), 120),
      region: regionOf(cell(r, columns.region)),
      category: words(cell(r, columns.category), 120)
    };
  });
  return {
    columns,
    header,
    headers: header ? cells[0] ?? [] : [],
    rows,
    counts: {
      rows: rows.length,
      ready: rows.filter(leadImportReady).length,
      noEmail: rows.filter((r) => !r.email).length,
      noName: rows.filter((r) => !!r.email && !r.name).length
    }
  };
}
export function leadImportEstimateUsd(addresses) {
  const each = LEAD_CARDS.find((c) => c.id === "local_businesses")?.checkPerEmailUsd ?? 89e-5;
  return Math.max(0.5, Math.round(Math.max(0, addresses) * each * LEAD_ESTIMATE_MARGIN * 100) / 100);
}
export const LEAD_IMPORT_WORDS = {
  importDoor: "Import leads",
  importTitle: "Import leads",
  /**
   * What a row needs, in one line under the title, and the rest under `importMore` (the fitted sheets, 14 Oct 2026:
   * five lines on what a file holds opened the sheet).
   */
  importLine: "A name and an email on each row.",
  importMore: "What a row can hold",
  importRest: "A phone, a website, a city or a state, where you have them. Every address is checked before a sequence may write to it.",
  file: "Choose a CSV file",
  paste: "Or paste the rows",
  pastePlaceholder: "Business,Email,Website,City,State\nZilker Kettlebell Club,hello@example.com,example.com,Austin,TX",
  read: "Read the rows",
  nameLabel: "Name this list",
  askedLabel: "Who are they?",
  askedHint: "A line about them for the emails, like \u201Cgyms I met at the Austin expo\u201D. Leave it and the name is used.",
  costs: "Each address that checks out counts as one of this month's leads, as a found lead does.",
  tooMany: `A list takes at most ${LEAD_LIST_MAX} rows. Split the file and import the rest as another list.`,
  tooBig: `That file is larger than ${LEAD_IMPORT_MAX_BYTES / 1e6} MB, more than a list of ${LEAD_LIST_MAX} rows needs. Split it and import each part as a list of its own.`,
  unreadable: "That file could not be read. Save it again as a CSV and choose it once more, or paste its rows.",
  nothing: "No row has both a business name and an email address, so there is nothing to import.",
  failed: "The list could not be imported. Nothing was written.",
  write: "Write to them",
  writeHint: "The chosen leads become a list of their own, and a sequence opens on it.",
  writing: "Making the list\u2026",
  searchAgain: "A list of your own is not searched again. Start a new search to find more businesses."
};
export function leadImportCountWords(c) {
  const without = c.rows - c.ready;
  return `${plural(c.rows, "row")} \xB7 ${c.ready.toLocaleString()} with a name and an email${without ? ` \xB7 ${without.toLocaleString()} without` : ""}`;
}
export function leadImportColumnWords(plan) {
  if (!plan.header) return "No header row: the columns were told apart by what is in them.";
  const said = (i) => i === null ? "not found" : `\u201C${String(plan.headers[i] ?? "").trim()}\u201D`;
  const c = plan.columns;
  return `Columns: business ${said(c.name)}, email ${said(c.email)}, phone ${said(c.phone)}, website ${said(c.website)}.`;
}
export const leadImportSaveLabel = (n) => `Import ${n.toLocaleString()} and check their addresses`;
export function leadImportNameOf(fileName, nowMs, tz) {
  const base = String(fileName ?? "").replace(/\.[a-z0-9]{1,5}$/i, "").replace(/[_-]+/g, " ").trim();
  return (base || `Imported on ${clockDate(nowMs, tz, nowMs)}`).slice(0, 120);
}
export const leadChooseNameOf = (nowMs, tz) => `Chosen on ${clockDate(nowMs, tz, nowMs)}`;
const leftOut = (parts) => {
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n.toLocaleString()} ${n === 1 ? one : many}`);
  return said.length ? `Left out: ${said.join(", ")}.` : null;
};
export function leadImportAnswerWords(a, leftByPage = 0) {
  const joined = a.checking + a.counted;
  const lines = [
    a.checking ? `Checking ${plural(a.checking, "address", "addresses")} now: each one that checks out joins Ready, usually within a few minutes.` : null,
    a.counted ? `${plural(a.counted, "lead")} already counted joined as ${a.counted === 1 ? "it is" : "they are"}.` : null,
    leftOut([
      [leftByPage + a.left_out.unreadable, "without a name or an address", "without a name or an address"],
      [a.left_out.twice, "twice in the file", "twice in the file"],
      [a.left_out.customer, "already in People", "already in People"],
      [a.left_out.never_again, "on your never-again list", "on your never-again list"],
      [a.left_out.elsewhere ?? 0, "being checked in another search", "being checked in another search"]
    ])
  ].filter((l) => !!l);
  return { title: `${plural(joined, "business", "businesses")} on the list`, lines };
}
export function leadChooseAnswerWords(a) {
  const off = leftOut([
    [a.left_out.not_counted, "not yet counted: keep them first", "not yet counted: keep them first"],
    [a.left_out.no_email, "with no address", "with no address"],
    [a.left_out.gone, "no longer here", "no longer here"]
  ]);
  return `${plural(a.counted, "lead")} on the list.${off ? ` ${off}` : ""}`;
}
export function leadListStripOf(s) {
  if (!s || !isLeadList(s)) return null;
  const r = s.round;
  const qualified = r?.qualified ?? 0;
  const review = r?.review ?? 0;
  const pile = review ? [{ id: "review", label: `${review.toLocaleString()} need a look`, arg: "review", pile: true }] : [];
  if (s.via === "chosen")
    return {
      state: "ended",
      alert: false,
      title: `${plural(qualified, "lead")} you chose`,
      parts: [],
      progress: null,
      actions: []
    };
  if (r && r.state !== "ended")
    return {
      state: "running",
      alert: false,
      title: "Checking the addresses on your list",
      parts: [`${qualified.toLocaleString()} ready so far`],
      progress: null,
      actions: []
    };
  return {
    state: "ended",
    alert: false,
    title: `${qualified.toLocaleString()} of ${(qualified + review).toLocaleString()} on your list are ready`,
    parts: review ? [`${review.toLocaleString()} could not be confirmed and wait in Needs review`] : [],
    progress: null,
    actions: pile
  };
}
export function leadListEmptyOf(s) {
  if (!s || s.via !== "import" || !s.round || s.round.state === "ended") return null;
  return {
    title: "Checking the addresses.",
    body: "Each business shows here once its address checks out; the rest wait in Needs review.",
    action: null
  };
}
