/**
 * Setup — one page a new owner lands on until the receptionist is answering.
 *
 * Every row here is read from the workspace: the config, the channels, the
 * templates, the calendar feed, the team, the consent rows. Nothing stores a
 * "done" flag; a row is ready because the thing it names exists. "Later" is
 * a preference on one device that hides an optional row from Today's line,
 * and nothing else.
 *
 * Four words for every state, so the page reads the same way People and
 * Today do: Not started · Waiting on you · Waiting on carriers (or Meta, or
 * us) · Ready. "Waiting on us" is real: a line is set up by a person at
 * Chanlytics until lines provision themselves (plan, step 3).
 */
import { formatPhoneDisplay } from "./phone";
import { agoWords } from "./time";

export interface SetupDto {
  business: {
    name: string | null;
    hours: boolean;
    services: number;
    bookingLink: boolean;
    address: boolean;
    /** The number the phone receptionist warm-transfers to, E.164. */
    handoff: string | null;
    /** The config row exists but the parser refused it. */
    broken: boolean;
  };
  channels: {
    whatsapp: { present: boolean; active: boolean; number: string | null; quality: string | null; lastInboundAt: string | null };
    voice: { present: boolean; active: boolean; number: string | null; lastInboundAt: string | null };
  };
  templates: { approved: number; pending: number; startersApproved: number };
  calendar: { state: "ok" | "unavailable" | "none" };
  team: { members: number; invitesOpen: number; alertEmails: number };
  consent: { yes: number };
  /** What the owner has asked a person at Chanlytics for, and when. */
  requests: { line: string | null };
}

export interface SetupInputs extends SetupDto {
  /** Row ids marked Later on this device. */
  later: string[];
}

export type SetupState = "not_started" | "waiting_you" | "waiting_them" | "ready";

export const SETUP_STATE_WORDS: Record<SetupState, string> = {
  not_started: "Not started",
  waiting_you: "Waiting on you",
  waiting_them: "Waiting on us",
  ready: "Ready",
};

/** A verb whose `to` starts with "verb:" is an action the page performs; "tel:" dials; anything else is a route. */
export interface SetupVerb {
  label: string;
  to: string;
}

export interface SetupRowVM {
  id: string;
  icon: string;
  title: string;
  state: SetupState;
  /** The state in words; "Waiting on Meta" when Meta is the one waited on. */
  stateWords: string;
  sentence: string;
  details: string[];
  verb: SetupVerb | null;
  /** Counts toward "answering"; cannot be put off for later. */
  required: boolean;
  later: boolean;
}

export interface SetupVM {
  rows: SetupRowVM[];
  readiness: { answering: boolean; sentence: string };
  /** The first open row's verb, in dependency order. */
  next: { label: string; to: string; row: string; title: string } | null;
  done: number;
  total: number;
  /** Today's one line while something is open: "Setup · 3 of 8 · Calendar: paste the feed". */
  line: string | null;
  /** The numbers to try, once the receptionist answers somewhere. */
  tryIt: { voice: string | null; voiceLabel: string | null; whatsapp: string | null; whatsappLabel: string | null } | null;
}

const display = (e164: string | null | undefined): string | null => (e164 ? formatPhoneDisplay(e164) : null);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export function setupSteps(i: SetupInputs, nowMs = Date.now()): SetupVM {
  const later = new Set(i.later ?? []);
  const wa = i.channels.whatsapp;
  const voice = i.channels.voice;
  const waReady = wa.present && wa.active;
  const voiceReady = voice.present && voice.active;
  const answering = waReady || voiceReady;
  const waNum = display(wa.number);
  const voiceNum = display(voice.number);
  const handoffNum = display(i.business.handoff);

  const rows: SetupRowVM[] = [];
  const row = (r: Omit<SetupRowVM, "later" | "stateWords"> & { stateWords?: string }) =>
    rows.push({ ...r, stateWords: r.stateWords ?? SETUP_STATE_WORDS[r.state], later: !r.required && later.has(r.id) });

  // 1. Business facts — what the receptionist answers with.
  {
    const b = i.business;
    const missing = [!b.name ? "a name" : "", !b.hours ? "hours" : "", b.services === 0 ? "services" : ""].filter(Boolean);
    if (b.broken) {
      row({ id: "facts", icon: "home", title: "Business facts", state: "waiting_you", required: true, sentence: "Your settings could not be read. Open Workspace to repair them before anything else.", details: [], verb: { label: "Open Workspace", to: "admin/workspace" } });
    } else if (missing.length === 0) {
      row({ id: "facts", icon: "home", title: "Business facts", state: "ready", required: true, sentence: `${b.name} · hours set · ${plural(b.services, "service")} on record`, details: [b.bookingLink ? "Booking link on record" : "No booking link — the receptionist answers, but cannot send one", b.address ? "Address on record" : "No address yet"], verb: { label: "Edit in Workspace", to: "admin/workspace" } });
    } else {
      const none = missing.length === 3;
      row({ id: "facts", icon: "home", title: "Business facts", state: none ? "not_started" : "waiting_you", required: true, sentence: none ? "Name, hours and services are what the receptionist answers with." : `Still missing: ${missing.join(" and ")}.`, details: [], verb: { label: none ? "Start in Workspace" : "Finish in Workspace", to: "admin/workspace" } });
    }
  }

  // 2. A person to hand off to — the warm transfer the voice shell already makes.
  row(handoffNum
    ? { id: "handoff", icon: "phone", title: "A person to hand off to", state: "ready", required: false, sentence: `Callers who insist on a person are transferred to ${handoffNum}.`, details: [], verb: { label: "Change it", to: "admin/workspace" } }
    : { id: "handoff", icon: "phone", title: "A person to hand off to", state: "waiting_you", required: false, sentence: "Give the receptionist a number to hand callers to when they insist on a person.", details: [], verb: { label: "Add a number", to: "admin/workspace" } });

  // 3. A line for calls and texts — until lines provision themselves, a person at Chanlytics sets it up.
  if (voiceReady) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "ready", required: !answering, sentence: `Calls are answered on ${voiceNum}. Texting is not available yet.`, details: ["Texting arrives with lines that register with the carriers; this page will say when"], verb: { label: "Open Integrations", to: "admin/integrations" } });
  } else if (voice.present) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Your line ${voiceNum ? `${voiceNum} ` : ""}is set up but not active — a person at Chanlytics is on it.`, details: [], verb: null });
  } else if (i.requests.line) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`, details: [], verb: null });
  } else {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: "We set up your phone line with you: a number, the receptionist answering it, and forwarding from the number you have.", details: [], verb: { label: "Ask for a line", to: "verb:request-line" } });
  }

  // 4. The phone receptionist — answering on the line, transferring to a person.
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "ready", required: !answering, sentence: `Answering on ${voiceNum}.`, details: [handoffNum ? `Transfers to ${handoffNum} when a caller insists on a person` : "No hand-off number yet — callers who insist on a person are told someone will call back", last], verb: voice.number ? { label: "Call it", to: `tel:${voice.number}` } : null });
  } else {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "The phone receptionist arrives with your line.", details: [], verb: null });
  }

  // 5. WhatsApp — the number customers write to, and the messages Meta approved.
  if (waReady) {
    const t = i.templates;
    const metaWaits = t.approved === 0 && t.pending > 0;
    const details = [
      wa.quality ? `Quality ${wa.quality.toLowerCase()}` : "",
      t.approved ? `${plural(t.approved, "approved message")}` : t.pending ? `${plural(t.pending, "message")} with Meta for approval` : "No approved messages yet",
      t.startersApproved < 5 ? "Add the starter messages: welcome, win-back, the month's offer" : "",
      wa.lastInboundAt ? `Last message ${agoWords(Date.parse(wa.lastInboundAt), nowMs)}` : "",
    ].filter(Boolean);
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: metaWaits ? "waiting_them" : "ready", stateWords: metaWaits ? "Waiting on Meta" : undefined, required: !answering, sentence: metaWaits ? `Connected on ${waNum} — your first messages are with Meta for approval.` : `Connected on ${waNum}.`, details, verb: t.startersApproved < 5 && !metaWaits ? { label: "Add the starters", to: "outbound" } : { label: "Open the Inbox", to: "inbox" } });
  } else if (wa.present) {
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_them", stateWords: "Waiting on Meta", required: !answering, sentence: `${waNum ?? "Your number"} is connected but not active yet.`, details: [], verb: { label: "Open Integrations", to: "admin/integrations" } });
  } else {
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: "Connect the WhatsApp number customers write to.", details: ["A new number, or the WhatsApp Business app you already use"], verb: { label: "Connect", to: "admin/integrations" } });
  }

  // 6. Calendar — what is taken, so the receptionist offers real times.
  row(i.calendar.state === "ok"
    ? { id: "calendar", icon: "calendar", title: "Calendar", state: "ready", required: false, sentence: "Readable — the receptionist offers times from it.", details: [], verb: { label: "Open Calendar", to: "calendar" } }
    : i.calendar.state === "unavailable"
      ? { id: "calendar", icon: "calendar", title: "Calendar", state: "waiting_you", required: false, sentence: "Your calendar could not be read. Check the address in Workspace.", details: [], verb: { label: "Check the feed", to: "admin/workspace" } }
      : { id: "calendar", icon: "calendar", title: "Calendar", state: "not_started", required: false, sentence: "Paste your calendar's iCal address so the receptionist knows what is taken.", details: [], verb: { label: "Paste the feed", to: "admin/workspace" } });

  // 7. Team and alerts — someone else who answers, and where alerts go.
  {
    const t = i.team;
    const people = t.members > 1 || t.invitesOpen > 0;
    const who = `${plural(t.members, "person", "people")}${t.invitesOpen ? ` · ${plural(t.invitesOpen, "invite")} open` : ""}`;
    const alerts = t.alertEmails ? `alerts go to ${plural(t.alertEmails, "address", "addresses")}` : "no alert address yet";
    row({
      id: "team", icon: "users", title: "Team and alerts",
      state: people && t.alertEmails ? "ready" : !people && !t.alertEmails ? "not_started" : "waiting_you",
      required: false,
      sentence: people ? `${who} · ${alerts}.` : `Only you so far · ${alerts}.`,
      details: people ? [] : ["Invite someone who answers when you can't"],
      verb: !t.alertEmails ? { label: "Set alerts", to: "admin/notifications" } : !people ? { label: "Invite", to: "admin/workspace" } : { label: "Open Team", to: "admin/workspace" },
    });
  }

  // 8. The first yes — the only way onto a broadcast.
  row(i.consent.yes > 0
    ? { id: "yes", icon: "tag", title: "The first yes", state: "ready", required: false, sentence: `${plural(i.consent.yes, "person", "people")} said yes to offers.`, details: [], verb: { label: "Open Broadcasts", to: "broadcasts" } }
    : { id: "yes", icon: "tag", title: "The first yes", state: "not_started", required: false, sentence: "Nobody has said yes to offers yet. The keyword and the QR are on Broadcasts.", details: [], verb: { label: "Get their yes", to: "broadcasts" } });

  const open = rows.filter((r) => r.state !== "ready" && !r.later);
  const nextRow = open.find((r) => r.verb) ?? null;
  const next = nextRow && nextRow.verb ? { label: nextRow.verb.label, to: nextRow.verb.to, row: nextRow.id, title: nextRow.title } : null;
  const done = rows.filter((r) => r.state === "ready").length;
  const sentence = waReady && voiceReady
    ? `Your receptionist answers calls on ${voiceNum} and WhatsApp on ${waNum}. Texting is not available yet.`
    : voiceReady
      ? `Your receptionist answers calls on ${voiceNum}. WhatsApp is not connected. Texting is not available yet.`
      : waReady
        ? `Your receptionist answers WhatsApp on ${waNum}. No phone line yet.`
        : "Your receptionist is not answering yet.";
  return {
    rows,
    readiness: { answering, sentence },
    next,
    done,
    total: rows.length,
    line: next ? `Setup · ${done} of ${rows.length} · ${next.title}: ${next.label.toLowerCase()}` : null,
    tryIt: answering
      ? { voice: voiceReady ? voice.number : null, voiceLabel: voiceReady ? voiceNum : null, whatsapp: waReady ? wa.number : null, whatsappLabel: waReady ? waNum : null }
      : null,
  };
}

/** The hash route without "#/": "#/admin/setup" → "admin/setup"; nothing → "today". */
export function setupRoute(hash: string): string {
  return (hash || "#/today").replace(/^#\/?/, "");
}

/**
 * Whether this arrival lands on Setup: an owner, a receptionist that answers
 * nowhere yet, a plain arrival (Today or nothing), and not already sent
 * there this session. Everyone else gets Today.
 */
export function shouldLandOnSetup(role: string | null | undefined, answering: boolean, route: string, landed: boolean): boolean {
  if (landed || role !== "owner" || answering) return false;
  return route === "" || route === "today";
}
