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
import { agoWords, spanLabel } from "./time";
import { CARRIER_WORDS, MODE_WORDS, forwardingTestOpen, type Carrier, type ForwardingMode } from "./forwarding";
import { listingLine, type SetupGoogleFacts } from "./google";

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
  /** The workspace's own lines, and whether this deployment can get one. */
  lines?: { rows: LineDto[]; ready: boolean; provider: string | null; costs: { local_number_month_usd: number } };
  /** The business on Google: whether it can be found here, and the listing once it is. */
  google?: SetupGoogleFacts;
}

/** A line as the page may see it — states in words, never a provider id. */
export interface LineDto {
  id: string;
  e164: string | null;
  kind: string;
  provider: string;
  area_code: number | null;
  voice_state: "none" | "provisioning" | "answering" | "failed";
  sms_state: string;
  whatsapp_state: string;
  port_state: string;
  forwarding_state: string;
  step: string | null;
  last_error: string | null;
  state_since: string;
  created_at: string;
  /** A forwarded line's facts, in words: the carrier, the mode, where the calls go, the test window. */
  forwarding?: { carrier: string; mode: string; destination_e164: string | null; test_from: string | null; test_until: string | null; verified_at: string | null } | null;
}

/** The saga's step, in the owner's words — the row, the bell and the platform email say the same thing. */
export const LINE_STEP_WORDS: Record<string, string> = {
  subaccount: "opening your account with the carrier",
  number: "buying the number",
  trunk: "connecting the number to the receptionist",
  agent: "creating the receptionist",
  import: "handing the number to the receptionist",
  channel: "recording the line",
};

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
  // A channel row without a number is still a channel: never read "null" aloud.
  const waNum = display(wa.number) ?? "your number";
  const voiceNum = display(voice.number) ?? "your line";
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

  // 3. A line for calls and texts — the product's own line when this deployment can get one; a person at Chanlytics otherwise.
  const lines = i.lines ?? { rows: [], ready: false, provider: null, costs: { local_number_month_usd: 1.15 } };
  const ownLine = lines.rows.find((l) => l.voice_state !== "none") ?? null;
  const lineNum = ownLine?.e164 ? display(ownLine.e164) ?? ownLine.e164 : "your number";
  if (voiceReady) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "ready", required: !answering, sentence: `Calls are answered on ${voiceNum}. Texting is not available yet.`, details: [ownLine?.voice_state === "answering" ? "Your own number through Chanlytics" : "", "Texting arrives with lines that register with the carriers; this page will say when"].filter(Boolean), verb: { label: "Open Integrations", to: "admin/integrations" } });
  } else if (voice.present) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: `Your line ${voice.number ? `${voiceNum} ` : ""}is switched off — the receptionist is not answering it.`, details: [], verb: { label: "Open Integrations", to: "admin/integrations" } });
  } else if (ownLine && ownLine.voice_state === "provisioning") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} — ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}, since ${agoWords(Date.parse(ownLine.state_since), nowMs)}.`, details: ["Usually a minute or two; this page updates by itself"], verb: null });
  } else if (ownLine && ownLine.voice_state === "failed") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Setting up ${lineNum} stopped while ${LINE_STEP_WORDS[ownLine.step ?? ""] ?? "working on it"}. A person at Chanlytics has it.`, details: ["Retry from here; we have been told"], verb: { label: "Retry", to: `verb:retry-line:${ownLine.id}` } });
  } else if (ownLine && ownLine.voice_state === "answering") {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `${lineNum} is set up — connecting it to the receptionist.`, details: [], verb: null });
  } else if (i.requests.line) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_them", required: !answering, sentence: `Requested ${agoWords(Date.parse(i.requests.line), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`, details: [], verb: null });
  } else if (lines.ready) {
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "Get a number for calls, or keep the one you have.", details: [`A local number is about $${lines.costs.local_number_month_usd.toFixed(2)} a month · your receptionist answers it · texting arrives when the carriers register it`], verb: { label: "Get a line", to: "verb:choose-line" } });
  } else {
    // Until lines provision themselves, the ask is the owner's move; from then on it is ours.
    row({ id: "line", icon: "phone", title: "A line for calls and texts", state: "waiting_you", required: !answering, sentence: "We set up your phone line with you.", details: ["A number, the receptionist answering it, and forwarding from the number you have"], verb: { label: "Ask for a line", to: "verb:request-line" } });
  }

  // 4. The phone receptionist — answering on the line, transferring to a person.
  if (voiceReady) {
    const last = voice.lastInboundAt ? `Last call ${agoWords(Date.parse(voice.lastInboundAt), nowMs)}` : "No calls yet";
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "ready", required: !answering, sentence: `Answering on ${voiceNum}.`, details: [handoffNum ? `Transfers to ${handoffNum} when a caller insists on a person` : "No hand-off number yet — callers who insist on a person are told someone will call back", last], verb: voice.number ? { label: "Call it", to: `tel:${voice.number}` } : null });
  } else if (voice.present) {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_you", required: !answering, sentence: "Switched off with the line.", details: [], verb: null });
  } else if (ownLine && (ownLine.voice_state === "provisioning" || ownLine.voice_state === "answering")) {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "Being created with your line — it answers the moment the line does.", details: [], verb: null });
  } else {
    row({ id: "receptionist", icon: "headphones", title: "Phone receptionist", state: "waiting_them", required: !answering, sentence: "The phone receptionist arrives with your line.", details: [], verb: null });
  }

  // 4b. The number you already have — forwarded to the receptionist's line, proven by a test call.
  {
    const fw = lines.rows.find((l) => l.kind === "forwarded") ?? null;
    const f = fw?.forwarding ?? null;
    const kept = fw?.e164 ? display(fw.e164) ?? fw.e164 : "your number";
    const dest = voiceReady && voice.number ? voiceNum : null;
    const how = f ? `${MODE_WORDS[f.mode as ForwardingMode] ?? "Forwarded"} · ${CARRIER_WORDS[f.carrier as Carrier] ?? "your carrier"}` : "";
    const title = "The number you already have";
    if (fw && f && fw.forwarding_state === "verified") {
      row({ id: "keep", icon: "refresh", title, state: "ready", required: false, sentence: `Calls to ${kept} reach your receptionist.`, details: [f.verified_at ? `Verified ${agoWords(Date.parse(f.verified_at), nowMs)}` : "Verified", how], verb: { label: "Change it", to: "verb:forwarding" } });
    } else if (fw && f && forwardingTestOpen(f, nowMs)) {
      row({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Testing — call ${kept} from another phone. This page updates by itself.`, details: [`Window open for ${spanLabel(Date.parse(f.test_until ?? "") - nowMs)}`], verb: { label: "Show the code", to: "verb:forwarding" } });
    } else if (fw && f) {
      row({ id: "keep", icon: "refresh", title, state: "waiting_you", required: false, sentence: `Dial the code on the phone with ${kept}, then test it.`, details: [how], verb: { label: "Test it", to: `verb:forwarding-test:${fw.id}` } });
    } else if (!dest) {
      row({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: "Once your receptionist has a line, keep the number customers know by forwarding its calls to it.", details: [], verb: null });
    } else {
      row({ id: "keep", icon: "refresh", title, state: "not_started", required: false, sentence: `Keep the number your customers know: forward its calls to ${dest}.`, details: ["You keep your phone, your carrier and your texts"], verb: { label: "Set up forwarding", to: "verb:forwarding" } });
    }
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
    row({ id: "whatsapp", icon: "chat", title: "WhatsApp", state: "waiting_you", required: !answering, sentence: `${waNum ?? "Your number"} is connected but switched off.`, details: [], verb: { label: "Open Integrations", to: "admin/integrations" } });
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

  // 9. Your Google listing — public, found from the facts above; new reviews reach the bell and Reports.
  // Absent until this deployment can look listings up: a row must never draw a verb that cannot work.
  if (i.google?.ready) {
    const g = i.google.listing;
    const title = "Your Google listing";
    if (g && g.check_error) {
      row({ id: "google", icon: "star", title, state: "waiting_them", stateWords: "Waiting on Google", required: false, sentence: `${g.name} is on record, but Google could not be read${g.checked_at ? ` since ${agoWords(Date.parse(g.checked_at), nowMs)}` : " yet"} — it is tried again every hour.`, details: [], verb: { label: "Open Reports", to: "reports" } });
    } else if (g) {
      row({ id: "google", icon: "star", title, state: "ready", required: false, sentence: `${listingLine(g)}.`, details: [g.checked_at ? `Checked ${agoWords(Date.parse(g.checked_at), nowMs)}` : "Not read yet", "New reviews reach your bell and Reports"], verb: { label: "Open Reports", to: "reports" } });
    } else {
      row({ id: "google", icon: "star", title, state: "not_started", required: false, sentence: "Find your business on Google so new reviews reach you here.", details: [i.business.address ? "Uses the name and address on record" : "Add your address in Workspace for a surer match"], verb: { label: "Find it", to: "verb:google-find" } });
    }
  }

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
