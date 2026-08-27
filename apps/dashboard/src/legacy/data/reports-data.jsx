/* global window */
// Chanlytics — Reports seed data
// Owner-first: revenue, agent attribution + return-per-credit, decisions.
// Numbers reconcile with the rest of the OS: $48.3k/mo at 78% utilization,
// Phone Rep as top earner, 44 agent asks this month.

const RP_RANGES = [
  { id: "7d",  label: "7 days"  },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

// Revenue series per range (smoothed daily totals)
const RP_SERIES = {
  "7d":  [2100, 2650, 1980, 2840, 3120, 2760, 3240],
  "30d": [1450, 1680, 1520, 1890, 1740, 2050, 1960, 2210, 1870, 2320, 2140, 2480, 2260, 2590,
          2380, 2710, 2520, 2860, 2640, 2980, 2760, 3050, 2870, 3140, 2960, 3240],
  "90d": [980, 1120, 1260, 1180, 1350, 1490, 1420, 1580, 1520, 1690, 1640, 1780, 1730, 1880,
          1820, 1960, 1910, 2050, 1990, 2140, 2080, 2230, 2170, 2320, 2260, 2410, 2360, 2500,
          2440, 2590, 2530, 2680, 2620, 2770, 2710, 2860, 2800, 2950, 2890, 3040, 2980, 3130, 3070, 3240],
};

// Headline stats per range
const RP_STATS = {
  "7d":  { revenue: 18690,  bookings: 47,  agentShare: "96%", asks: 11, approved: 10, auto: { sent: 143,  edited: 6,   caught: "9%"  } },
  "30d": { revenue: 48300,  bookings: 187, agentShare: "94%", asks: 44, approved: 41, auto: { sent: 590,  edited: 31,  caught: "11%" } },
  "90d": { revenue: 131400, bookings: 512, agentShare: "91%", asks: 129, approved: 118, auto: { sent: 1610, edited: 102, caught: "12%" } },
};

// Per-agent attribution (30d base; scaled by range factor in the page)
const RP_AGENTS = [
  { id: "phone-rep",      glyph: "P", name: "Phone Rep",      convos: 310,  bookings: 78,  conv: "25%",  revenue: 18400, credits: 600 },
  { id: "chat-agent",     glyph: "I", name: "Chat Agent",     convos: 430,  bookings: 42,  conv: "9.8%", revenue: 9600,  credits: 400 },
  { id: "sms-agent",      glyph: "S", name: "SMS Agent",      convos: 110,  bookings: 24,  conv: "22%",  revenue: 6800,  credits: 300 },
  { id: "email-agent",    glyph: "E", name: "Email Agent",    convos: 145,  bookings: 12,  conv: "8.3%", revenue: 5200,  credits: 350 },
  { id: "recovery-agent", glyph: "X", name: "Recovery Agent", convos: 85,   bookings: 16,  conv: "19%",  revenue: 4900,  credits: 400 },
  { id: "review-bot",     glyph: "R", name: "Review Bot",     convos: 156,  bookings: 0,   conv: "—",    revenue: 2100,  credits: 250, note: "referral-assisted" },
  { id: "objection-coach",glyph: "O", name: "Objection Coach",convos: 60,   bookings: 15,  conv: "25%",  revenue: 1300,  credits: 300, note: "assists" },
  { id: "qualifier",      glyph: "Q", name: "Qualifier",      convos: 460,  bookings: 0,   conv: "—",    revenue: 0,     credits: 250, note: "routing only" },
];

// Channel mix (share of booked revenue)
const RP_CHANNELS = [
  { id: "phone", label: "Phone",     icon: "phone",     pct: 38 },
  { id: "ig",    label: "Instagram", icon: "instagram", pct: 27 },
  { id: "sms",   label: "SMS",       icon: "chat",      pct: 19 },
  { id: "mail",  label: "Email",     icon: "mail",      pct: 16 },
];

// Decisions (your judgment layer, 30d)
const RP_DECISIONS = {
  asks: 44, approved: 41, declined: 3, medianResponse: "8m",
  notes: [
    "Booking auto-approval unlocked Apr 12 — Phone Rep earned it after 10 clean approvals",
    "Most-declined: discounts above 15% (2 of 3 declines)",
  ],
};

// ---- Trust digest (30d) — the numbers that earn or shrink autonomy ----
// byClass.reply mirrors RP_STATS["30d"].auto exactly (sums contract).
const RP_TRUST = {
  byClass: {
    faq:      { sent: 1240, edited: 12 },
    book:     { sent: 486,  edited: 9 },
    reply:    { sent: 590,  edited: 31 },
    reengage: { sent: 128,  edited: 11 },
    campaign: { sent: 64,   edited: 6 },
  },
  byAgent: {
    "phone-rep":      { sent: 178, edited: 6,  streak: 41, next: null },
    "sms-agent":      { sent: 184, edited: 4,  streak: 63, next: null },
    "chat-agent":     { sent: 121, edited: 12, streak: 9,  next: { need: 15, label: "Auto on FAQs" } },
    "email-agent":    { sent: 66,  edited: 6,  streak: 7,  next: { need: 10, label: "Veto on Re-engage" } },
    "recovery-agent": { sent: 41,  edited: 3,  streak: 18, next: null },
  },
};
window.TRUST = {
  cls(id) { return RP_TRUST.byClass[id] || null; },
  agent(id) { return RP_TRUST.byAgent[id] || null; },
  rate(t) { return t && t.sent ? Math.round((t.edited / t.sent) * 100) : 0; },
  // Canonical digest grammar — every surface renders trust through these two.
  // streak counts CLEAN APPROVALS in a row (not days); window is always 30d.
  line(t) { return t ? `${t.sent.toLocaleString()} auto-sent · ${t.streak} clean in a row` : null; },
  next(t) { return t && t.next ? `${Math.max(0, t.next.need - t.streak)} more to unlock ${t.next.label}` : null; },
};

window.REPORTS_DATA = { RP_TRUST, RP_RANGES, RP_SERIES, RP_STATS, RP_AGENTS, RP_CHANNELS, RP_DECISIONS };
