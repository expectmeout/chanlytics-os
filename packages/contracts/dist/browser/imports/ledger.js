import { dayWords } from "../workspace/billing.js";
import { plural } from "../shared/words.js";
import { DAY_MS } from "../shared/time.js";
import { viaWords } from "./csv.js";
export const IMPORT_SOURCES = [
  "google_reviews",
  "calendar",
  "clients_file",
  "mailbox",
  "contacts",
  "whatsapp_contacts",
  "whatsapp_history"
];
export const HISTORY_BACK_DAYS = 180;
export const IMPORT_STOPPED_WORDS = {
  signedOut: "Your mailbox signed out. Connect it again in Connections, then Try again.",
  removed: "That mailbox was removed, so nothing more comes from it.",
  notTicked: (what) => `${what} weren't ticked when you connected. Connect it again and leave them ticked.`,
  failed: "It stopped part way. What came in is kept.",
  /** The clients' file is read in the browser: Try again is adding it again. */
  clientsAgain: "Add the file again from People \u203A Add people.",
  /** The kept WhatsApp app's history, declined in the app's own prompt (Meta's 2593109). */
  notShared: "Your chat history wasn't shared in the app, so older chats stay there. Every chat from now on comes in.",
  /** Meta offers the kept app's contacts and chats once, while the number connects (decision 0073, R21). */
  offeredOnce: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
  numberGone: "That WhatsApp number is no longer connected, so nothing more comes from it."
};
const ONCE_ONLY = /* @__PURE__ */ new Set(["whatsapp_contacts", "whatsapp_history"]);
export const IMPORT_STATES = ["queued", "running", "done", "failed"];
export const IMPORT_WORDS = {
  titles: {
    google_reviews: "Reviews",
    calendar: "Your calendar",
    clients_file: "Your clients",
    mailbox: "Your inbox",
    contacts: "Your contacts",
    whatsapp_contacts: "WhatsApp contacts",
    whatsapp_history: "WhatsApp chats"
  },
  in: "In",
  stopped: "Stopped",
  queued: "Starting",
  atGoLive: "At Go live",
  retry: "Try again",
  heading: "Coming in while you go on",
  broughtHeading: "What came in before Chanlytics",
  foot: "It shows on each person as before Chanlytics: never counted as today's, never answered.",
  broughtFoot: "Each person shows it as before Chanlytics. It's never counted as today's, never answered, and never a yes.",
  keepsGoing: "It keeps going if you leave",
  bringing: (done, of) => `Bringing it in \xB7 ${done} of ${of}`,
  card: "Brought in",
  whatsappLater: "Contacts and chats, once you approve"
};
const backTo = (oldest) => oldest ? `back to ${dayWords(oldest)}` : "";
function saysOf(r) {
  const c = r.counts;
  const via = viaWords(r.via);
  switch (r.source) {
    case "google_reviews":
      return [
        c.reviews ? `All ${c.reviews.toLocaleString()}${r.oldest ? `, ${backTo(r.oldest)}` : ""}` : "Reading them",
        c.unanswered ? `${c.unanswered} wait for a reply` : null
      ].filter(Boolean).join(" \xB7 ");
    case "calendar":
      return [
        c.past !== void 0 ? `${c.past.toLocaleString()} ${backTo(r.oldest)}`.trim() : "Reading your calendar",
        c.coming ? `${c.coming} coming up` : null
      ].filter(Boolean).join(", ");
    case "clients_file":
      return c.people !== void 0 ? `${c.people.toLocaleString()}${via ? `, from ${via}'s file` : ", from your file"}` : "Reading your file";
    case "contacts":
      return c.people !== void 0 ? `${c.people.toLocaleString()}${via ? `, from ${via}` : ""}` : "Reading them";
    case "mailbox":
      return [
        `Email from people${r.oldest ? `, ${backTo(r.oldest)}` : ""}`,
        c.dropped ? `${c.dropped.toLocaleString()} others dropped` : null,
        c.unreadable ? `${c.unreadable.toLocaleString()} couldn't be read` : null
      ].filter(Boolean).join(" \xB7 ");
    case "whatsapp_contacts":
      return c.people !== void 0 ? `${c.people.toLocaleString()}, into People` : "Reading them";
    case "whatsapp_history":
      return r.oldest ? `${backTo(r.oldest).replace(/^b/, "B")} so far` : "Chats from the last six months";
  }
}
function standOf(r) {
  const W = IMPORT_WORDS;
  if (r.state === "done") return W.in;
  if (r.state === "failed") return W.stopped;
  if (r.state === "queued") return W.queued;
  if (r.parts_total && r.parts_total > 1) {
    return r.source === "whatsapp_history" ? `${r.parts_done} of ${r.parts_total}` : `${Math.min(99, Math.round(r.parts_done / r.parts_total * 100))}%`;
  }
  return "\u2026";
}
export function importLineOf(r) {
  return {
    source: r.source,
    title: IMPORT_WORDS.titles[r.source],
    says: r.state === "failed" && r.last_error ? r.last_error : saysOf(r),
    stand: standOf(r),
    state: r.state,
    retry: r.state === "failed" && !ONCE_ONLY.has(r.source)
  };
}
export const WHATSAPP_PART_WORDS = {
  parts: [
    { key: "day", label: "The last day", back: 1 },
    { key: "quarter", label: "The last 90 days", back: 90 },
    { key: "half", label: "The last 6 months", back: HISTORY_BACK_DAYS }
  ],
  lastDay: "Chats from the last 24 hours",
  in: "In",
  coming: "Coming in",
  next: "Next",
  note: (assistant) => `Older chats show in each person's thread as before Chanlytics. ${assistant ?? "Your receptionist"} answers only what comes in from now.`
};
export function whatsappPartsOf(r) {
  if (!r || r.source !== "whatsapp_history" || r.state === "failed") return [];
  const W = WHATSAPP_PART_WORDS;
  const from = r.started_at ? Date.parse(r.started_at) : NaN;
  return W.parts.map((p, i) => {
    const state = r.state === "done" || r.parts_done > i ? "done" : r.parts_done === i && r.state === "running" ? "running" : "next";
    const back = Number.isFinite(from) ? `Back to ${dayWords(new Date(from - p.back * DAY_MS).toISOString())}` : "";
    return {
      key: p.key,
      label: p.label,
      says: p.key === "day" ? W.lastDay : back,
      stand: state === "done" ? W.in : state === "running" ? W.coming : W.next,
      state
    };
  });
}
export function importNotesOf(sources, rows) {
  if (!sources || !rows) return [];
  return rows.filter((r) => sources.includes(r.source)).map((r) => {
    const l = importLineOf(r);
    return { text: `${l.title}: ${l.says}${l.state === "done" ? "" : ` \xB7 ${l.stand}`}`, live: true };
  });
}
const SAID_ORDER = [
  "google_reviews",
  "calendar",
  "clients_file",
  "contacts",
  "mailbox",
  "whatsapp_contacts",
  "whatsapp_history"
];
export function importLinesOf(rows, o = { whatsappWaiting: false }) {
  const got = [...rows ?? []].sort((a, b) => SAID_ORDER.indexOf(a.source) - SAID_ORDER.indexOf(b.source));
  const lines = got.map(importLineOf);
  const hasWhatsapp = got.some((r) => r.source === "whatsapp_contacts" || r.source === "whatsapp_history");
  if (o.whatsappWaiting && !hasWhatsapp)
    lines.push({
      source: "whatsapp_history",
      title: "WhatsApp",
      says: IMPORT_WORDS.whatsappLater,
      stand: IMPORT_WORDS.atGoLive,
      state: "waiting",
      retry: false
    });
  const done = lines.filter((l) => l.state === "done").length;
  return { lines, done, of: lines.length, running: lines.some((l) => l.state === "running" || l.state === "queued") };
}
export function broughtInCardOf(rows, people) {
  const got = rows ?? [];
  if (!got.length) return null;
  const by = (s) => got.find((r) => r.source === s) ?? null;
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const cal = by("calendar");
  const wa = by("whatsapp_history");
  const first = [
    people ? plural(people, "person", "people") : null,
    reviews?.counts.reviews ? plural(reviews.counts.reviews, "review") : null
  ].filter(Boolean);
  const lines = [
    first.length ? first.join(" \xB7 ") : null,
    mail?.oldest ? `Email ${backTo(mail.oldest)}` : null,
    cal && cal.counts.past !== void 0 ? [
      `${cal.counts.past.toLocaleString()} on your calendar before today`,
      cal.counts.coming ? `${cal.counts.coming} coming up` : null
    ].filter(Boolean).join(" \xB7 ") : null
  ].filter((x) => !!x);
  const coming = wa && wa.state === "running" && wa.parts_total ? `WhatsApp chats \xB7 ${wa.parts_done} of ${wa.parts_total} parts` : null;
  return { title: IMPORT_WORDS.card, lines, coming };
}
const BROUGHT_IN_SHOWN_MS = 7 * DAY_MS;
export function broughtInShown(rows, nowMs) {
  const got = rows ?? [];
  if (!got.length) return false;
  if (got.some((r) => r.state !== "done")) return true;
  const last = Math.max(...got.map((r) => r.finished_at ? Date.parse(r.finished_at) : 0));
  return Number.isFinite(last) && nowMs - last < BROUGHT_IN_SHOWN_MS;
}
