/**
 * Connections — everything a workspace can be joined to, as one row shape.
 *
 * The Integrations page used to be three hand-built cards and a paragraph
 * of names "not yet". Every connection is the same question asked of the
 * same facts: can this deployment do it at all, where does this workspace
 * stand with it, what is the one sentence, what is the one verb, since
 * when. So every connection is one row, and "later" is a state a row can
 * be in rather than a list at the bottom. Setup says what to do next;
 * this says what is joined. Both derive from the same facts and cannot
 * disagree. Pure: the page feeds it window globals, the tests fixtures.
 */
import type { Tone } from "./tone";
import { numberHealth } from "./broadcasts";
import { channelFor, type ChannelVM } from "./channels";
import type { GoogleListingDto, GoogleConnectionDto, GoogleAudience } from "./google";
import type { LineDto } from "./setup";
import { LINE_STEP_WORDS, textingWords, SOLE_PROP_CEILING_SENTENCE, TEXTING_NEEDS_RECORD_SENTENCE } from "./setup";
import { agoWords } from "./time";
import { checkedWords, connectionWords, listingLine } from "./google";
import { formatPhoneDisplay } from "./phone";

export type ConnectionKind = "whatsapp" | "phone" | "sms" | "google_listing" | "google_profile" | "calendar" | "instagram" | "email" | "deposits";
export const CONNECTION_KINDS: readonly ConnectionKind[] = ["whatsapp", "phone", "sms", "google_profile", "google_listing", "calendar", "instagram", "email", "deposits"];

/** Where the row sits: joined, joinable from here, or not built yet. */
export type ConnectionGroup = "connected" | "available" | "later";
/** Where this workspace stands with it. `attention` is joined but not working. */
export type ConnectionState = "connected" | "attention" | "off" | "waiting_you" | "waiting_them" | "none" | "later";
/** One of the product's six tones (tone.ts): a channel that waits on someone is "in progress", not "live". */
export type ConnectionTone = Tone;
/** Who may press the verb: an owner (team-level), or anyone who may approve (operators and owners). */
export type ConnectionWho = "owner" | "operator";

export interface ConnectionVerb {
  label: string;
  /** A route ("admin/setup", "messages") or a `verb:` id the page runs. */
  to: string;
  who: ConnectionWho;
}

export interface ConnectionRow {
  kind: ConnectionKind;
  icon: string;
  title: string;
  /** The number, the account, the listing's address — what makes this row this workspace's. */
  detail: string | null;
  group: ConnectionGroup;
  state: ConnectionState;
  stateWords: string;
  tone: ConnectionTone;
  /** One line, in the owner's words, with "since" on every wait. */
  sentence: string;
  verb: ConnectionVerb | null;
  /** The page's own hook for the parts a row cannot say in one line: a choice of locations, a form. */
  body: "google_choose" | "business_record" | null;
}

export interface ConnectionInputs {
  /** The rows of tenant_channels as the page already shows them. */
  channels: ChannelVM[];
  /** Meta's Embedded Signup: whether this deployment can start it. `undefined` = still asking. */
  whatsapp: { ready: boolean; reason: string | null } | null | undefined;
  lines: { rows: LineDto[]; ready: boolean };
  /** When the owner asked a person at Chanlytics for a line; null = never. */
  lineRequestedAt: string | null;
  google: {
    ready: { places: boolean; profile: boolean; audience?: GoogleAudience | null };
    listing: GoogleListingDto | null;
    connection: GoogleConnectionDto | null;
  } | null;
  calendar: { state: "ok" | "unavailable" | "none" } | null;
}

const TONE: Record<ConnectionState, ConnectionTone> = {
  connected: "ok", attention: "warn", off: "warn", waiting_you: "info", waiting_them: "info", none: "plain", later: "plain",
};

const GROUP: Record<ConnectionState, ConnectionGroup> = {
  connected: "connected", attention: "connected", off: "connected", waiting_you: "available", waiting_them: "available", none: "available", later: "later",
};

const ORDER: Record<ConnectionKind, number> = { whatsapp: 0, phone: 1, sms: 2, google_profile: 3, google_listing: 4, calendar: 5, instagram: 6, email: 7, deposits: 8 };

type Draft = Omit<ConnectionRow, "group" | "tone" | "body"> & { body?: ConnectionRow["body"] };

function row(d: Draft): ConnectionRow {
  return { ...d, group: GROUP[d.state], tone: TONE[d.state], body: d.body ?? null };
}

/** What Google's audience means for the person about to press Connect. */
export function googleAudienceWords(a: GoogleAudience | null | undefined): string | null {
  if (a === "testing") return "Google is reviewing Chanlytics; until then Connect works for invited Google accounts only.";
  if (a === "unverified") return "Google shows a warning until its review of Chanlytics is done — choose Advanced, then Go to Chanlytics.";
  return null;
}

/** The texting states of a line, in the owner's words. The carriers' vocabulary stays out. */
export function smsStateRow(line: LineDto | null, nowMs: number): Draft {
  const num = line ? formatPhoneDisplay(line.e164) : null;
  const since = line ? agoWords(Date.parse(line.state_since), nowMs) : null;
  const base = { kind: "sms" as const, icon: "chat", title: "Texting", detail: num, verb: null };
  // A line that answers calls already has everything a text needs except
  // the carriers' permission, so it OFFERS texting rather than filing it
  // under "later" — which is what it did, so the one thing an owner could
  // do about it was invisible.
  const ready = line?.voice_state === "answering";
  if (ready && (!line?.sms_state || line.sms_state === "none")) {
    return { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: TEXTING_NEEDS_RECORD_SENTENCE, verb: { label: "Fill it in", to: "verb:business-record", who: "owner" }, body: "business_record" };
  }

  // A filing made against the carriers' TEST registry, before any of the real
  // states below: it reports itself as approved, delivers nothing, and expires
  // in thirty days. This row used to read the state underneath it and tell the
  // owner their texting was days from switching itself on. `attention` is
  // exactly what it is -- joined, not working -- and the sentence is the one
  // Setup says, from one function, so the two pages cannot drift apart.
  if (line?.reg_mock) {
    return { ...base, state: "attention", stateWords: "Waiting on us", sentence: textingWords(line).sentence };
  }
  switch (line?.sms_state) {
    case "active":
      // The narrow registration says so here too, from the same sentence Setup
      // uses: a workspace that can send about one message a second has to be
      // able to read that somewhere it will actually look.
      return {
        ...base, state: "connected", stateWords: "On",
        sentence: line?.reg_sole_prop
          ? `Customers text ${num ?? "this number"} and the receptionist answers inside your hours. ${SOLE_PROP_CEILING_SENTENCE}`
          : `Customers text ${num ?? "this number"}; the receptionist answers inside your hours.`,
      };
    case "approved":
      return { ...base, state: "waiting_them", stateWords: "Waiting on carriers", sentence: `Your business is approved. One last check on the line is with the carriers — usually days, and texting switches itself on${since ? `; approved ${since}` : ""}.` };
    case "needs_record":
      // The pre-flight's own sentences when it has them, exactly as `rejected` and
      // `failed` two cases below already do. Gate 8's whole argument is that a
      // refusal must say what to fix; the edge duly writes "what is wrong AND what
      // to do" onto `last_error` — and this row threw it away and said "two
      // minutes, once" instead. For a workspace whose NAME does not match its
      // record, that sentence is also false twice over: the record is complete,
      // and the form it points at cannot fix the workspace's name.
      return line?.last_error
        ? { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: line.last_error, verb: { label: "Open the record", to: "verb:business-record", who: "owner" }, body: "business_record" }
        : { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: TEXTING_NEEDS_RECORD_SENTENCE, verb: { label: "Fill it in", to: "verb:business-record", who: "owner" }, body: "business_record" };
    case "otp_waiting":
      // REPLY to it, not type it. The carriers text the owner's own mobile and
      // the reply must come from that handset -- there is no code to bring back
      // here, and telling somebody to type one sends them looking for a field
      // that does not exist while a 24-hour window runs out.
      //
      // NO VERB, deliberately. This row used to offer "Send it again" pointing
      // at `verb:resend-otp`, which no page handles -- the click did nothing at
      // all, on the one row in this product where a person is against a
      // 24-hour clock. Resending needs a call whose shape cannot be confirmed
      // without a real sole-proprietor brand to make it against, and a brand
      // costs money and cannot be withdrawn. So the sentence says who does it
      // instead of pretending the owner can, and the button comes back the day
      // the endpoint is verified rather than the day somebody thinks the row
      // looks bare.
      return { ...base, state: "waiting_you", stateWords: "Waiting on you", sentence: "The carriers texted your mobile — reply to that message from the handset itself and texting switches on. There is nothing to type here. The code lasts a day; if it runs out, Chanlytics asks the carriers for another." };
    case "registering":
    case "hosting":
      return { ...base, state: "waiting_them", stateWords: "Waiting on carriers", sentence: `The carriers are registering your line, since ${since} · usually a week.` };
    case "rejected":
      // NO "resubmit" VERB, and for the same reason `otp_waiting` above has none:
      // the button did not work. Gate 6 put resubmitting behind `platform_admins`
      // on purpose — a rejection needs somebody who can read what the carriers
      // said — so `refile: true` is never sent by the owner's route, and an owner
      // who corrected their record and pressed "Fix and resubmit" got "The
      // carriers did not answer" about a message the carriers had explicitly sent.
      //
      // Correcting the record IS still theirs, and it is the thing that unblocks
      // the resubmit, so the row still opens the form — it just no longer claims
      // that pressing File sends it, and it says who does.
      return {
        ...base, state: "attention", stateWords: "Sent back",
        sentence: `The carriers sent the registration back${line?.last_error ? `: ${line.last_error}` : ""}. Correct what they named and Chanlytics sends it again — resubmitting is ours to do, and it costs nothing.`,
        verb: { label: "Open the record", to: "verb:business-record", who: "owner" }, body: "business_record",
      };
    case "failed":
      return { ...base, state: "attention", stateWords: "Waiting on us", sentence: line?.last_error || "Registering stopped. A person at Chanlytics has it." };
    default:
      return { ...base, state: "later", stateWords: "Later", sentence: "Plain text messages — arrives with a line that registers with the carriers; this page will say when." };
  }
}

export function connectionRows(i: ConnectionInputs, nowMs = Date.now()): ConnectionRow[] {
  const out: ConnectionRow[] = [];
  // `channelFor`, not `.find`: a workspace that released a line keeps its disabled
  // voice row beside the new active one, and an arbitrary pick between them draws
  // "Off" over a channel that is answering.
  const channel = (kind: string) => channelFor(i.channels, kind);

  // WhatsApp: the channel row when there is one; Meta's door when there is not.
  const wa = channel("whatsapp");
  if (wa) {
    // What Meta has said about the number, in the words Broadcasts, Playbooks
    // and the assistant already use: a flagged number is exactly the "joined
    // but not working" the attention state exists for.
    const h = numberHealth({ quality: wa.quality, event: wa.qualityEvent, limit: wa.messagingLimit });
    const flagged = wa.on && h.tone === "danger";
    const health = wa.on && h.tone !== "unknown" ? ` · ${h.label}` : "";
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: wa.number, state: !wa.on ? "off" : flagged ? "attention" : "connected", stateWords: !wa.on ? "Off" : flagged ? "Needs attention" : "On", sentence: `${wa.healthLabel}${health}`, verb: { label: "Messages", to: "messages", who: "operator" } }));
  } else if (i.whatsapp === undefined) {
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: "Checking whether Chanlytics can connect a number…", verb: null }));
  } else if (i.whatsapp?.ready) {
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: "Sign in to Meta, pick the number, and the receptionist answers on it. Nothing here touches a phone line.", verb: { label: "Connect WhatsApp", to: "verb:whatsapp-connect", who: "owner" } }));
  } else {
    const why = i.whatsapp?.reason === "no_config_id" ? " — the Embedded Signup configuration is missing on the Chanlytics side" : i.whatsapp?.reason === "preview" ? " — only on the production dashboard" : "";
    out.push(row({ kind: "whatsapp", icon: "chat", title: "WhatsApp Business", detail: null, state: "none", stateWords: "Not connected", sentence: `Chanlytics isn't set up to connect numbers yet${why}.`, verb: null }));
  }

  // The phone line: the voice channel, or where getting one stands.
  const voice = channel("voice");
  const own = i.lines.rows.find((l) => l.provider !== "carrier") ?? null;
  if (voice) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: voice.number, state: voice.on ? "connected" : "off", stateWords: voice.on ? "On" : "Off", sentence: voice.healthLabel, verb: null }));
  } else if (own && own.voice_state === "provisioning") {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: formatPhoneDisplay(own.e164), state: "waiting_them", stateWords: "Waiting on us", sentence: `Setting up — ${LINE_STEP_WORDS[own.step ?? ""] ?? "working on it"}, since ${agoWords(Date.parse(own.state_since), nowMs)}. Usually a minute or two.`, verb: null }));
  } else if (own && own.voice_state === "failed") {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: formatPhoneDisplay(own.e164), state: "waiting_them", stateWords: "Waiting on us", sentence: "Setting up stopped. A person at Chanlytics has it; retry from Setup.", verb: { label: "Open Setup", to: "admin/setup", who: "owner" } }));
  } else if (i.lineRequestedAt) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "waiting_them", stateWords: "Waiting on us", sentence: `Requested ${agoWords(Date.parse(i.lineRequestedAt), nowMs)} — a person at Chanlytics will set up your line with you and reach you by email.`, verb: null }));
  } else if (i.lines.ready) {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "none", stateWords: "Not connected", sentence: "Get a number the receptionist answers, or keep the one you have.", verb: { label: "Get a line", to: "admin/setup", who: "owner" } }));
  } else {
    out.push(row({ kind: "phone", icon: "phone", title: "Phone line", detail: null, state: "none", stateWords: "Not connected", sentence: "We set up your phone line with you.", verb: { label: "Ask for a line", to: "admin/setup", who: "owner" } }));
  }

  out.push(row(smsStateRow(own, nowMs)));

  // Google: the owner's Business Profile, then the public listing.
  const g = i.google;
  const c = g?.connection ?? null;
  const l = g?.listing ?? null;
  if (c && c.location_name) {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: c.location_title, state: c.sync_error ? "attention" : "connected", stateWords: c.sync_error ? "Could not sync" : "Connected", sentence: connectionWords(c, nowMs), verb: { label: "Disconnect", to: "verb:google-disconnect", who: "owner" } }));
  } else if (c) {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "waiting_you", stateWords: "Waiting on you", sentence: `${connectionWords(c, nowMs)}.`, verb: null, body: "google_choose" }));
  } else if (g?.ready.profile) {
    const note = googleAudienceWords(g.ready.audience);
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "none", stateWords: "Not connected", sentence: `Sign in to Google once; every review and the right to answer them follow.${note ? ` ${note}` : ""}`, verb: { label: "Connect Google", to: "verb:google-connect", who: "owner" } }));
  } else {
    out.push(row({ kind: "google_profile", icon: "shield", title: "Google Business Profile", detail: null, state: "later", stateWords: "Later", sentence: "Every review and the replies you send from Reports arrive with the Business Profile connection.", verb: null }));
  }

  if (l) {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: l.address, state: l.check_error ? "attention" : "connected", stateWords: l.check_error ? "Could not be read" : "Watched", sentence: `${listingLine(l)} · ${checkedWords(l, nowMs)}`, verb: { label: c && c.location_name ? "Sync now" : "Check now", to: "verb:google-check", who: "operator" } }));
  } else if (g?.ready.places) {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: null, state: "none", stateWords: "Not watched", sentence: "Find it from the name and address on record; new reviews then reach your bell and Reports.", verb: { label: "Find it on Setup", to: "admin/setup", who: "owner" } }));
  } else {
    out.push(row({ kind: "google_listing", icon: "star", title: "Your listing on Google", detail: null, state: "later", stateWords: "Later", sentence: "Your public listing on Google Maps, read once a day for new reviews.", verb: null }));
  }

  // The calendar: the feed the receptionist reads today.
  const cal = i.calendar?.state ?? "none";
  if (cal === "ok") {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: "iCal feed", state: "connected", stateWords: "Readable", sentence: "The receptionist offers times from it. Two-way sync with Google Calendar comes later.", verb: { label: "Open Calendar", to: "calendar", who: "operator" } }));
  } else if (cal === "unavailable") {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: "iCal feed", state: "attention", stateWords: "Could not be read", sentence: "Your calendar could not be read. Check the address in Settings › Business.", verb: { label: "Check the feed", to: "admin/workspace", who: "owner" } }));
  } else {
    out.push(row({ kind: "calendar", icon: "calendar", title: "Calendar", detail: null, state: "none", stateWords: "Not connected", sentence: "Paste your calendar's iCal address so the receptionist knows what is taken. Two-way sync with Google Calendar comes later.", verb: { label: "Paste the feed", to: "admin/workspace", who: "owner" } }));
  }

  out.push(row({ kind: "instagram", icon: "instagram", title: "Instagram", detail: null, state: "later", stateWords: "Later", sentence: "Direct messages, answered by the receptionist like WhatsApp.", verb: null }));
  out.push(row({ kind: "email", icon: "mail", title: "Email", detail: null, state: "later", stateWords: "Later", sentence: "An address the receptionist answers.", verb: null }));
  out.push(row({ kind: "deposits", icon: "money", title: "Deposits", detail: null, state: "later", stateWords: "Later", sentence: "Deposits and payments taken by the receptionist.", verb: null }));

  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

export const CONNECTION_GROUP_WORDS: Record<ConnectionGroup, { title: string; sub: (rows: ConnectionRow[]) => string }> = {
  connected: {
    title: "Connected",
    sub: (rows) => {
      const bad = rows.filter((r) => r.state !== "connected").length;
      return `${rows.length} connected${bad ? ` · ${bad} need${bad === 1 ? "s" : ""} attention` : ""}`;
    },
  },
  available: { title: "Available", sub: (rows) => (rows.some((r) => r.state === "waiting_you") ? "something here waits on you" : rows.some((r) => r.state === "waiting_them") ? "in progress" : "ready when you are") },
  later: { title: "Later", sub: () => "nothing here pretends to be connected" },
};
