import { numberHealth } from "../broadcasts/broadcasts.js";
import { PHONE_LINE_OFF } from "../lines/caller-gets.js";
import { channelFor } from "../lines/channels.js";
import { codeNotes } from "../lines/line-codes.js";
import { standingNotes, standingRow } from "../lines/number-standing.js";
import { whatsappCostNotes } from "../lines/whatsapp-cost.js";
import { tryItNotes } from "../lines/whatsapp-try-it.js";
import { SETUP_STATE_WORDS, textingWords, SOLE_PROP_CEILING_SENTENCE, TEXTING_NEEDS_RECORD_SENTENCE } from "./setup.js";
import { ownLineStandOf } from "./setup-rows-phone.js";
import { agoWords, HOUR_MS } from "../shared/time.js";
import { checkedWords, connectionWords, listingLine } from "../google/google.js";
import { formatPhoneDisplay } from "../shared/phone.js";
import { bookingToolName } from "../calendar/booking-notice.js";
import { calendarSourceFacts, calendarSourceOf } from "./calendar-source.js";
import { EMAIL_NOT_ANSWERED_SENTENCE } from "../email/mailbox.js";
import { firstRunStepRoute, FIRST_RUN_FIND_ROUTE } from "./first-run.js";
export const CONNECTION_KINDS = [
  "whatsapp",
  "phone",
  "sms",
  "google_profile",
  "google_listing",
  "calendar",
  "instagram",
  "email",
  "deposits"
];
const TONE = {
  connected: "ok",
  attention: "warn",
  // A line that is off is drawn in the tone its standing value gives (lines/caller-gets.ts), here and wherever it is told.
  off: PHONE_LINE_OFF.tone,
  waiting_you: "info",
  waiting_them: "info",
  none: "plain",
  later: "plain"
};
const GROUP = {
  connected: "connected",
  attention: "connected",
  off: "connected",
  waiting_you: "available",
  waiting_them: "available",
  none: "available",
  later: "later"
};
const ORDER = {
  whatsapp: 0,
  phone: 1,
  sms: 2,
  google_profile: 3,
  google_listing: 4,
  calendar: 5,
  instagram: 6,
  email: 7,
  deposits: 8
};
function row(d) {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null, notes: d.notes ?? [] };
}
export function googleAudienceWords(a) {
  if (a === "testing")
    return "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.";
  if (a === "unverified")
    return "Google shows a warning until its review of Chanlytics is done \u2014 choose Advanced, then Go to Chanlytics.";
  return null;
}
export function smsStateRow(line, nowMs) {
  const num = line ? formatPhoneDisplay(line.e164) : null;
  const since = line ? agoWords(Date.parse(line.state_since), nowMs) : null;
  const base = { kind: "sms", icon: "chat", title: "Texting", detail: num, verb: null };
  const ready = line?.voice_state === "answering";
  if (ready && (!line?.sms_state || line.sms_state === "none")) {
    return {
      ...base,
      state: "waiting_you",
      stateWords: SETUP_STATE_WORDS.waiting_you,
      sentence: TEXTING_NEEDS_RECORD_SENTENCE,
      verb: { label: "Fill it in", to: "verb:business-record", who: "owner" },
      body: "business_record"
    };
  }
  if (line?.reg_mock) {
    return {
      ...base,
      state: "attention",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: textingWords(line).sentence
    };
  }
  switch (line?.sms_state) {
    case "active":
      return {
        ...base,
        state: "connected",
        stateWords: "On",
        sentence: line?.reg_sole_prop ? `Customers text ${num ?? "this number"} and the receptionist answers inside your hours. ${SOLE_PROP_CEILING_SENTENCE}` : `Customers text ${num ?? "this number"}; the receptionist answers inside your hours.`
      };
    case "approved":
      return {
        ...base,
        state: "waiting_them",
        stateWords: "Waiting on carriers",
        sentence: `Your business is approved. One last check on the line is with the carriers \u2014 usually days, and texting switches itself on${since ? `; approved ${since}` : ""}.`
      };
    case "needs_record":
      return line?.last_error ? {
        ...base,
        state: "waiting_you",
        stateWords: SETUP_STATE_WORDS.waiting_you,
        sentence: line.last_error,
        verb: { label: "Open the record", to: "verb:business-record", who: "owner" },
        body: "business_record"
      } : {
        ...base,
        state: "waiting_you",
        stateWords: SETUP_STATE_WORDS.waiting_you,
        sentence: TEXTING_NEEDS_RECORD_SENTENCE,
        verb: { label: "Fill it in", to: "verb:business-record", who: "owner" },
        body: "business_record"
      };
    case "otp_waiting":
      return {
        ...base,
        state: "waiting_you",
        stateWords: SETUP_STATE_WORDS.waiting_you,
        sentence: "The carriers texted your mobile \u2014 reply to that message from the handset itself and texting switches on. There is nothing to type here. The code lasts a day; if it runs out, Chanlytics asks the carriers for another."
      };
    case "registering":
    case "hosting":
      return {
        ...base,
        state: "waiting_them",
        stateWords: "Waiting on carriers",
        sentence: `The carriers are registering your line, since ${since} \xB7 usually a week.`
      };
    case "rejected":
      return {
        ...base,
        state: "attention",
        stateWords: "Sent back",
        sentence: `The carriers sent the registration back${line?.last_error ? `: ${line.last_error}` : ""}. Correct what they named and Chanlytics sends it again \u2014 resubmitting is ours to do, and it costs nothing.`,
        verb: { label: "Open the record", to: "verb:business-record", who: "owner" },
        body: "business_record"
      };
    case "failed":
      return {
        ...base,
        state: "attention",
        stateWords: SETUP_STATE_WORDS.waiting_them,
        sentence: line?.last_error || "Registering stopped. A person at Chanlytics has it."
      };
    default:
      return {
        ...base,
        state: "later",
        stateWords: "Later",
        sentence: "Plain text messages \u2014 arrives with a line that registers with the carriers; this page will say when."
      };
  }
}
function connectionFactsOf(i, nowMs) {
  const channel = (kind) => channelFor(i.channels, kind);
  return {
    nowMs,
    wa: channel("whatsapp"),
    voice: channel("voice"),
    own: i.lines.rows.find((l) => l.provider !== "carrier") ?? null,
    connection: i.google?.connection ?? null,
    listing: i.google?.listing ?? null
  };
}
const KEEP_SIGNUP_PAGE_OPEN = "Keep this page open until Meta's window closes.";
function signupCodeNote(own) {
  const line = own?.e164 ? formatPhoneDisplay(own.e164) : null;
  return {
    text: line ? `Meta texts a code to the number. If it is your Chanlytics number, ${line}, the code shows here on the Texting row: choose Text message, not Phone call. ${KEEP_SIGNUP_PAGE_OPEN}` : `Meta texts a code to the number: have its phone at hand. ${KEEP_SIGNUP_PAGE_OPEN}`
  };
}
function whatsappConnectNotes(own) {
  return [
    { text: "Meta asks you to sign in with Facebook and choose or create your business." },
    signupCodeNote(own),
    ...whatsappCostNotes()
  ];
}
const SIGNUP_LEFT_OPEN_WITHIN_MS = HOUR_MS;
const SIGNUP_LEFT_OPEN_NOTE = "A WhatsApp sign-up was started here and did not come back to Chanlytics \u2014 if you finished it in Meta's window, press Connect WhatsApp again and choose the WhatsApp account Meta already made.";
function signupLeftOpenNotes(startedAt, nowMs) {
  const age = startedAt ? nowMs - Date.parse(startedAt) : Number.NaN;
  return age >= 0 && age < SIGNUP_LEFT_OPEN_WITHIN_MS ? [{ text: SIGNUP_LEFT_OPEN_NOTE, live: true }] : [];
}
const LIBRARY = { label: "Messages", to: "messages", who: "operator" };
function whatsappNumberRow(base, wa, nowMs) {
  const row2 = { ...base, detail: wa.number };
  if (!wa.on) return { ...row2, state: "off", stateWords: "Off", sentence: wa.healthLabel, verb: LIBRARY };
  const limit = wa.messagingLimit ?? wa.standing?.limit ?? null;
  const standing = wa.standing && { ...wa.standing, limit };
  if (standing) {
    const stood = standingRow(standing);
    if (stood)
      return {
        ...row2,
        state: "attention",
        stateWords: stood.stateWords,
        sentence: stood.sentence,
        verb: stood.act ? { label: stood.act.label, to: stood.act.href, href: stood.act.href, who: "owner" } : null,
        // A number Meta lets send still answers the customer who writes first while it waits on its owner's card (Meta
        // holds back only what the business starts), and a new account waits so the moment it connects: the way to try it
        // is said here too. A BLOCKED number answers nobody, so it is not one to try (standingRow says the same of it).
        notes: [
          ...standing.can_send === "BLOCKED" ? [] : tryItNotes(wa, nowMs),
          ...standingNotes(standing, { limitSaid: false })
        ]
      };
  }
  const h = numberHealth({ quality: wa.quality, event: wa.qualityEvent, limit });
  const flagged = h.tone === "danger";
  const health = h.tone !== "unknown" ? ` \xB7 ${h.label}` : "";
  return {
    ...row2,
    state: flagged ? "attention" : "connected",
    stateWords: flagged ? "Needs attention" : "On",
    sentence: `${wa.healthLabel}${health}`,
    verb: LIBRARY,
    // How to try it from a phone, first, on a row nobody has written to yet; then what Meta holds that the owner can act on.
    notes: [
      ...flagged ? [] : tryItNotes(wa, nowMs),
      ...standingNotes(standing, { limitSaid: h.tone !== "unknown" && h.limitPerDay !== null })
    ]
  };
}
function whatsappRow(i, { wa, own, nowMs }) {
  const base = { kind: "whatsapp", icon: "chat", title: "WhatsApp Business" };
  if (wa) return whatsappNumberRow(base, wa, nowMs);
  if (i.whatsapp === void 0) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Checking whether Chanlytics can connect a number\u2026",
      verb: null
    };
  }
  if (i.whatsapp?.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Sign in to Meta, pick the number, and the receptionist answers on it. Nothing here touches a phone line.",
      verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" },
      notes: [...signupLeftOpenNotes(i.signupLeftOpenAt, nowMs), ...whatsappConnectNotes(own)]
    };
  }
  const why = i.whatsapp?.reason === "no_config_id" ? " \u2014 the Embedded Signup configuration is missing on the Chanlytics side" : i.whatsapp?.reason === "preview" ? " \u2014 only on the production dashboard" : "";
  return {
    ...base,
    detail: null,
    state: "none",
    stateWords: "Not connected",
    sentence: `Chanlytics isn't set up to connect numbers yet${why}.`,
    verb: null
  };
}
function phoneRow(i, { voice, own, nowMs }) {
  const base = { kind: "phone", icon: "phone", title: "Phone line" };
  if (voice) {
    return {
      ...base,
      detail: voice.number,
      state: voice.on ? "connected" : "off",
      stateWords: voice.on ? "On" : "Off",
      sentence: voice.healthLabel,
      verb: null
    };
  }
  const stand = own ? ownLineStandOf(own, nowMs, null) : null;
  if (own && stand && stand.kind !== "connecting") {
    return {
      ...base,
      detail: formatPhoneDisplay(own.e164),
      state: "waiting_them",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: [stand.sentence, ...stand.details.slice(0, 1).map((d) => `${d}.`)].join(" "),
      verb: stand.retry ? { label: "Retry", to: stand.retry, who: "owner" } : null
    };
  }
  if (i.lineRequestedAt) {
    return {
      ...base,
      detail: null,
      state: "waiting_them",
      stateWords: SETUP_STATE_WORDS.waiting_them,
      sentence: `Requested ${agoWords(Date.parse(i.lineRequestedAt), nowMs)} \u2014 a person at Chanlytics will set up your line with you and reach you by email.`,
      verb: null
    };
  }
  if (i.lines.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: "Get a number the receptionist answers, or keep the one you have.",
      verb: { label: "Get a line", to: firstRunStepRoute("phone"), who: "owner" }
    };
  }
  return {
    ...base,
    detail: null,
    state: "none",
    stateWords: "Not connected",
    sentence: "We set up your phone line with you.",
    verb: { label: "Ask for a line", to: firstRunStepRoute("phone"), who: "owner" }
  };
}
function smsRow(i, { own, nowMs }) {
  return { ...smsStateRow(own, nowMs), notes: own ? codeNotes(i.codes ?? [], nowMs) : [] };
}
function googleProfileRow(i, { connection: c, nowMs }) {
  const g = i.google;
  const base = { kind: "google_profile", icon: "shield", title: "Google Business Profile" };
  if (c && c.location_name) {
    return {
      ...base,
      detail: c.location_title,
      state: c.sync_error ? "attention" : "connected",
      stateWords: c.sync_error ? "Could not sync" : "Connected",
      sentence: connectionWords(c, nowMs),
      verb: { label: "Disconnect", to: "verb:google-disconnect", who: "owner" }
    };
  }
  if (c) {
    return {
      ...base,
      detail: null,
      state: "waiting_you",
      stateWords: SETUP_STATE_WORDS.waiting_you,
      sentence: `${connectionWords(c, nowMs)}.`,
      verb: null,
      body: "google_choose"
    };
  }
  if (g?.ready.profile) {
    const note = googleAudienceWords(g.ready.audience);
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not connected",
      sentence: `Sign in to Google once; every review and the right to answer them follow.${note ? ` ${note}` : ""}`,
      verb: { label: "Connect Google", to: "verb:google-connect", who: "owner" }
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Every review and the replies you send from Reports arrive with the Business Profile connection.",
    verb: null
  };
}
function googleListingRow(i, { connection: c, listing: l, nowMs }) {
  const g = i.google;
  const base = { kind: "google_listing", icon: "star", title: "Your listing on Google" };
  if (l) {
    return {
      ...base,
      detail: l.address,
      state: l.check_error ? "attention" : "connected",
      stateWords: l.check_error ? "Could not be read" : "Watched",
      sentence: `${listingLine(l)} \xB7 ${checkedWords(l, nowMs)}`,
      verb: { label: c && c.location_name ? "Sync now" : "Check now", to: "verb:google-check", who: "operator" }
    };
  }
  if (g?.ready.places) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not watched",
      sentence: "Find it from the name and address on record; new reviews then reach your bell and Reports.",
      verb: { label: "Find it", to: FIRST_RUN_FIND_ROUTE, who: "owner" }
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Your public listing on Google Maps, read once a day for new reviews.",
    verb: null
  };
}
function calendarRow(i) {
  const s = calendarSourceOf(calendarSourceFacts(i.calendar ?? { state: "none" }));
  const tool = bookingToolName(i.calendar?.tool);
  const DETAIL = { both: `${tool} \xB7 calendar link`, link: "Calendar link", emails: tool, hand: null, nothing: null };
  const detail = DETAIL[s.by];
  return {
    kind: "calendar",
    icon: "calendar",
    title: "Calendar",
    detail,
    state: CONNECTION_STATE_OF[s.state],
    stateWords: s.words,
    sentence: s.sentence,
    // Opening the board is anyone's who may read it; the row in Settings is the owner's to change.
    verb: { ...s.next, who: s.next.to === "calendar" ? "operator" : "owner" }
  };
}
const CONNECTION_STATE_OF = {
  ready: "connected",
  attention: "attention",
  needs_you: "waiting_you",
  waiting: "waiting_them",
  hand: "none",
  none: "none"
};
function instagramRow() {
  return {
    kind: "instagram",
    icon: "instagram",
    title: "Instagram",
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Direct messages, answered by the receptionist like WhatsApp.",
    verb: null
  };
}
function emailRow(i, { nowMs }) {
  const base = { kind: "email", icon: "mail", title: "Email" };
  const mailbox = i.email?.mailbox ?? null;
  if (mailbox) {
    const last = mailbox.last_received_at ? ` Last email ${agoWords(Date.parse(mailbox.last_received_at), nowMs)}.` : "";
    const working = `Customers write to this address and you reply from the Inbox, as ${mailbox.from_name}.${last}`;
    const needs = (i.email?.sending?.mailboxes ?? []).filter(
      (m) => m.state === "held" || m.state === "reconnect"
    ).length;
    return {
      ...base,
      detail: mailbox.address,
      state: mailbox.last_error || needs ? "attention" : "connected",
      stateWords: mailbox.last_error ? SETUP_STATE_WORDS.waiting_them : needs ? `On \xB7 ${needs} mailbox${needs === 1 ? "" : "es"} to look at` : "On",
      sentence: mailbox.last_error ? `${mailbox.last_error} ${working}` : working,
      verb: { label: "Change the name", to: "verb:email-setup", who: "owner" },
      body: "email_setup"
    };
  }
  if (i.email?.ready) {
    return {
      ...base,
      detail: null,
      state: "none",
      stateWords: "Not set up",
      sentence: `Give customers an address to write to. ${EMAIL_NOT_ANSWERED_SENTENCE}`,
      verb: { label: "Choose the address", to: "verb:email-setup", who: "owner" },
      body: "email_setup"
    };
  }
  return {
    ...base,
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "An address customers write to, answered from your Inbox.",
    verb: null
  };
}
function depositsRow() {
  return {
    kind: "deposits",
    icon: "money",
    title: "Deposits",
    detail: null,
    state: "later",
    stateWords: "Later",
    sentence: "Deposits and payments taken by the receptionist.",
    verb: null
  };
}
const ROW_BUILDERS = [
  whatsappRow,
  phoneRow,
  smsRow,
  googleProfileRow,
  googleListingRow,
  calendarRow,
  instagramRow,
  emailRow,
  depositsRow
];
export function connectionRows(i, nowMs = Date.now()) {
  const facts = connectionFactsOf(i, nowMs);
  return ROW_BUILDERS.map((build) => row(build(i, facts))).sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}
export const CONNECTION_GROUP_WORDS = {
  connected: {
    title: "Connected",
    sub: (rows) => {
      const bad = rows.filter((r) => r.state !== "connected").length;
      return `${rows.length} connected${bad ? ` \xB7 ${bad} need${bad === 1 ? "s" : ""} attention` : ""}`;
    }
  },
  available: {
    title: "Available",
    sub: (rows) => rows.some((r) => r.state === "waiting_you") ? "something here waits on you" : rows.some((r) => r.state === "waiting_them") ? "in progress" : "ready when you are"
  },
  later: { title: "Later", sub: () => "not yet: nothing here is connected" }
};
