import { formatterOnUse } from "../shared/time.js";
const DAY_FMT = formatterOnUse("en-US", { month: "short", day: "numeric" });
export const MAILBOX_PROVIDERS = ["google", "microsoft"];
export const MAILBOX_CONNECTION_STATES = ["connected", "reconnect", "paused", "held", "removed"];
export const MAILBOX_HOLDS = ["bounces", "complaint", "unsubscribes"];
const MAILBOX_DNS_RECORDS = ["spf", "dkim", "dmarc", "mx"];
export const MAILBOX_CONNECTIONS_MAX = 10;
const MAILBOXES_PER_DOMAIN_MAX = 3;
export const MAILBOX_DAILY_CAP_MAX = 40;
export const CUSTOMER_DOMAIN_DAILY_MAX = 20;
export const MAILBOX_RAMP = [
  { days: 0, perDay: 10 },
  { days: 7, perDay: 20 },
  { days: 14, perDay: 30 },
  { days: 21, perDay: 40 }
];
export function mailboxRampShare(sentDays) {
  const days = Math.max(0, Math.floor(Number(sentDays) || 0));
  let cap = 0;
  for (const step of MAILBOX_RAMP) if (days >= step.days) cap = step.perDay;
  return cap;
}
export function mailboxDailyCap(m) {
  const owner = Math.max(0, Math.min(MAILBOX_DAILY_CAP_MAX, Math.floor(Number(m.daily_cap) || 0)));
  const ceiling = m.customer_domain ? CUSTOMER_DOMAIN_DAILY_MAX : MAILBOX_DAILY_CAP_MAX;
  return Math.min(mailboxRampShare(m.sent_days), owner, ceiling);
}
export function mailboxSendsNow(m, nowMs) {
  return m.state === "connected" && (!m.resting_until || Date.parse(m.resting_until) <= nowMs);
}
export function reachOutWritesFrom(m, named) {
  return m.state !== "removed" && (named.length === 0 || named.includes(m.id));
}
export const SPF_RECORD_MAX = 4096;
export const SPF_RECORDS_JOIN = " | ";
export function mailboxConnectionDtoOf(r, day = null) {
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
    sent_today: day?.sent_today ?? null,
    counts: day?.counts ?? null
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
const HOLD_WORDS = {
  bounces: "more than 3% of its recent emails bounced or were refused",
  complaint: "someone marked an email from it as spam",
  unsubscribes: "more than 3% of the businesses it wrote to unsubscribed"
};
export function mailboxHoldWords(why) {
  return why && HOLD_WORDS[why] || "it was held";
}
const HOLD_FIX_WORDS = {
  bounces: "Check the addresses it writes to and its domain's records below, then resume it.",
  complaint: "Read the email again (a clear reason for writing, and fewer a day), then resume it.",
  unsubscribes: "Write to fewer, and to the ones it fits best, then resume it."
};
export function mailboxHoldFixWords(why) {
  return why && HOLD_FIX_WORDS[why] || null;
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
  connected: "Connected. Its ramp starts at 10 a day.",
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
    return `A sequence to leads writes from your own mailbox, through Google or Microsoft, so every email is yours and every reply comes back to it. A mailbox on the domain your customers write to sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most; for more, use a second domain such as get<yourbusiness>.com.`;
  return `A new mailbox starts at ${MAILBOX_RAMP[0].perDay} a day and grows with the days it sends, to ${Math.max(...MAILBOX_RAMP.map((s) => s.perDay))}. Replies come back to it, and to your Inbox here.`;
}
export function customerDomainWords(host) {
  return `Your customers write to ${host}, so this mailbox sends ${CUSTOMER_DOMAIN_DAILY_MAX} a day at most to keep their mail and bookings safe. For more, connect a mailbox on a second domain, such as get${host}.`;
}
