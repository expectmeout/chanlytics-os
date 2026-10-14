// src/config/workspace-config/alerts.ts
var ALERT_ADDRESSES_MAX = 10;
var ALERT_ADDRESSES_MIN = 1;
var alertKey = (address) => String(address ?? "").trim().toLowerCase();
function alertAddressesOf(notifications) {
  const out = /* @__PURE__ */ new Set();
  for (const e of notifications?.escalation_emails ?? []) {
    const key = alertKey(e);
    if (key) out.add(key);
  }
  return out;
}
function memberGetsAlerts(email, notifications) {
  const key = alertKey(email);
  return !!key && alertAddressesOf(notifications).has(key);
}
var ALERT_REFUSED_WORDS = {
  last: "Someone has to get alerts. Add another address on Notifications first.",
  full: `Alerts go to ${ALERT_ADDRESSES_MAX} addresses at most. Take one off on Notifications first.`,
  address: "That doesn't look like an email address."
};
function withAlertAddress(notifications, email, on) {
  const key = alertKey(email);
  if (!key || !key.includes("@")) return { ok: false, reason: "address" };
  const list = [...notifications?.escalation_emails ?? []];
  const has = list.some((e) => alertKey(e) === key);
  const next = on ? has ? list : [...list, key] : list.filter((e) => alertKey(e) !== key);
  if (on && !has && next.length > ALERT_ADDRESSES_MAX) return { ok: false, reason: "full" };
  if (!on && has && next.length < ALERT_ADDRESSES_MIN) return { ok: false, reason: "last" };
  return {
    ok: true,
    changed: has !== on,
    notifications: { ...notifications ?? {}, escalation_emails: next }
  };
}

// src/leads/search/plan.ts
var US_STATES = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY"
};
var US_CODES = new Set(Object.values(US_STATES));

// src/leads/search/sentence.ts
var US_NAMES = Object.fromEntries(
  Object.entries(US_STATES).map(([name, code]) => [code, name])
);

// src/shared/time.ts
var MIN_MS = 6e4;
var HOUR_MS = 36e5;
var DAY_MS = 864e5;
var WEEK_MS = 7 * DAY_MS;
function formatterOnUse(locales, options) {
  let built = null;
  return { format: (date) => (built ??= new Intl.DateTimeFormat(locales, options)).format(date) };
}
var DATE_FMT = formatterOnUse([], { month: "short", day: "numeric" });
function spanUnits(ms) {
  const gap = Math.max(0, ms);
  if (gap < MIN_MS) return { n: Math.round(gap / 1e3), unit: "s" };
  const minutes = Math.round(gap / MIN_MS);
  if (minutes < 60) return { n: minutes, unit: "m" };
  const hours = Math.round(gap / HOUR_MS);
  if (hours < 24) return { n: hours, unit: "h" };
  return { n: Math.round(gap / DAY_MS), unit: "d" };
}
function spanLabel(ms) {
  const u = spanUnits(ms);
  return u.unit === "s" ? "now" : `${u.n}${u.unit}`;
}
function agoShort(atMs, nowMs) {
  return spanLabel(nowMs - atMs);
}

// src/leads/lead-words.ts
var LEAD_VIEW_SORTS = ["fit", "found", "distance", "business", "rating", "stage"];
var LEAD_SORTS = [...LEAD_VIEW_SORTS, "pile"];

// src/leads/lead-plan.ts
var LEAD_QUESTION_WAIT_LINE = "Nothing is spent while this waits. With no answer in a day, it stops and keeps what it found.";

// src/today/push.ts
var BELL_LIST_ROWS = 60;
var PUSH_RECEIPTS_AFTER_MS = 15 * MIN_MS;
var BELL_WINDOW_DAYS = 30;

// src/today/notification-kinds.ts
var NOTIFICATION_DELIVERY = {
  handoff: "email",
  deadman: "email",
  call: "email",
  number: "email",
  sweep: "email",
  job_failed: "email",
  playbook: "email",
  calendar_people: "bell",
  booking_notice: "bell",
  alert: "email",
  review: "bell",
  billing: "email",
  template_ready: "email",
  template_blocked: "email",
  broadcast_sent: "email",
  broadcast_stopped: "email",
  leads_ready: "bell",
  leads_question: "email",
  note_for_you: "bell",
  reach_out_replied: "email",
  reach_out_day: "bell",
  // A customer asked to stop: news and no wait (decision 0048). Emailed only as the business chooses, never always.
  opted_out: "email",
  // A booking that arrived and a teammate who joined: news and no wait, a line on the bell and no mail, no phone.
  booking: "bell",
  member_joined: "bell",
  // A teammate who left: the same, the other way (00436).
  member_left: "bell"
};
var EMAILED_NOTIFICATION_KINDS = Object.keys(NOTIFICATION_DELIVERY).filter((k) => NOTIFICATION_DELIVERY[k] === "email");
var ALERT_GROUP_TITLES = {
  needs_you: "Needs you",
  worth_knowing: "Worth knowing",
  for_you: "For your information"
};
var ALERT_TOPICS = [
  {
    key: "handoff",
    group: "needs_you",
    title: "A customer needs a person",
    what: "The receptionist stopped on a conversation and someone is waiting. The alert carries their message.",
    email: "always",
    phone: true,
    kinds: ["handoff"]
  },
  {
    key: "deadman",
    group: "needs_you",
    title: "Still waiting for an answer",
    what: "A customer who needed a person has waited a while, a message went unanswered, or a reply never left.",
    email: "always",
    phone: true,
    kinds: ["deadman"]
  },
  {
    key: "playbook",
    group: "needs_you",
    title: "A campaign or reach-out waits for your yes",
    what: "A run waits for your approval, or goes unless you stop it, with how many people it reaches; a reach-out holds an email for your call; or a campaign could not run today, and tomorrow's run tries again.",
    email: "choice",
    phone: true,
    kinds: ["playbook"]
  },
  {
    key: "leads_question",
    group: "needs_you",
    title: "A lead search asks you something",
    what: `A lead search stopped to ask you something. ${LEAD_QUESTION_WAIT_LINE}`,
    email: "choice",
    phone: true,
    kinds: ["leads_question"]
  },
  {
    key: "call",
    group: "worth_knowing",
    title: "After every phone call",
    what: "Who called, how long, what they wanted and what to do next. The email carries the transcript.",
    email: "choice",
    phone: true,
    kinds: ["call"]
  },
  {
    key: "reach_out_replied",
    group: "worth_knowing",
    title: "A business wrote back to a reach-out",
    what: "What the reply was read as, what was done, and the receptionist's draft when it wrote one.",
    email: "choice",
    phone: true,
    kinds: ["reach_out_replied"]
  },
  {
    key: "opted_out",
    group: "worth_knowing",
    title: "A customer asked to stop",
    what: "Someone texted STOP, unsubscribed from your emails, reported one as spam, or their carrier told us they stopped. Nothing more is sent to them, and nothing waits on you.",
    email: "choice",
    phone: false,
    kinds: ["opted_out"]
  },
  {
    key: "job_failed",
    group: "worth_knowing",
    title: "Something did not finish",
    what: "A reply may not have been sent, or a search, a broadcast or another background job stopped partway. It says what stopped and whether it carries on.",
    email: "choice",
    phone: true,
    kinds: ["job_failed"]
  },
  {
    key: "broadcasts",
    group: "worth_knowing",
    title: "A broadcast finished, or stopped",
    what: "When a broadcast has gone to everyone it could reach, with how many got it and how many were held back; and when one stops partway or never goes out.",
    email: "choice",
    phone: true,
    kinds: ["broadcast_sent", "broadcast_stopped"]
  },
  {
    key: "number",
    group: "worth_knowing",
    title: "Your WhatsApp number needs attention",
    what: "WhatsApp flagged it, lowered how many new conversations it can start, restricted the account or rejected its review, or the business removed Chanlytics from it.",
    email: "choice",
    phone: true,
    kinds: ["number"]
  },
  {
    key: "templates",
    group: "worth_knowing",
    title: "A WhatsApp template was approved or blocked",
    what: "WhatsApp approved a template, or rejected, paused or disabled it, or moved it to marketing, where a send needs the customer's recorded yes.",
    email: "choice",
    phone: false,
    kinds: ["template_ready", "template_blocked"]
  },
  {
    key: "sweep",
    group: "worth_knowing",
    title: "Sending is paused",
    what: "Offers and news by email, or a mailbox your reach-outs write from, are held after bounces or complaints, or when its provider signs it out, and you are told. Messages about a visit and everything on WhatsApp go on.",
    email: "choice",
    phone: false,
    kinds: ["sweep"]
  },
  {
    key: "billing",
    group: "worth_knowing",
    title: "Your plan",
    what: "A card declined, a trial ending, or the subscription ended and your receptionist's number is going back. Only the number going back is emailed.",
    email: "choice",
    phone: true,
    kinds: ["billing"]
  },
  {
    key: "leads_ready",
    group: "for_you",
    title: "A search found leads",
    what: "A lead search finished, with how many it found.",
    onBell: "finished searches",
    email: null,
    phone: true,
    kinds: ["leads_ready"]
  },
  {
    key: "review",
    group: "for_you",
    title: "A new Google review",
    what: "Someone reviewed the business on its Google profile.",
    onBell: "new Google reviews",
    email: null,
    phone: true,
    kinds: ["review"]
  },
  {
    key: "note_for_you",
    group: "for_you",
    title: "A note left for you",
    what: "A teammate left you a note on a person. Only you are told.",
    onBell: "notes left for you",
    email: null,
    phone: true,
    kinds: ["note_for_you"]
  }
];
var EMAIL_CHOICE_KINDS = ALERT_TOPICS.flatMap(
  (t) => t.email === "choice" ? t.kinds : []
);
function emailOffOf(notifications) {
  const off = notifications?.email_off;
  if (!Array.isArray(off)) return [];
  return EMAIL_CHOICE_KINDS.filter((k) => off.includes(k));
}
function topicEmailed(topic, notifications) {
  if (topic.email === null) return false;
  const off = emailOffOf(notifications);
  return topic.email === "always" || !topic.kinds.some((k) => off.includes(k));
}
function topicPushed(topic, pushOff) {
  return topic.phone && !topic.kinds.some((k) => pushOff.includes(k));
}
function withTopicEmail(notifications, topic, on) {
  const off = new Set(emailOffOf(notifications));
  if (topic.email === "choice") switchKinds(off, topic.kinds, on);
  return EMAIL_CHOICE_KINDS.filter((k) => off.has(k));
}
function switchKinds(off, kinds, on) {
  for (const k of kinds) {
    if (on) off.delete(k);
    else off.add(k);
  }
}
function withTopicPush(pushOff, topic, on) {
  const off = new Set(pushOff);
  if (topic.phone) switchKinds(off, topic.kinds, on);
  return ALERT_TOPICS.flatMap((t) => t.phone ? t.kinds : []).filter((k) => off.has(k));
}
var ALERT_PANE_WORDS = {
  where: "Where alerts reach you",
  whereSub: "The bell keeps everything. Choose what else reaches you below.",
  bell: "Bell",
  bellValue: `Everything below, for ${BELL_WINDOW_DAYS} days; the newest ${BELL_LIST_ROWS} are listed`,
  bellOn: "Always on",
  email: "Email",
  emailNobody: "Nobody yet",
  emailNobodyHint: "Until one is added, nobody is emailed when a customer needs a person.",
  emailMore: (n) => n === 1 ? "and 1 more" : `and ${n} more`,
  change: "Change",
  done: "Done",
  you: "you",
  notOnTeam: "Not on the team",
  onTeam: "On the team",
  addPlaceholder: "name@yourbusiness.com",
  addLabel: "Add an address to email",
  teammates: "Teammates not emailed:",
  emailFoot: `Each address gets what is ticked under Email. Up to ${ALERT_ADDRESSES_MAX}.`,
  test: "Send a test",
  testing: "Sending\u2026",
  testSent: (n) => n === 1 ? "A test was sent to 1 address." : `A test was sent to ${n} addresses.`,
  testNot: (why) => why === "no_address" ? "There is no address to send a test to." : why === "not_live" ? "Tests are sent from the live app only, not from a preview." : "The test could not be sent. Try again in a minute.",
  phone: (n) => n > 1 ? "Your phones" : "Your phone",
  phoneHint: "Signing out on a phone stops its alerts.",
  browser: "This browser",
  browserValue: "When someone needs you right now",
  browserHint: "While Chanlytics is open in a tab.",
  browserBlocked: "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on.",
  what: "What you're told about",
  whatSub: "Tick where else each one reaches you. Email is the business's; your phone is yours.",
  emailHead: "Email",
  emailHeadSub: "for the business",
  phoneHead: "Phone",
  phoneHeadSub: "yours",
  always: "Always emailed: the receptionist must always reach someone.",
  ownerChooses: "The owner chooses what the business is emailed.",
  addFirst: "Add an address to email first.",
  phoneTold: "Your phone is told this.",
  notEmailed: "Not sent by email.",
  notPushed: "Not sent to phones.",
  /** The bell's own line: what it holds that nothing else carries, and the topics that have nothing to choose here. */
  bellLine: (also) => {
    const all = [
      ...also,
      "people added from your calendar",
      "a booking that arrives",
      "a booking email that needs a look",
      "the day's reach-out numbers at 6 PM",
      "a problem with a line",
      "a teammate who joins or leaves",
      "invitations not yet accepted"
    ];
    return `Also on the bell: ${all.slice(0, -1).join(", ")}, and ${all[all.length - 1]}.`;
  },
  never: "Never sent: text messages, or a daily or weekly email. Today is your brief.",
  /** The address the alerts come from, said only where an operator set one (nothing in the app writes it). */
  sentFrom: (from) => `Sent from ${from}.`
};
function alertGrid(o) {
  const groups = ["needs_you", "worth_knowing", "for_you"];
  return groups.map((group) => ({
    group,
    title: ALERT_GROUP_TITLES[group],
    rows: ALERT_TOPICS.filter((t) => t.group === group && !bellOnly(t, !!o.phone)).map((topic) => ({
      topic,
      email: topic.email === "always" ? { kind: "always" } : topic.email === null ? { kind: "none" } : { kind: "tick", on: topicEmailed(topic, o.notifications), held: o.emailHeld },
      phone: !o.phone ? null : !topic.phone ? { kind: "none" } : o.phone.choosable ? { kind: "tick", on: topicPushed(topic, o.phone.pushOff), held: null } : { kind: "told" }
    }))
  })).filter((g) => g.rows.length > 0);
}
var bellOnly = (t, hasPhone) => t.email === null && !hasPhone;
function bellLineFor(hasPhone) {
  return ALERT_PANE_WORDS.bellLine(ALERT_TOPICS.filter((t) => bellOnly(t, hasPhone)).map((t) => t.onBell ?? t.title));
}
function phoneLine(p, now) {
  const what = p.platform === "ios" ? "iPhone" : "Android phone";
  const at = p.last_seen_at ? Date.parse(p.last_seen_at) : NaN;
  if (Number.isNaN(at)) return what;
  const ago = agoShort(at, now);
  return `${what} \xB7 ${ago === "now" ? "seen just now" : `seen ${ago} ago`}`;
}
export {
  ALERT_ADDRESSES_MIN,
  ALERT_PANE_WORDS,
  ALERT_REFUSED_WORDS,
  alertAddressesOf,
  alertGrid,
  bellLineFor,
  memberGetsAlerts,
  phoneLine,
  withAlertAddress,
  withTopicEmail,
  withTopicPush
};
