import { MIN_MS, formatterOnUse } from "../shared/time.js";
import {
  CUSTOMER_DOMAIN_DAILY_MAX,
  MAILBOX_HOLDS,
  MAILBOX_RAMP,
  mailboxDailyCap,
  mailboxHoldFixWords,
  mailboxHoldWords,
  mailboxRampShare
} from "./mailbox-standing.js";
const DAY_FMT = formatterOnUse("en-US", { month: "short", day: "numeric" });
export const MAILBOX_PROVIDERS = ["google", "microsoft"];
export const MAILBOX_CONNECTION_STATES = ["connected", "reconnect", "paused", "held", "removed"];
const MAILBOX_DNS_RECORDS = ["spf", "dkim", "dmarc", "mx"];
export const MAILBOX_CONNECTIONS_MAX = 10;
const MAILBOXES_PER_DOMAIN_MAX = 3;
export function mailboxSendsNow(m, nowMs) {
  return m.state === "connected" && (!m.resting_until || Date.parse(m.resting_until) <= nowMs);
}
export function reachOutWritesFrom(m, named) {
  return m.state !== "removed" && (named.length === 0 || named.includes(m.id));
}
export function mailboxSignsOf(r, gmailWords) {
  const gmail_read_at = r.gmail_signature_at ?? null;
  const gmail = gmailWords?.trim() || null;
  if (r.signature_off === true) return { from: "none", words: null, gmail_read_at, gmail };
  const own = r.signature?.trim();
  if (own) return { from: "own", words: own, gmail_read_at, gmail };
  if (gmail) return { from: "gmail", words: gmail, gmail_read_at, gmail };
  return { from: "name", words: r.from_name.trim() || null, gmail_read_at, gmail };
}
export const SPF_RECORD_MAX = 4096;
export const SPF_RECORDS_JOIN = " | ";
export function mailboxConnectionDtoOf(r, day = null, gmailWords = null) {
  const dns = {};
  const raw = r.dns && typeof r.dns === "object" ? r.dns : {};
  for (const k of MAILBOX_DNS_RECORDS) {
    const v = raw[k];
    if (v === "found" || v === "missing") dns[k] = v;
  }
  const spfRecord = typeof raw.spf_record === "string" && raw.spf_record.trim() ? raw.spf_record.trim().slice(0, SPF_RECORD_MAX) : null;
  const lookups = Number(raw.spf_lookups);
  return {
    id: r.id,
    provider: r.provider === "microsoft" ? "microsoft" : "google",
    address: r.address,
    host: r.host,
    from_name: r.from_name,
    signature: r.signature,
    state: MAILBOX_CONNECTION_STATES.includes(r.state) ? r.state : "removed",
    held_why: MAILBOX_HOLDS.includes(r.held_why ?? "") ? r.held_why : null,
    held_at: r.held_at,
    resting_until: r.resting_until,
    daily_cap: r.daily_cap,
    customer_domain: r.customer_domain,
    sent_days: Math.max(0, Math.floor(Number(r.sent_days) || 0)),
    dns,
    spf_record: spfRecord,
    spf_lookups: Number.isInteger(lookups) && lookups >= 0 ? lookups : null,
    dns_checked_at: r.dns_checked_at,
    last_error: r.last_error,
    connected_at: r.connected_at,
    sent_at: r.sent_at,
    synced_at: r.synced_at,
    sent_today: day?.sent_today ?? null,
    counts: day?.counts ?? null,
    came_in: day?.came_in ?? null,
    signs: mailboxSignsOf(r, gmailWords)
  };
}
const COUNT_FLOOR = 150;
const HOLD_PERCENT = 3;
export function mailboxHoldOf(c) {
  if (!c) return null;
  const of = Math.max(c.sent, COUNT_FLOOR);
  if (c.complained > 0) return "complaint";
  if ((c.bounced + c.blocked) * 100 > HOLD_PERCENT * of) return "bounces";
  if (c.unsubscribed * 100 > HOLD_PERCENT * of) return "unsubscribes";
  return null;
}
export const MAILBOX_PROVIDER_WORDS = { google: "Google", microsoft: "Microsoft" };
export function mailboxHealthWords(c) {
  if (!c || !c.sent) return null;
  const pct = Math.round(c.bounced / c.sent * 1e3) / 10;
  const parts = [
    `${pct}% bounced`,
    c.blocked ? `${c.blocked} refused by the server` : null,
    c.unsubscribed ? `${c.unsubscribed} unsubscribed` : null,
    c.said_no ? `${c.said_no} said no` : null,
    c.complained ? `${c.complained} marked as spam` : "none marked as spam"
  ];
  return parts.filter(Boolean).join(" \xB7 ");
}
export function mailboxWords(m, nowMs, sentToday = m.sent_today ?? null) {
  const health = mailboxHealthWords(m.counts ?? null);
  const cap = mailboxDailyCap(m);
  const step = MAILBOX_RAMP.find((s) => s.perDay > mailboxRampShare(m.sent_days));
  const left = step ? step.days - m.sent_days : 0;
  const ceiling = m.customer_domain && cap >= CUSTOMER_DOMAIN_DAILY_MAX;
  const ramp = ceiling ? `Customer domain: kept to ${CUSTOMER_DOMAIN_DAILY_MAX} a day` : `${m.sent_days ? `Day ${m.sent_days + 1} of its ramp` : "New: its ramp starts today"} \xB7 ${cap} a day${step && cap < m.daily_cap ? `, ${step.perDay} after ${left} more day${left === 1 ? "" : "s"} of sending` : ""}`;
  if (m.state === "reconnect")
    return {
      pill: "Reconnect",
      tone: "danger",
      day: `${MAILBOX_PROVIDER_WORDS[m.provider]} signed it out, so nothing leaves from it.`,
      ramp: null,
      health: null,
      fix: "Connect it again: its emails wait for it."
    };
  if (m.state === "paused")
    return {
      pill: "Paused",
      tone: "plain",
      day: "You paused it: nothing leaves from it.",
      ramp,
      health,
      fix: null
    };
  if (m.state === "held") {
    const since = m.held_at ? DAY_FMT.format(new Date(m.held_at)) : null;
    return {
      pill: "Held",
      tone: "warn",
      day: `${since ? `Held since ${since}` : "Held"}: ${mailboxHoldWords(m.held_why)}.`,
      ramp: null,
      health,
      fix: mailboxHoldFixWords(m.held_why)
    };
  }
  if (m.state === "removed")
    return { pill: "Removed", tone: "plain", day: "Removed.", ramp: null, health: null, fix: null };
  if (m.resting_until && Date.parse(m.resting_until) > nowMs)
    return {
      pill: "Done for today",
      tone: "warn",
      day: `${MAILBOX_PROVIDER_WORDS[m.provider]}'s own daily limit: it sends again from ${clockOf(m.resting_until)}.`,
      ramp,
      health,
      fix: null
    };
  const named = MAILBOX_DNS_RECORDS.filter((k) => k !== "mx");
  const missing = named.filter((k) => m.dns[k] === "missing");
  const add = missing.filter((k) => !(k === "spf" && m.spf_record));
  const change = missing.includes("spf") && !!m.spf_record;
  const unread = named.some((k) => !m.dns[k]);
  const fix = [
    add.length ? `Add its ${add.map((k) => k.toUpperCase()).join(" and ")} record below.` : null,
    change ? "Change its SPF record below." : null,
    !missing.length && unread ? "Its records couldn't be read just now: Check reads them again." : null
  ].filter(Boolean).join(" ") || null;
  return {
    pill: sentToday !== null && sentToday >= cap ? "Done for today" : "Connected",
    tone: sentToday !== null && sentToday >= cap ? "warn" : "ok",
    day: sentToday === null ? `Up to ${cap} a day` : `${sentToday} of ${cap} today`,
    ramp,
    health,
    fix
  };
}
const CLOCK_FMT = formatterOnUse("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" });
const clockOf = (iso) => CLOCK_FMT.format(new Date(iso));
const TIME_FMT = formatterOnUse("en-US", { hour: "numeric", minute: "2-digit" });
const MAILBOX_READ_LATE_MS = 20 * MIN_MS;
export const mailboxSignsChoiceOf = (m) => m.signs.from === "none" ? "none" : m.signs.from === "own" ? "own" : "gmail";
export const MAILBOX_SIGNATURE_WORDS = {
  label: "It signs its emails with",
  gmail: "From Gmail",
  name: "Its name",
  own: "Write one",
  none: "None",
  ownLabel: "Its signature",
  ownHint: "Under every email it sends.",
  ownEmpty: "Write the signature, or choose another.",
  none_says: "Nothing goes under its emails, not even its name."
};
export function mailboxGmailSignsWords(m) {
  const gmailWords = m.signs.gmail;
  if (m.provider !== "google") return { words: m.from_name, read: "Its emails end with the name it sends as." };
  const at = m.signs.gmail_read_at;
  const read = at ? `Read from Gmail at ${clockOf(at)}. Saving reads it again.` : "Saving reads it from Gmail now.";
  return gmailWords ? { words: gmailWords, read } : { words: m.from_name, read: `Gmail has none for this address, so its emails end with its name. ${read}` };
}
function mailboxReadWords(syncedAt, nowMs) {
  if (!syncedAt) return "Not read yet";
  return nowMs - Date.parse(syncedAt) > MAILBOX_READ_LATE_MS ? `Not read since ${clockOf(syncedAt)}` : `Read at ${TIME_FMT.format(new Date(syncedAt))}`;
}
function mailboxWroteWords(people) {
  if (people === 0) return "No one wrote today";
  return `${people} ${people === 1 ? "person" : "people"} wrote today`;
}
export function mailboxRowWords(m, nowMs) {
  const w = mailboxWords(m, nowMs);
  if (m.state === "reconnect" || m.state === "removed")
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn: null,
      standing: m.state === "removed" ? w.day : `${MAILBOX_PROVIDER_WORDS[m.provider]} signed it out: nothing is read from it or sent until it's connected again.`,
      fix: w.fix
    };
  const cameIn = [mailboxReadWords(m.synced_at ?? null, nowMs), m.came_in == null ? null : mailboxWroteWords(m.came_in)].filter(Boolean).join(" \xB7 ");
  if (m.state === "paused")
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn,
      standing: "You paused its sending: what people write still comes in.",
      fix: null
    };
  if (m.state === "held") {
    const since = m.held_at ? DAY_FMT.format(new Date(m.held_at)) : null;
    return {
      pill: w.pill,
      tone: w.tone,
      cameIn,
      standing: `Its sending is held${since ? ` since ${since}` : ""}: ${mailboxHoldWords(m.held_why)}.`,
      fix: w.fix
    };
  }
  return { pill: "Connected", tone: "ok", cameIn, standing: null, fix: w.fix };
}
export function mailboxSendingLines(m, nowMs) {
  const w = mailboxWords(m, nowMs);
  const top = Math.max(...MAILBOX_RAMP.map((s) => s.perDay));
  return [
    m.state === "connected" ? w.day : null,
    w.ramp,
    w.health,
    m.customer_domain && m.state === "connected" ? customerDomainWords(m.host) : null,
    `A new mailbox starts at ${MAILBOX_RAMP[0].perDay} a day and grows with the days it sends, to ${top}.`
  ].filter((line) => !!line);
}
export function mailboxActs(m) {
  return {
    reconnect: m.state === "reconnect",
    resume: m.state === "held",
    pause: m.state === "connected",
    unpause: m.state === "paused",
    test: m.state === "connected" || m.state === "paused",
    remove: m.state !== "removed"
  };
}
export const DMARC_RECOMMENDED = "v=DMARC1; p=none;";
const SPF_INCLUDE = {
  google: "include:_spf.google.com",
  microsoft: "include:spf.protection.outlook.com"
};
export const SPF_LOOKUPS_MAX = 10;
const spfAll = (t) => /^[+\-~?]?all$/i.test(t);
function spfRecordWith(existing, provider) {
  const include = SPF_INCLUDE[provider];
  const records = (existing ?? "").split(SPF_RECORDS_JOIN).map((r) => r.trim().split(/\s+/).filter(Boolean)).filter((terms2) => /^v=spf1$/i.test(terms2[0] ?? ""));
  const has = (terms2) => terms2.some((t) => t.replace(/^\+/, "").toLowerCase() === include);
  if (records.length > 1) {
    const named = [
      ...new Set(records.flatMap((terms2) => terms2.slice(1)).filter((t) => !spfAll(t) && !/^redirect=/i.test(t)))
    ];
    return ["v=spf1", ...named, ...has(named) ? [] : [include], "~all"].join(" ");
  }
  const terms = records[0];
  if (!terms) return `v=spf1 ${include} ~all`;
  if (has(terms)) return terms.join(" ");
  const at = terms.findIndex((t, i) => i > 0 && (spfAll(t) || /^redirect=/i.test(t)));
  if (at < 0) return [...terms, include].join(" ");
  return [...terms.slice(0, at), include, ...terms.slice(at)].join(" ");
}
const DKIM_WHERE = {
  google: {
    name: "google._domainkey",
    value: "Made in the Google Admin console: Apps \u203A Google Workspace \u203A Gmail \u203A Authenticate email"
  },
  microsoft: {
    name: "selector1._domainkey",
    value: "Turned on in Microsoft Defender: Email authentication settings \u203A DKIM"
  }
};
function spfNote(m) {
  if (!m.spf_record) return null;
  const who = MAILBOX_PROVIDER_WORDS[m.provider];
  const many = m.spf_record.split(SPF_RECORDS_JOIN).length;
  const change = many > 1 ? `Your domain has ${many} SPF records, and with more than one none of them counts: replace them all with this one, which keeps every sender they name and adds ${who}.` : `Your domain has an SPF record already, and it may have only one: change it to this, which keeps every sender it names and adds ${who}.`;
  const after = m.spf_lookups === null || many > 1 ? null : m.spf_lookups;
  return after !== null && after > SPF_LOOKUPS_MAX ? `${change} It would then spend ${after} of SPF's ${SPF_LOOKUPS_MAX} lookups and fail: ask whoever manages your DNS to shorten it first.` : change;
}
export function mailboxRecordRows(m) {
  const stateOf = (k) => m.dns[k] ?? "unread";
  const spf = { provider: m.provider, spf_record: m.spf_record ?? null, spf_lookups: m.spf_lookups ?? null };
  const row = (key, r, note) => ({
    key,
    ...r,
    found: stateOf(key) === "found",
    state: stateOf(key),
    note: stateOf(key) === "found" ? null : note
  });
  return [
    row(
      "spf",
      { kind: "Sender (SPF)", type: "TXT", name: "@", value: spfRecordWith(spf.spf_record, m.provider) },
      spfNote(spf)
    ),
    row(
      "dkim",
      {
        kind: "Signing (DKIM)",
        type: m.provider === "microsoft" ? "CNAME" : "TXT",
        name: DKIM_WHERE[m.provider].name,
        value: DKIM_WHERE[m.provider].value
      },
      null
    ),
    row("dmarc", { kind: "Policy (DMARC)", type: "TXT", name: "_dmarc", value: DMARC_RECOMMENDED }, null)
  ];
}
const CONNECT_FAILED = "That didn't go through. Try again in a minute.";
export const MAILBOX_CONNECT_WORDS = {
  connected: "Connected: email from people comes into your Inbox, and its last six months are on their way.",
  reconnected: "Connected again: its emails go on where they waited.",
  declined: "Nothing was connected: the sign-in was cancelled.",
  scopes_missing: "Nothing was connected: send and read access are both needed. Connect again and leave both ticked.",
  no_refresh_token: "Nothing was connected: the provider gave no lasting access. Connect again.",
  taken: "Another workspace writes from this mailbox. Remove it there first.",
  too_many: `A workspace writes from ${MAILBOX_CONNECTIONS_MAX} mailboxes at most. Remove one to add another.`,
  too_many_on_domain: `A workspace writes from ${MAILBOXES_PER_DOMAIN_MAX} mailboxes on one domain at most.`,
  free_mail: "A free mailbox (Gmail.com, Outlook.com and the like) isn't for writing to businesses: connect one on your own domain.",
  not_available: "Connecting a mailbox isn't switched on here yet.",
  // The page's own gate says the same (contracts roleGate on `settings`), and so does the door's refusal.
  not_owner: "Only an owner can connect a mailbox.",
  no_address: "Nothing was connected: the provider didn't say which address the account sends from. Connect again.",
  unverified: "Nothing was connected: Google hasn't verified that account's address yet. Verify it, then connect again.",
  not_workspace: "Nothing was connected: that Google account isn't a Google Workspace mailbox. Connect the one your business writes from.",
  no_mailbox: "Nothing was connected: that account has no mailbox to send from (Gmail or Exchange isn't switched on for it). Ask whoever runs your email to switch it on.",
  wrong_account: "Nothing was connected: that's a different account. Sign in as the mailbox you're reconnecting.",
  admin_consent: "Your organisation's Microsoft 365 admin approves Chanlytics once. Copy the link for them, then connect again when they have.",
  admin_approved: "Approved for your organisation. Connect the mailbox now.",
  failed: CONNECT_FAILED
};
const CONNECT_OK = /* @__PURE__ */ new Set(["connected", "reconnected", "admin_approved"]);
export function mailboxConnectOk(code) {
  return !!code && CONNECT_OK.has(code);
}
export function mailboxConnectWords(code) {
  return code && MAILBOX_CONNECT_WORDS[code] || CONNECT_FAILED;
}
export function mailboxesFootWords(count) {
  if (count >= MAILBOX_CONNECTIONS_MAX) return `${MAILBOX_CONNECTIONS_MAX} is the most. Remove one to add another.`;
  if (count === 0)
    return `Email people write to your mailbox comes into your Inbox, and sequences to leads write from it through Google or Microsoft, so every email is yours and every reply comes back to it. A mailbox on the domain your customers write to sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to leads; for more, use a second domain such as get<yourbusiness>.com.`;
  return "Email people write to it comes into your Inbox; sequences to leads write from it, and their replies come back here.";
}
export function customerDomainWords(host) {
  return `Your customers write to ${host}, so this mailbox sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to keep their mail and bookings safe. For more, connect a mailbox on a second domain, such as get${host}.`;
}
