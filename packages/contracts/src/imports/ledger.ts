/**
 * What was brought in (decision 0073, R23): one row per workspace and source in the imports ledger, written by the jobs
 * that bring a connection's history in (Google's reviews, the calendar, the clients' file, the mailbox, the contacts,
 * WhatsApp's contacts and chats) and read by the first run's "Bringing it in", Today's "Brought in" and Connections'
 * sentences. Everything brought is "before Chanlytics": shown, never counted as today's, never answered, never a yes
 * (decision 0073, D15 and D16). Every sentence is here; the pages compose.
 */
import { dayWords } from "../workspace/billing";
import { plural } from "../shared/words";
import { DAY_MS } from "../shared/time";
import { viaWords } from "./csv";

export const IMPORT_SOURCES = [
  "google_reviews",
  "calendar",
  "clients_file",
  "mailbox",
  "contacts",
  "whatsapp_contacts",
  "whatsapp_history",
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** How far back a connection's history reaches: six months (decision 0073, R19 to R21). */
export const HISTORY_BACK_DAYS = 180;

/**
 * Why a source stopped, said on its row (ImportRowDto.last_error) with Try again beside it: the mailbox signed out, it
 * was removed, or the owner left the part unticked on the provider's screen.
 */
export const IMPORT_STOPPED_WORDS = {
  signedOut: "Your mailbox signed out. Connect it again in Connections, then Try again.",
  removed: "That mailbox was removed, so nothing more comes from it.",
  notTicked: (what: string) => `${what} weren't ticked when you connected. Connect it again and leave them ticked.`,
  failed: "It stopped part way. What came in is kept.",
  /** The clients' file is read in the browser: Try again is adding it again. */
  clientsAgain: "Add the file again from People › Add people.",
  /** The kept WhatsApp app's history, declined in the app's own prompt (Meta's 2593109). */
  notShared: "Your chat history wasn't shared in the app, so older chats stay there. Every chat from now on comes in.",
  /** Meta offers the kept app's contacts and chats once, while the number connects (decision 0073, R21). */
  offeredOnce: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
  numberGone: "That WhatsApp number is no longer connected, so nothing more comes from it.",
} as const;

/** What comes once, as a connection is made: a stop there is no Try again for (Meta's coexistence sync, R21). */
const ONCE_ONLY: ReadonlySet<ImportSource> = new Set<ImportSource>(["whatsapp_contacts", "whatsapp_history"]);

/** Where a source's run stands: waiting to start, bringing it in, done, or stopped with its error. */
export const IMPORT_STATES = ["queued", "running", "done", "failed"] as const;
export type ImportState = (typeof IMPORT_STATES)[number];

/** What a run brought, each count where the source has it: people, messages (email or chats), visits, reviews. */
export interface ImportCounts {
  people?: number;
  messages?: number;
  /** Mail read and dropped: newsletters, receipts and the rest (decision 0073, D9). */
  dropped?: number;
  /** Visits before today, and those coming up. */
  past?: number;
  coming?: number;
  reviews?: number;
  /** Reviews that wait for a reply. */
  unanswered?: number;
  /** Rows of a file that had neither a number nor an address. */
  unreadable?: number;
}

/** One source's row in the ledger, as the page reads it. */
export interface ImportRowDto {
  source: ImportSource;
  state: ImportState;
  counts: ImportCounts;
  /** Parts done of the parts there are, where the source runs in parts (Meta's three, the mailbox's pages). */
  parts_done: number;
  parts_total: number | null;
  /** How far back it reached, ISO; null before anything came. */
  oldest: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  /** The tool or provider it came from: "vagaro", "google", "microsoft", "link" (a calendar link). */
  via: string | null;
}

/** One line of "Bringing it in" or "Brought in": what it is, what came, and where it stands. */
export interface ImportLineVM {
  source: ImportSource;
  title: string;
  says: string;
  /** "In", "61%", "2 of 3", "At Go live", "Stopped". */
  stand: string;
  state: ImportState | "waiting";
  /** Retry, for a run that stopped. */
  retry: boolean;
}

export const IMPORT_WORDS = {
  titles: {
    google_reviews: "Reviews",
    calendar: "Your calendar",
    clients_file: "Your clients",
    mailbox: "Your inbox",
    contacts: "Your contacts",
    whatsapp_contacts: "WhatsApp contacts",
    whatsapp_history: "WhatsApp chats",
  } as Record<ImportSource, string>,
  in: "In",
  stopped: "Stopped",
  queued: "Starting",
  atGoLive: "At Go live",
  retry: "Try again",
  heading: "Coming in while you go on",
  broughtHeading: "What came in before Chanlytics",
  foot: "It shows on each person as before Chanlytics: never counted as today's, never answered.",
  broughtFoot:
    "Each person shows it as before Chanlytics. It's never counted as today's, never answered, and never a yes.",
  keepsGoing: "It keeps going if you leave",
  bringing: (done: number, of: number) => `Bringing it in · ${done} of ${of}`,
  card: "Brought in",
  whatsappLater: "Contacts and chats, once you approve",
} as const;

/** How far back, said for a source: "back to Apr 23", or "" before anything came. */
const backTo = (oldest: string | null): string => (oldest ? `back to ${dayWords(oldest)}` : "");

/** What one source brought, in words. */
function saysOf(r: ImportRowDto): string {
  const c = r.counts;
  const via = viaWords(r.via);
  switch (r.source) {
    case "google_reviews":
      return [
        c.reviews ? `All ${c.reviews.toLocaleString()}${r.oldest ? `, ${backTo(r.oldest)}` : ""}` : "Reading them",
        c.unanswered ? `${c.unanswered} wait for a reply` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "calendar":
      return [
        c.past !== undefined ? `${c.past.toLocaleString()} ${backTo(r.oldest)}`.trim() : "Reading your calendar",
        c.coming ? `${c.coming} coming up` : null,
      ]
        .filter(Boolean)
        .join(", ");
    case "clients_file":
      return c.people !== undefined
        ? `${c.people.toLocaleString()}${via ? `, from ${via}'s file` : ", from your file"}`
        : "Reading your file";
    case "contacts":
      return c.people !== undefined ? `${c.people.toLocaleString()}${via ? `, from ${via}` : ""}` : "Reading them";
    case "mailbox":
      return [
        `Email from people${r.oldest ? `, ${backTo(r.oldest)}` : ""}`,
        c.dropped ? `${c.dropped.toLocaleString()} others dropped` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    case "whatsapp_contacts":
      return c.people !== undefined ? `${c.people.toLocaleString()}, into People` : "Reading them";
    case "whatsapp_history":
      return r.oldest ? `${backTo(r.oldest).replace(/^b/, "B")} so far` : "Chats from the last six months";
  }
}

/** Where a source's run stands, in the line's last word. */
function standOf(r: ImportRowDto): string {
  const W = IMPORT_WORDS;
  if (r.state === "done") return W.in;
  if (r.state === "failed") return W.stopped;
  if (r.state === "queued") return W.queued;
  if (r.parts_total && r.parts_total > 1) {
    // Meta's history comes in three parts, said as parts; the mailbox's pages as a share.
    return r.source === "whatsapp_history"
      ? `${r.parts_done} of ${r.parts_total}`
      : `${Math.min(99, Math.round((r.parts_done / r.parts_total) * 100))}%`;
  }
  return "…";
}

/** One source's line. */
export function importLineOf(r: ImportRowDto): ImportLineVM {
  return {
    source: r.source,
    title: IMPORT_WORDS.titles[r.source],
    says: r.state === "failed" && r.last_error ? r.last_error : saysOf(r),
    stand: standOf(r),
    state: r.state,
    retry: r.state === "failed" && !ONCE_ONLY.has(r.source),
  };
}

/** One of Meta's three parts of the kept app's history (canvas 5B·i): which days, how far back, and where it stands. */
export interface WhatsappPartVM {
  key: "day" | "quarter" | "half";
  label: string;
  says: string;
  stand: string;
  state: "done" | "running" | "next";
}

/** The words of "Your chats, coming in" (canvas 5B·i): Meta's three parts, and what the chats are once in. */
export const WHATSAPP_PART_WORDS = {
  parts: [
    { key: "day", label: "The last day", back: 1 },
    { key: "quarter", label: "The last 90 days", back: 90 },
    { key: "half", label: "The last 6 months", back: HISTORY_BACK_DAYS },
  ] as const,
  lastDay: "Chats from the last 24 hours",
  in: "In",
  coming: "Coming in",
  next: "Next",
  note: (assistant: string | null) =>
    `Older chats show in each person's thread as before Chanlytics. ${assistant ?? "Your receptionist"} answers only what comes in from now.`,
} as const;

/**
 * The kept app's history in Meta's three parts (canvas 5B·i): the day before the number connected, back to 90 days,
 * back to 180, each in, coming in or next by the parts Meta has finished (the row's parts_done), and how far back each
 * reaches from when the run started. Nothing for a run that stopped: its row says why.
 */
export function whatsappPartsOf(r: ImportRowDto | null | undefined): WhatsappPartVM[] {
  if (!r || r.source !== "whatsapp_history" || r.state === "failed") return [];
  const W = WHATSAPP_PART_WORDS;
  const from = r.started_at ? Date.parse(r.started_at) : NaN;
  return W.parts.map((p, i) => {
    const state: WhatsappPartVM["state"] =
      r.state === "done" || r.parts_done > i
        ? "done"
        : r.parts_done === i && r.state === "running"
          ? "running"
          : "next";
    const back = Number.isFinite(from) ? `Back to ${dayWords(new Date(from - p.back * DAY_MS).toISOString())}` : "";
    return {
      key: p.key,
      label: p.label,
      says: p.key === "day" ? W.lastDay : back,
      stand: state === "done" ? W.in : state === "running" ? W.coming : W.next,
      state,
    };
  });
}

/**
 * What a connection brought in, a line a source on its row in Connections ("Reviews: All 312, back to Mar 4 · 4 wait
 * for a reply"), with where it stands while it is still coming; a source that stopped says why. Always said.
 */
export function importNotesOf(
  sources: readonly ImportSource[] | undefined,
  rows: readonly ImportRowDto[] | null | undefined,
): { text: string; live: true }[] {
  if (!sources || !rows) return [];
  return rows
    .filter((r) => sources.includes(r.source))
    .map((r) => {
      const l = importLineOf(r);
      return { text: `${l.title}: ${l.says}${l.state === "done" ? "" : ` · ${l.stand}`}`, live: true as const };
    });
}

/** Sources in the order they are said: what came first, then what is still coming. */
const SAID_ORDER: readonly ImportSource[] = [
  "google_reviews",
  "calendar",
  "clients_file",
  "contacts",
  "mailbox",
  "whatsapp_contacts",
  "whatsapp_history",
];

/**
 * "Bringing it in" (the first run's step 4, 4·k) and Today's "Brought in" (T·g): a line per source the ledger holds, in
 * order, and WhatsApp's own waiting line where it was chosen and has not started (it starts at Go live). `done` and
 * `of` are the count for "Bringing it in · 2 of 6".
 */
export function importLinesOf(
  rows: readonly ImportRowDto[] | null | undefined,
  o: { whatsappWaiting: boolean } = { whatsappWaiting: false },
): { lines: ImportLineVM[]; done: number; of: number; running: boolean } {
  const got = [...(rows ?? [])].sort((a, b) => SAID_ORDER.indexOf(a.source) - SAID_ORDER.indexOf(b.source));
  const lines = got.map(importLineOf);
  const hasWhatsapp = got.some((r) => r.source === "whatsapp_contacts" || r.source === "whatsapp_history");
  if (o.whatsappWaiting && !hasWhatsapp)
    lines.push({
      source: "whatsapp_history",
      title: "WhatsApp",
      says: IMPORT_WORDS.whatsappLater,
      stand: IMPORT_WORDS.atGoLive,
      state: "waiting",
      retry: false,
    });
  const done = lines.filter((l) => l.state === "done").length;
  return { lines, done, of: lines.length, running: lines.some((l) => l.state === "running" || l.state === "queued") };
}

/**
 * Today's "Brought in" card (T-today): the people, the reviews, how far back email reached, the visits, and the one
 * source still coming in, each a short line; null while nothing came.
 */
export function broughtInCardOf(
  rows: readonly ImportRowDto[] | null | undefined,
  people: number | null,
): { title: string; lines: string[]; coming: string | null } | null {
  const got = rows ?? [];
  if (!got.length) return null;
  const by = (s: ImportSource) => got.find((r) => r.source === s) ?? null;
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const cal = by("calendar");
  const wa = by("whatsapp_history");
  const first = [
    people ? plural(people, "person", "people") : null,
    reviews?.counts.reviews ? plural(reviews.counts.reviews, "review") : null,
  ].filter(Boolean);
  const lines = [
    first.length ? first.join(" · ") : null,
    mail?.oldest ? `Email ${backTo(mail.oldest)}` : null,
    cal && cal.counts.past !== undefined
      ? [
          `${cal.counts.past.toLocaleString()} on your calendar before today`,
          cal.counts.coming ? `${cal.counts.coming} coming up` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null,
  ].filter((x): x is string => !!x);
  const coming =
    wa && wa.state === "running" && wa.parts_total
      ? `WhatsApp chats · ${wa.parts_done} of ${wa.parts_total} parts`
      : null;
  return { title: IMPORT_WORDS.card, lines, coming };
}

/** How long Today keeps its Brought in card after the last source finished: the first week. */
const BROUGHT_IN_SHOWN_MS = 7 * DAY_MS;

/**
 * Whether Today draws its Brought in card (T-today): while anything is still coming in, a source stopped, or within a
 * week of the last one finishing. After that what came in is People's, the Inbox's and the Calendar's own.
 */
export function broughtInShown(rows: readonly ImportRowDto[] | null | undefined, nowMs: number): boolean {
  const got = rows ?? [];
  if (!got.length) return false;
  if (got.some((r) => r.state !== "done")) return true;
  const last = Math.max(...got.map((r) => (r.finished_at ? Date.parse(r.finished_at) : 0)));
  return Number.isFinite(last) && nowMs - last < BROUGHT_IN_SHOWN_MS;
}
