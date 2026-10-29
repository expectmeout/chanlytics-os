/**
 * Where it answers (decision 0073, canvas 4): the first run's fourth step, choices only. Calls (keep the number customers
 * call, a new one, or move it here: first-run-phone.ts at `channels`), WhatsApp (on the same number keeping the app, on
 * the receptionist's own, or later), bookings (the tool found, its calendar link, its clients' file) and the owner's own
 * mailbox; beside them, the dashboard filling in as each connection's history comes in (imports.ts). Nothing is bought
 * here: Go live spends. Every sentence is here; the page composes.
 */
import { formatPhoneDisplay } from "../shared/phone";
import { bookingToolName, type BookingTool } from "../calendar/booking-notice";
import { bookingToolOfLink } from "../google/booking-page";
import { googleAudienceWords } from "../google/audience";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox";
import type { MailboxProvider } from "../email/mailbox-connections";
import { CARRIER_WORDS, type Carrier } from "../voice/forwarding";
import { importLinesOf, type ImportRowDto } from "../imports/ledger";
import type { FirstRunPhoneVM } from "./first-run-phone";
import type { SetupDto, SetupVM, WhatsappChoice } from "./setup";

/** What a number's line is, by the carrier's own records (decision 0073, R11: Twilio Lookup's line type intelligence). */
export interface LineLookupDto {
  /** mobile, landline, voip (an office phone system or an app), or unknown. */
  type: "mobile" | "landline" | "voip" | "unknown";
  /** The carrier whose forwarding codes a mobile takes; `other` for any other company; null where not known. */
  carrier: Carrier | null;
  /** The carrier's own name, as the lookup gave it ("Verizon Wireless", "RingCentral"). */
  name: string | null;
}

/** The carriers whose forwarding codes a mobile takes, by the words Twilio names them with. */
const CARRIER_NAMES: ReadonlyArray<[RegExp, Carrier]> = [
  [/verizon/i, "verizon"],
  [/\bat&?t\b|cingular/i, "att"],
  [/t-?mobile|metropcs|sprint/i, "tmobile"],
];

/**
 * What Twilio Lookup's line type intelligence says of a number, read as step 4 says it (R11): a mobile (and whose codes
 * it takes), a landline, an office phone system (fixed or non-fixed VoIP), or unknown; the carrier's own name beside.
 */
export function lineLookupOf(raw: { type: string | null; carrier: string | null } | null): LineLookupDto | null {
  if (!raw) return null;
  const t = (raw.type ?? "").toLowerCase();
  const type: LineLookupDto["type"] =
    t === "mobile"
      ? "mobile"
      : t === "landline"
        ? "landline"
        : t === "fixedvoip" || t === "nonfixedvoip"
          ? "voip"
          : "unknown";
  const name = raw.carrier?.trim() || null;
  const carrier: Carrier | null =
    type === "voip"
      ? "office"
      : type === "mobile"
        ? (CARRIER_NAMES.find(([re]) => re.test(name ?? ""))?.[1] ?? (name ? "other" : null))
        : type === "landline"
          ? "other"
          : null;
  return { type, carrier, name };
}

/** How each tool lets an owner take their client list out, where we know it (R22): the file it gives, and the steps. */
const CLIENT_EXPORTS: Partial<Record<BookingTool, { file: string; steps: readonly string[] }>> = {
  vagaro: {
    file: "Excel",
    steps: [
      "In Vagaro, open Reports › Customers › Customer List. It takes the account owner.",
      "Select all, then Export › Excel.",
      "Drop the file here, as it is.",
    ],
  },
  booksy: {
    file: "CSV",
    steps: ["In Booksy, open Customers.", "Choose Export to CSV.", "Drop the file here, as it is."],
  },
};

export const FIRST_RUN_CHANNELS_WORDS = {
  ownNumber: (n: string | null) => (n ? `On its own number, ${n}` : "On its own number"),
  calls: {
    keepListed: "Your Google listing's number",
    lookup: (l: LineLookupDto) =>
      l.type === "mobile"
        ? `a ${l.carrier && l.carrier !== "other" ? `${CARRIER_WORDS[l.carrier]} ` : ""}mobile, we checked`
        : l.type === "landline"
          ? "a landline, we checked"
          : l.type === "voip"
            ? `an office phone system${l.name ? ` (${l.name})` : ""}, we checked`
            : null,
    nobodyPicksUp: "Calls nobody picks up go to your receptionist.",
    everyCall: "Every call goes to your receptionist.",
    newSays: "Customers call this number directly. Put it on your Google listing and your website once it's live.",
    moveSays: "Nothing changes for customers. Until the move is done, the number forwards.",
  },
  whatsapp: {
    title: "WhatsApp",
    question: (n: string) => `Is ${n} on WhatsApp Business?`,
    questionNone: "Is your business on WhatsApp Business?",
    yes: "It's on WhatsApp Business",
    notYet: "Not yet",
    /** Keeping the app (R12, coexistence), said only where this deployment connects that way. */
    same: (n: string) => `WhatsApp on ${n}`,
    sameSays:
      "Keep using the app: your receptionist answers what you don't. Your contacts and last 6 months of chats come in, if you say yes in Meta's window.",
    /** Where it cannot keep the app yet: honest about what connecting does. */
    sameMoves: "WhatsApp moves to a number on Chanlytics. The app on your phone stops receiving its messages.",
    own: (n: string | null) => (n ? `On its own number, ${n}` : "On its own number"),
    ownSays: "Customers write there; we register it with Meta for you.",
    later: "Later",
    laterSays: "Today keeps it as a row to finish.",
    approveAtGoLive: "Approve on your phone at Go live",
    connected: (n: string | null) => (n ? `Connected on ${n}` : "Connected"),
  },
  bookings: {
    title: (tool: string | null) => (tool ? `Bookings · ${tool}` : "Bookings"),
    found: (tool: string, where: string | null) => `${tool} found${where ? ` on ${where}` : ""}`,
    linkSays: "Its calendar link: open times, who's coming, and six months back. Bring your client list too.",
    linkRead: (past: number | null, coming: number | null) =>
      past !== null
        ? `Link read · ${past.toLocaleString()} before today${coming ? `, ${coming} coming up` : ""}`
        : "Link read",
    linkNone: "Paste its calendar link here any time: reminders the day before need it.",
    linkBroken: "The calendar link didn't read. Change it, or paste it again.",
    how: "How do people book with you?",
    byHand: "They call or walk in",
    bySite: "A booking site",
    byMessage: "By message",
    byHandSays:
      "Your receptionist takes their name, what they need and when, and you confirm. Reminders the day before need a calendar: paste its link here any time.",
    paste: "Paste a calendar link (optional)",
    clients: "Bring your clients",
    clientsDone: (n: number, tool: string | null) => `${n.toLocaleString()} clients in${tool ? ` from ${tool}` : ""}`,
    change: "Change the link",
  },
  clients: {
    heading: (tool: string | null) => (tool ? `Bring your clients from ${tool}` : "Bring your clients"),
    steps: (tool: string | null) => [
      `In ${tool ?? "your booking tool"}, export your client list as a file (CSV or Excel).`,
      "Drop the file here, as it is.",
    ],
    noYes: "They come in as your clients, with no yes to messages: offers wait until each one gives it.",
    columnsFound: "Columns found",
    add: (n: number) => `Add ${n.toLocaleString()} ${n === 1 ? "person" : "people"}`,
    notNow: "Not now",
  },
  email: {
    title: "Your email",
    says: "Connect the inbox you already use: six months of customers' emails and your contacts come in, and offers and sequences go from your address.",
    google: "Connect Gmail",
    microsoft: "Connect Outlook",
    soon: "Coming soon",
    soonSays:
      "Connecting Gmail or Outlook opens once Google and Microsoft finish their review. Until then email stays in your own inbox.",
    connected: (address: string) => `${address} is connected`,
    notAnswered: EMAIL_NOT_ANSWERED_SENTENCE,
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
    reviewsSub: "all of them, from your profile",
  },
  on: (n: number) => `${n} on · nothing is charged yet`,
} as const;

export interface ChannelsInput {
  /** The workspace's zone, which every day its rows say is in (contracts zone-math; one Intl cannot use reads as UTC). */
  tz: string;
  dto: SetupDto;
  vm: SetupVM;
  /** The calls part, as first-run-phone.ts says it at `channels` (what the number kept is, looked up, is the tile's own). */
  phone: FirstRunPhoneVM;
  /** WhatsApp, as chosen on the page (the tab's) or saved; null before a choice. */
  whatsapp: WhatsappChoice | null;
  /** The answer to "Is it on WhatsApp Business?"; null before one. */
  onWhatsapp: boolean | null;
  /** This deployment connects WhatsApp keeping the app (Embedded Signup v4's coexistence, R12). */
  coexistence: boolean;
  /** The booking link the receptionist sends (the settings read), for the tool it is on; null for none. */
  bookingLink: string | null;
  /** The business's website, where a tool was found on it (Check's booking page); null for none. */
  website: string | null;
  /** The workspace's people, for "Your dashboard, filling in". */
  people: number | null;
}

export interface FirstRunChannelsVM {
  whatsapp: {
    title: string;
    /** Already connected: what it says, and nothing to choose. */
    connected: string | null;
    question: { label: string; yes: string; notYet: string; value: boolean | null } | null;
    options: { key: WhatsappChoice; label: string; says: string }[];
    value: WhatsappChoice | null;
    /** Said under the choice once made: when it connects. */
    after: string | null;
  };
  bookings: {
    title: string;
    tool: BookingTool | null;
    toolName: string | null;
    found: string | null;
    says: string;
    /** The calendar link's state in words, where one is kept; null for none. */
    link: string | null;
    /** No tool found: how people book, as the three answers. */
    how: { label: string; options: { key: "hand" | "site" | "message"; label: string }[]; says: string } | null;
    clients: { label: string; done: string | null };
    change: string;
  };
  clients: { heading: string; steps: string[]; file: string | null; noYes: string };
  email: {
    title: string;
    state: "connect" | "connected" | "soon";
    says: string;
    providers: { key: MailboxProvider; label: string }[];
    note: string;
  };
  filling: {
    title: string;
    rows: { key: "people" | "inbox" | "calendar" | "reviews"; label: string; sub: string; value: string }[];
    /** What is coming in, sources done of sources there are; null for nothing coming. */
    bringing: { done: number; of: number } | null;
  };
  /** What is chosen so far: "3 on · nothing is charged yet". */
  foot: string;
}

/** WhatsApp's tile: connected, or the question and the three ways it can answer. */
function whatsappOf(i: ChannelsInput): FirstRunChannelsVM["whatsapp"] {
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
      after: null,
    };
  const options: FirstRunChannelsVM["whatsapp"]["options"] = [];
  // On the number customers call, when there is one kept and the business says it is on WhatsApp Business.
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
    after: i.whatsapp && i.whatsapp !== "later" ? W.approveAtGoLive : null,
  };
}

/** The host a booking link or website is on, as the owner reads it. */
const siteHostOf = (raw: string | null): string | null => {
  try {
    return raw ? new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`).host.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

/** The bookings tile: the tool found, its calendar link and its clients' file; or, with none, how people book. */
function bookingsOf(i: ChannelsInput): FirstRunChannelsVM["bookings"] {
  const W = FIRST_RUN_CHANNELS_WORDS.bookings;
  const cal = i.dto.calendar;
  const tool = (cal.tool as BookingTool | null | undefined) ?? bookingToolOfLink(i.bookingLink);
  const toolName = bookingToolName(tool);
  const calRow = (i.dto.imports ?? []).find((r) => r.source === "calendar") ?? null;
  const clientsRow = (i.dto.imports ?? []).find((r) => r.source === "clients_file") ?? null;
  const link =
    cal.state === "ok"
      ? W.linkRead(calRow?.counts.past ?? null, calRow?.counts.coming ?? null)
      : cal.state === "unavailable"
        ? W.linkBroken
        : null;
  return {
    title: W.title(toolName),
    tool,
    toolName,
    found: toolName ? W.found(toolName, siteHostOf(i.website)) : null,
    says: toolName ? W.linkSays : W.byHandSays,
    link,
    how: toolName
      ? null
      : {
          label: W.how,
          options: [
            { key: "hand", label: W.byHand },
            { key: "site", label: W.bySite },
            { key: "message", label: W.byMessage },
          ],
          says: W.byHandSays,
        },
    clients: {
      label: W.clients,
      done:
        clientsRow && clientsRow.state === "done" && clientsRow.counts.people !== undefined
          ? W.clientsDone(clientsRow.counts.people, toolName)
          : null,
    },
    change: W.change,
  };
}

/** The clients' file sheet's head and steps: the tool's own where we know them, the general ones otherwise. */
function clientsOf(tool: BookingTool | null, toolName: string | null): FirstRunChannelsVM["clients"] {
  const W = FIRST_RUN_CHANNELS_WORDS.clients;
  const known = tool ? (CLIENT_EXPORTS[tool] ?? null) : null;
  return {
    heading: W.heading(toolName),
    steps: known ? [...known.steps] : W.steps(toolName),
    file: known?.file ?? null,
    noYes: W.noYes,
  };
}

/** The email tile: the mailbox connected, the providers this deployment connects, or not yet. */
function emailOf(i: ChannelsInput): FirstRunChannelsVM["email"] {
  const W = FIRST_RUN_CHANNELS_WORDS.email;
  const sending = i.dto.email?.sending ?? null;
  const on = sending?.mailboxes[0] ?? null;
  const providers = (sending?.providers ?? []).map((p) => ({ key: p, label: p === "google" ? W.google : W.microsoft }));
  // Google's consent screen, said before its Connect: the app is the Business Profile app (decision 0073, R18).
  const warning = sending?.providers.includes("google") ? googleAudienceWords(sending.google_audience) : null;
  return {
    title: W.title,
    state: on ? "connected" : providers.length ? "connect" : "soon",
    says: on ? W.connected(on.address) : providers.length ? `${W.says}${warning ? ` ${warning}` : ""}` : W.soonSays,
    providers: on ? [] : providers,
    note: W.notAnswered,
  };
}

/** Your dashboard, filling in: People, Inbox, Calendar and Reviews as what came in counts them. */
function fillingOf(i: ChannelsInput, rows: readonly ImportRowDto[]): FirstRunChannelsVM["filling"] {
  const W = FIRST_RUN_CHANNELS_WORDS.filling;
  const by = (s: ImportRowDto["source"]) => rows.find((r) => r.source === s) ?? null;
  const cal = by("calendar");
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const chats = by("whatsapp_history");
  const messages = (mail?.counts.messages ?? 0) + (chats?.counts.messages ?? 0);
  const lines = importLinesOf(rows, i.tz, { whatsappWaiting: i.whatsapp === "same" });
  return {
    title: W.title,
    rows: [
      { key: "people", label: W.people, sub: W.peopleSub, value: i.people ? i.people.toLocaleString() : "—" },
      { key: "inbox", label: W.inbox, sub: W.inboxSub, value: messages ? messages.toLocaleString() : "—" },
      {
        key: "calendar",
        label: W.calendar,
        sub: cal?.counts.past !== undefined ? `${W.calendarSub} · ${cal.counts.past} back` : W.calendarSub,
        value: cal?.counts.coming !== undefined ? String(cal.counts.coming) : "—",
      },
      {
        key: "reviews",
        label: W.reviews,
        sub: W.reviewsSub,
        value: reviews?.counts.reviews !== undefined ? reviews.counts.reviews.toLocaleString() : "—",
      },
    ],
    bringing: lines.of ? { done: lines.done, of: lines.of } : null,
  };
}

/** Where it answers, as the page draws it. */
export function firstRunChannelsOf(i: ChannelsInput): FirstRunChannelsVM {
  const rows = i.dto.imports ?? [];
  const bookings = bookingsOf(i);
  const email = emailOf(i);
  const whatsapp = whatsappOf(i);
  // What is on: calls (a choice the page can keep, or a line already on its way; none where no number can be had here),
  // WhatsApp chosen or connected, bookings read, the mailbox connected.
  const on = [
    i.phone.stage === "choose" ? !i.phone.held : i.vm.lineUnderway,
    !!whatsapp.connected || (!!whatsapp.value && whatsapp.value !== "later"),
    !!bookings.link && i.dto.calendar.state === "ok",
    email.state === "connected",
  ].filter(Boolean).length;
  return {
    whatsapp,
    bookings,
    clients: clientsOf(bookings.tool, bookings.toolName),
    email,
    filling: fillingOf(i, rows),
    foot: FIRST_RUN_CHANNELS_WORDS.on(on),
  };
}
