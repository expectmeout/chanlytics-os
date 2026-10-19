import { formatterOnUse } from "../shared/time.js";
const DAY_FMT = formatterOnUse("en-US", { month: "short", day: "numeric" });
export const MAILBOX_PROVIDERS = ["google", "microsoft"];
export const MAILBOX_CONNECTION_STATES = ["connected", "reconnect", "paused", "held", "removed"];
export const MAILBOX_HOLDS = ["bounces", "complaint", "unsubscribes"];
const MAILBOX_DNS_RECORDS = ["spf", "dkim", "dmarc", "mx"];
export const MAILBOX_CONNECTIONS_MAX = 10;
const MAILBOXES_PER_DOMAIN_MAX = 3;
export const MAILBOX_DAILY_CAP_MAX = 50;
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
export function mailboxConnectionDtoOf(r) {
  const dns = {};
  if (r.dns && typeof r.dns === "object")
    for (const k of MAILBOX_DNS_RECORDS) {
      const v = r.dns[k];
      if (v === "found" || v === "missing") dns[k] = v;
    }
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
    dns_checked_at: r.dns_checked_at,
    last_error: r.last_error,
    connected_at: r.connected_at,
    sent_at: r.sent_at
  };
}
const COUNT_FLOOR = 150;
const HOLD_PERCENT = 3;
export function mailboxHoldOf(c) {
  if (!c) return null;
  const of = Math.max(c.sent, COUNT_FLOOR);
  if (c.complained > 0) return "complaint";
  if (c.bounced * 100 > HOLD_PERCENT * of) return "bounces";
  if (c.unsubscribed * 100 > HOLD_PERCENT * of) return "unsubscribes";
  return null;
}
const HOLD_WORDS = {
  bounces: "more than 3% of its recent emails bounced",
  complaint: "someone marked an email from it as spam",
  unsubscribes: "more than 3% of the businesses it wrote to said no or unsubscribed"
};
export function mailboxHoldWords(why) {
  return why && HOLD_WORDS[why] || "it was held";
}
const HOLD_FIX_WORDS = {
  bounces: "Check the addresses it writes to, then resume it.",
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
  const no = c.unsubscribed ? `${c.unsubscribed} said no` : "nobody said no";
  const spam = c.complained ? `${c.complained} marked as spam` : "none marked as spam";
  return `${pct}% bounced \xB7 ${no} \xB7 ${spam}`;
}
export function mailboxWords(m, nowMs, sentToday = null) {
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
      health: null,
      fix: null
    };
  if (m.state === "held") {
    const since = m.held_at ? DAY_FMT.format(new Date(m.held_at)) : null;
    return {
      pill: "Held",
      tone: "warn",
      day: `${since ? `Held since ${since}` : "Held"}: ${mailboxHoldWords(m.held_why)}.`,
      ramp: null,
      health: null,
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
      health: null,
      fix: null
    };
  const missing = MAILBOX_DNS_RECORDS.filter((k) => k !== "mx" && m.dns[k] === "missing");
  return {
    pill: sentToday !== null && sentToday >= cap ? "Done for today" : "Connected",
    tone: sentToday !== null && sentToday >= cap ? "warn" : "ok",
    day: sentToday === null ? `Up to ${cap} a day` : `${sentToday} of ${cap} today`,
    ramp,
    health: null,
    fix: missing.length ? `Add its ${missing.map((k) => k.toUpperCase()).join(" and ")} record below.` : null
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
  google: "v=spf1 include:_spf.google.com ~all",
  microsoft: "v=spf1 include:spf.protection.outlook.com -all"
};
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
export function mailboxRecordRows(m) {
  return [
    {
      key: "spf",
      kind: "Sender (SPF)",
      type: "TXT",
      name: "@",
      value: SPF_INCLUDE[m.provider],
      found: m.dns.spf === "found"
    },
    {
      key: "dkim",
      kind: "Signing (DKIM)",
      type: m.provider === "microsoft" ? "CNAME" : "TXT",
      name: DKIM_WHERE[m.provider].name,
      value: DKIM_WHERE[m.provider].value,
      found: m.dns.dkim === "found"
    },
    {
      key: "dmarc",
      kind: "Policy (DMARC)",
      type: "TXT",
      name: "_dmarc",
      value: DMARC_RECOMMENDED,
      found: m.dns.dmarc === "found"
    }
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
  not_owner: "Only the workspace's owner or a manager connects a mailbox.",
  failed: CONNECT_FAILED
};
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
