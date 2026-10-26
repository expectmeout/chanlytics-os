import { formatPhoneDisplay } from "../shared/phone.js";
import { bookingToolName } from "../calendar/booking-notice.js";
import { bookingToolOfLink } from "../google/booking-page.js";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox.js";
import { CARRIER_WORDS } from "../voice/forwarding.js";
import { importLinesOf } from "../imports/ledger.js";
const CARRIER_NAMES = [
  [/verizon/i, "verizon"],
  [/\bat&?t\b|cingular/i, "att"],
  [/t-?mobile|metropcs|sprint/i, "tmobile"]
];
export function lineLookupOf(raw) {
  if (!raw) return null;
  const t = (raw.type ?? "").toLowerCase();
  const type = t === "mobile" ? "mobile" : t === "landline" ? "landline" : t === "fixedvoip" || t === "nonfixedvoip" ? "voip" : "unknown";
  const name = raw.carrier?.trim() || null;
  const carrier = type === "voip" ? "office" : type === "mobile" ? CARRIER_NAMES.find(([re]) => re.test(name ?? ""))?.[1] ?? (name ? "other" : null) : type === "landline" ? "other" : null;
  return { type, carrier, name };
}
const CLIENT_EXPORTS = {
  vagaro: {
    file: "Excel",
    steps: [
      "In Vagaro, open Reports \u203A Customers \u203A Customer List. It takes the account owner.",
      "Select all, then Export \u203A Excel.",
      "Drop the file here, as it is."
    ]
  },
  booksy: {
    file: "CSV",
    steps: ["In Booksy, open Customers.", "Choose Export to CSV.", "Drop the file here, as it is."]
  }
};
export const FIRST_RUN_CHANNELS_WORDS = {
  ownNumber: (n) => n ? `On its own number, ${n}` : "On its own number",
  calls: {
    keepListed: "Your Google listing's number",
    lookup: (l) => l.type === "mobile" ? `a ${l.carrier && l.carrier !== "other" ? `${CARRIER_WORDS[l.carrier]} ` : ""}mobile, we checked` : l.type === "landline" ? "a landline, we checked" : l.type === "voip" ? `an office phone system${l.name ? ` (${l.name})` : ""}, we checked` : null,
    nobodyPicksUp: "Calls nobody picks up go to your receptionist.",
    everyCall: "Every call goes to your receptionist.",
    newSays: "Customers call this number directly. Put it on your Google listing and your website once it's live.",
    moveSays: "Nothing changes for customers. Until the move is done, the number forwards."
  },
  whatsapp: {
    title: "WhatsApp",
    question: (n) => `Is ${n} on WhatsApp Business?`,
    questionNone: "Is your business on WhatsApp Business?",
    yes: "It's on WhatsApp Business",
    notYet: "Not yet",
    /** Keeping the app (R12, coexistence), said only where this deployment connects that way. */
    same: (n) => `WhatsApp on ${n}`,
    sameSays: "Keep using the app: your receptionist answers what you don't. Your contacts and last 6 months of chats come in, if you say yes in Meta's window.",
    /** Where it cannot keep the app yet: honest about what connecting does. */
    sameMoves: "WhatsApp moves to a number on Chanlytics. The app on your phone stops receiving its messages.",
    own: (n) => n ? `On its own number, ${n}` : "On its own number",
    ownSays: "Customers write there; we register it with Meta for you.",
    later: "Later",
    laterSays: "Today keeps it as a row to finish.",
    approveAtGoLive: "Approve on your phone at Go live",
    connected: (n) => n ? `Connected on ${n}` : "Connected"
  },
  bookings: {
    title: (tool) => tool ? `Bookings \xB7 ${tool}` : "Bookings",
    found: (tool, where) => `${tool} found${where ? ` on ${where}` : ""}`,
    linkSays: "Its calendar link: open times, who's coming, and six months back. Bring your client list too.",
    linkRead: (past, coming) => past !== null ? `Link read \xB7 ${past.toLocaleString()} before today${coming ? `, ${coming} coming up` : ""}` : "Link read",
    linkNone: "Paste its calendar link here any time: reminders the day before need it.",
    linkBroken: "The calendar link didn't read. Change it, or paste it again.",
    how: "How do people book with you?",
    byHand: "They call or walk in",
    bySite: "A booking site",
    byMessage: "By message",
    byHandSays: "Your receptionist takes their name, what they need and when, and you confirm. Reminders the day before need a calendar: paste its link here any time.",
    paste: "Paste a calendar link (optional)",
    clients: "Bring your clients",
    clientsDone: (n, tool) => `${n.toLocaleString()} clients in${tool ? ` from ${tool}` : ""}`,
    change: "Change the link"
  },
  clients: {
    heading: (tool) => tool ? `Bring your clients from ${tool}` : "Bring your clients",
    steps: (tool) => [
      `In ${tool ?? "your booking tool"}, export your client list as a file (CSV or Excel).`,
      "Drop the file here, as it is."
    ],
    noYes: "They come in as your clients, with no yes to messages: offers wait until each one gives it.",
    columnsFound: "Columns found",
    add: (n) => `Add ${n.toLocaleString()} ${n === 1 ? "person" : "people"}`,
    notNow: "Not now"
  },
  email: {
    title: "Your email",
    says: "Connect the inbox you already use: six months of customers' emails and your contacts come in, and offers and sequences go from your address.",
    google: "Connect Gmail",
    microsoft: "Connect Outlook",
    soon: "Coming soon",
    soonSays: "Connecting Gmail or Outlook opens once Google and Microsoft finish their review. Until then email stays in your own inbox.",
    connected: (address) => `${address} is connected`,
    notAnswered: EMAIL_NOT_ANSWERED_SENTENCE
  },
  filling: {
    title: "Your dashboard, filling in",
    people: "People",
    peopleSub: "your clients, contacts, WhatsApp",
    inbox: "Inbox",
    inboxSub: "six months of email and chats",
    calendar: "Calendar",
    calendarSub: "coming up",
    reviews: "Reviews",
    reviewsSub: "all of them, from your profile"
  },
  on: (n) => `${n} on \xB7 nothing is charged yet`
};
function whatsappOf(i) {
  const W = FIRST_RUN_CHANNELS_WORDS.whatsapp;
  const wa = i.dto.channels.whatsapp;
  const kept = i.phone.way !== "new" ? i.phone.number : null;
  const keptShown = formatPhoneDisplay(kept);
  const own = i.phone.way === "new" && i.phone.number ? formatPhoneDisplay(i.phone.number) : null;
  if (wa.present)
    return {
      title: W.title,
      connected: W.connected(formatPhoneDisplay(wa.number)),
      question: null,
      options: [],
      value: null,
      after: null
    };
  const options = [];
  if (keptShown && i.onWhatsapp !== false)
    options.push({ key: "same", label: W.same(keptShown), says: i.coexistence ? W.sameSays : W.sameMoves });
  options.push({ key: "own", label: W.own(own), says: W.ownSays });
  options.push({ key: "later", label: W.later, says: W.laterSays });
  return {
    title: W.title,
    connected: null,
    question: keptShown ? { label: W.question(keptShown), yes: W.yes, notYet: W.notYet, value: i.onWhatsapp } : null,
    options,
    value: options.some((o) => o.key === i.whatsapp) ? i.whatsapp : null,
    after: i.whatsapp && i.whatsapp !== "later" ? W.approveAtGoLive : null
  };
}
const siteHostOf = (raw) => {
  try {
    return raw ? new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};
function bookingsOf(i) {
  const W = FIRST_RUN_CHANNELS_WORDS.bookings;
  const cal = i.dto.calendar;
  const tool = cal.tool ?? bookingToolOfLink(i.bookingLink);
  const toolName = bookingToolName(tool);
  const calRow = (i.dto.imports ?? []).find((r) => r.source === "calendar") ?? null;
  const clientsRow = (i.dto.imports ?? []).find((r) => r.source === "clients_file") ?? null;
  const link = cal.state === "ok" ? W.linkRead(calRow?.counts.past ?? null, calRow?.counts.coming ?? null) : cal.state === "unavailable" ? W.linkBroken : null;
  return {
    title: W.title(toolName),
    tool,
    toolName,
    found: toolName ? W.found(toolName, siteHostOf(i.website)) : null,
    says: toolName ? W.linkSays : W.byHandSays,
    link,
    how: toolName ? null : {
      label: W.how,
      options: [
        { key: "hand", label: W.byHand },
        { key: "site", label: W.bySite },
        { key: "message", label: W.byMessage }
      ],
      says: W.byHandSays
    },
    clients: {
      label: W.clients,
      done: clientsRow && clientsRow.state === "done" && clientsRow.counts.people !== void 0 ? W.clientsDone(clientsRow.counts.people, toolName) : null
    },
    change: W.change
  };
}
function clientsOf(tool, toolName) {
  const W = FIRST_RUN_CHANNELS_WORDS.clients;
  const known = tool ? CLIENT_EXPORTS[tool] ?? null : null;
  return {
    heading: W.heading(toolName),
    steps: known ? [...known.steps] : W.steps(toolName),
    file: known?.file ?? null,
    noYes: W.noYes
  };
}
function emailOf(i) {
  const W = FIRST_RUN_CHANNELS_WORDS.email;
  const sending = i.dto.email?.sending ?? null;
  const on = sending?.mailboxes[0] ?? null;
  const providers = (sending?.providers ?? []).map((p) => ({ key: p, label: p === "google" ? W.google : W.microsoft }));
  return {
    title: W.title,
    state: on ? "connected" : providers.length ? "connect" : "soon",
    says: on ? W.connected(on.address) : providers.length ? W.says : W.soonSays,
    providers: on ? [] : providers,
    note: W.notAnswered
  };
}
function fillingOf(i, rows) {
  const W = FIRST_RUN_CHANNELS_WORDS.filling;
  const by = (s) => rows.find((r) => r.source === s) ?? null;
  const cal = by("calendar");
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const chats = by("whatsapp_history");
  const messages = (mail?.counts.messages ?? 0) + (chats?.counts.messages ?? 0);
  const lines = importLinesOf(rows, { whatsappWaiting: i.whatsapp === "same" });
  return {
    title: W.title,
    rows: [
      { key: "people", label: W.people, sub: W.peopleSub, value: i.people ? i.people.toLocaleString() : "\u2014" },
      { key: "inbox", label: W.inbox, sub: W.inboxSub, value: messages ? messages.toLocaleString() : "\u2014" },
      {
        key: "calendar",
        label: W.calendar,
        sub: cal?.counts.past !== void 0 ? `${W.calendarSub} \xB7 ${cal.counts.past} back` : W.calendarSub,
        value: cal?.counts.coming !== void 0 ? String(cal.counts.coming) : "\u2014"
      },
      {
        key: "reviews",
        label: W.reviews,
        sub: W.reviewsSub,
        value: reviews?.counts.reviews !== void 0 ? reviews.counts.reviews.toLocaleString() : "\u2014"
      }
    ],
    bringing: lines.of ? { done: lines.done, of: lines.of } : null
  };
}
export function firstRunChannelsOf(i) {
  const rows = i.dto.imports ?? [];
  const bookings = bookingsOf(i);
  const email = emailOf(i);
  const whatsapp = whatsappOf(i);
  const on = [
    i.phone.stage === "choose" ? !i.phone.held : i.vm.lineUnderway,
    !!whatsapp.connected || !!whatsapp.value && whatsapp.value !== "later",
    !!bookings.link && i.dto.calendar.state === "ok",
    email.state === "connected"
  ].filter(Boolean).length;
  return {
    whatsapp,
    bookings,
    clients: clientsOf(bookings.tool, bookings.toolName),
    email,
    filling: fillingOf(i, rows),
    foot: FIRST_RUN_CHANNELS_WORDS.on(on)
  };
}
