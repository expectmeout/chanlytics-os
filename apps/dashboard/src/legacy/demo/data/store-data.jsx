/* global window */
// Chanlytics — Agent Store seed data
// Templates are "hires": each has abilities (channels + skills), an autonomy
// default, a concrete outcome proof line, and install requirements.
// Installed ones mirror the live fleet so Store ↔ Fleet ↔ Sidebar agree.

const STORE_CATEGORIES = [
  { id: "all",        label: "All" },
  { id: "frontdesk",  label: "Front desk" },
  { id: "sales",      label: "Sales" },
  { id: "retention",  label: "Retention" },
  { id: "comms",      label: "Comms" },
  { id: "backoffice", label: "Back office" },
];

const STORE_TEMPLATES = [
  // ---------- Available (new abilities) ----------
  {
    id: "noshow-shield", glyph: "N", name: "No-show Shield", category: "frontdesk",
    role: "Runs deposits and smart reminders so no-shows stop costing you",
    installed: false, price: 400,
    recommended: true,
    recoReason: "2 no-shows this week cost you ~$240 — including the refund decision sitting in your Inbox.",
    abilities: { channels: ["sms", "phone"], skills: ["Deposit policy", "Smart reminders", "Rebooking"] },
    proof: "Cuts no-shows 41% for studios like yours",
    installs: "312 installs",
    autonomyDefault: "Asks before charging a deposit",
    requires: ["Booking calendar", "Payment processor"],
    bullets: [
      "Applies a deposit policy you set — first offense gentle, repeat offenders firmer",
      "Times reminders to each client's reply history, not a fixed schedule",
      "Offers the slot to your waitlist the moment someone cancels late",
    ],
  },
  {
    id: "waitlist-filler", glyph: "W", name: "Waitlist Filler", category: "frontdesk",
    role: "Fills cancellations from your waitlist before the gap hurts",
    installed: false, price: 300,
    abilities: { channels: ["sms"], skills: ["Waitlist", "Slot matching", "Confirmations"] },
    proof: "Fills 7 of 10 cancellations within 2 hours",
    installs: "540 installs",
    autonomyDefault: "Auto-offers, asks before double-booking",
    requires: ["Booking calendar"],
    bullets: [
      "Keeps a live waitlist per service and therapist",
      "Texts best-match clients the moment a slot opens",
      "Confirms and books without you touching the calendar",
    ],
  },
  {
    id: "membership-upseller", glyph: "M", name: "Membership Upseller", category: "sales",
    role: "Converts your regulars into members at the right moment",
    installed: false, price: 450,
    abilities: { channels: ["sms", "mail"], skills: ["Timing model", "Offers", "Plan math"] },
    proof: "+$480/mo avg from regulars → members",
    installs: "428 installs",
    autonomyDefault: "Asks before offering custom pricing",
    requires: ["Membership plans"],
    bullets: [
      "Spots the visit cadence where membership beats singles — then makes the case",
      "Shows each client their own math: what they spent vs what they'd save",
      "Hands negotiation to you the moment someone counters",
    ],
  },
  {
    id: "referral-engine", glyph: "F", name: "Referral Engine", category: "retention",
    role: "Turns happy clients into introductions, without feeling like a program",
    installed: false, price: 350,
    abilities: { channels: ["sms", "mail"], skills: ["Moment detection", "Reward tracking"] },
    proof: "1 in 4 happy clients sends a friend",
    installs: "389 installs",
    autonomyDefault: "Auto after a 5-star moment, asks otherwise",
    requires: ["SMS or email channel"],
    bullets: [
      "Asks for the referral right after a five-star moment — never cold",
      "Tracks who sent whom and applies rewards on both sides",
      "Feeds new referrals straight to your Qualifier",
    ],
  },
  {
    id: "bookkeeper", glyph: "B", name: "Bookkeeper", category: "backoffice",
    role: "Chases invoices politely and keeps your money moving",
    installed: false, price: 500,
    abilities: { channels: ["mail"], skills: ["Invoice chasing", "Reconciliation", "Weekly summary"] },
    proof: "Gets you paid 9 days faster on average",
    installs: "271 installs",
    autonomyDefault: "Asks before any discount or write-off",
    requires: ["Payments account"],
    bullets: [
      "Sends the awkward payment reminders so you never have to",
      "Escalates tone gradually — friendly nudge to firm notice, your call at the edge",
      "Drops a Friday summary of cash in, cash due, and who's late",
    ],
  },
  {
    id: "feedback-analyst", glyph: "A", name: "Feedback Analyst", category: "backoffice",
    role: "Reads every review and complaint, hands you the pattern",
    installed: false, price: 250,
    abilities: { channels: ["mail"], skills: ["Review synthesis", "Trend detection", "Weekly brief"] },
    proof: "Turns reviews + complaints into a weekly brief",
    installs: "195 installs",
    autonomyDefault: "Read-only — never contacts clients",
    requires: ["Review sites connected"],
    bullets: [
      "Clusters what clients praise and what they quietly complain about",
      "Flags a therapist or service trending down before it costs you",
      "One brief a week — no dashboards to check",
    ],
  },

  // ---------- Installed (your current fleet) ----------
  {
    id: "phone-rep", glyph: "P", name: "Phone Rep", category: "frontdesk",
    role: "Answers every call, books, reschedules, and knows when to ask you",
    installed: true, price: 600,
    abilities: { channels: ["phone", "sms"], skills: ["Booking", "Rescheduling", "Refund triage"] },
    proof: "Your top earner — $1,840 revenue today",
    installs: "2.1k installs",
    autonomyDefault: "Asks before $100+",
    requires: ["Phone line", "Booking calendar"],
    bullets: ["Answers and books around the clock", "Handles reschedules end-to-end", "Pauses money decisions for you"],
  },
  {
    id: "sms-agent", glyph: "S", name: "SMS Agent", category: "frontdesk",
    role: "Runs reminders, follow-ups, and offers over text",
    installed: true, price: 300,
    abilities: { channels: ["sms"], skills: ["Reminders", "Offers", "Follow-ups"] },
    proof: "22% conversion on offer sends",
    installs: "1.8k installs",
    autonomyDefault: "Auto for routine, asks for campaigns",
    requires: ["SMS number"],
    bullets: ["Reminders tuned per client", "Queues offer campaigns for review", "Follows up on quiet threads"],
  },
  {
    id: "chat-agent", glyph: "I", name: "Chat Agent", category: "comms",
    role: "Handles Instagram and web chat, escalates what it shouldn't touch",
    installed: true, price: 400,
    abilities: { channels: ["instagram", "chat"], skills: ["DM triage", "FAQ", "Escalation"] },
    proof: "41 conversations handled today",
    installs: "1.6k installs",
    autonomyDefault: "Triage only — hands off sensitive topics",
    requires: ["Instagram account"],
    bullets: ["Answers DMs in your voice", "Books straight from chat", "Escalates partnerships and complaints"],
  },
  {
    id: "email-agent", glyph: "E", name: "Email Agent", category: "comms",
    role: "Drafts, nurtures, and qualifies over email",
    installed: true, price: 350,
    abilities: { channels: ["mail"], skills: ["Nurture", "Qualification", "Drafting"] },
    proof: "8.3% conversion on nurture sequences",
    installs: "1.4k installs",
    autonomyDefault: "Drafts for review on new contacts",
    requires: ["Email inbox"],
    bullets: ["Runs day-N nurture sequences", "Qualifies inbound leads", "Drafts replies for your approval"],
  },
  {
    id: "qualifier", glyph: "Q", name: "Qualifier", category: "sales",
    role: "Sorts real leads from noise before they reach your pipeline",
    installed: true, price: 250,
    abilities: { channels: ["chat", "mail"], skills: ["Lead scoring", "Intent detection"] },
    proof: "84/100 avg lead-score accuracy",
    installs: "980 installs",
    autonomyDefault: "Fully autonomous — read-only on clients",
    requires: [],
    bullets: ["Scores every new lead", "Routes hot ones to Phone Rep", "Parks the rest in nurture"],
  },
  {
    id: "objection-coach", glyph: "O", name: "Objection Coach", category: "sales",
    role: "Steps in when price pushback appears, mid-conversation",
    installed: true, price: 300,
    abilities: { channels: ["chat", "sms"], skills: ["Objection handling", "Offer framing"] },
    proof: "25% of price objections still book",
    installs: "610 installs",
    autonomyDefault: "Suggests lines, agents decide",
    requires: [],
    bullets: ["Detects hesitation in live threads", "Feeds agents the right framing", "Never discounts on its own"],
  },
  {
    id: "recovery-agent", glyph: "X", name: "Recovery Agent", category: "retention",
    role: "Wins back clients who quietly drift away",
    installed: true, price: 400,
    abilities: { channels: ["sms", "mail"], skills: ["Win-back", "Cohort offers"] },
    proof: "42% return rate on win-back sends",
    installs: "890 installs",
    autonomyDefault: "Drafts only — you approve every send",
    requires: [],
    bullets: ["Watches for 30+ day inactivity", "Personalizes the return offer", "Knows when to stop asking"],
  },
  {
    id: "review-bot", glyph: "R", name: "Review Bot", category: "retention",
    role: "Captures reviews at the high point, responds to every one",
    installed: true, price: 250,
    abilities: { channels: ["sms", "mail"], skills: ["Review capture", "Response drafting"] },
    proof: "3× more reviews in the first month",
    installs: "1.1k installs",
    autonomyDefault: "Auto-asks, drafts responses for review",
    requires: ["Review sites connected"],
    bullets: ["Asks right after a great visit", "Drafts responses in your voice", "Flags bad reviews immediately"],
  },
];

// ---------- Community listings — external agents connected via A2A ----------
// Plain-English capability badges derived from each agent's card.
// Protocol names never appear on consumer surfaces; Studio is the exception.
const CAP_META = {
  streams:    "Streams live",
  interrupts: "Asks before acting",
  state:      "Syncs state",
  handoff:    "Hands off to your fleet",
  push:       "Pushes updates",
};

STORE_TEMPLATES.push(
  {
    id: "tax-scout", glyph: "T", name: "Tax Ledger Scout", category: "backoffice",
    role: "Keeps your books tax-ready and flags deductions you'd miss",
    installed: false, price: 350,
    external: true, publisher: "Ledgerly Labs", verified: true,
    endpoint: "agents.ledgerly.dev/tax-scout", auth: "OAuth 2 · read-only scopes",
    dataOut: "Invoice totals and payout dates — never client contact info",
    caps: ["streams", "state", "push"],
    abilities: { channels: ["mail"], skills: ["Deduction sweep", "Quarterly estimates", "Books check"] },
    proof: "Closes quarters 6 days faster", installs: "214 installs",
    autonomyDefault: "Read-only — drafts filings, never submits",
    requires: ["Payments account"],
    bullets: [
      "Sweeps expenses monthly and flags likely deductions with the receipt attached",
      "Drafts quarterly estimates from real cash flow, not last year's guess",
      "Everything lands as a draft — nothing files without you",
    ],
  },
  {
    id: "giftcard-concierge", glyph: "G", name: "Gift Card Concierge", category: "sales",
    role: "Sells, delivers, and tracks gift cards without touching your calendar",
    installed: false, price: 300,
    external: true, publisher: "Studio Atlas", verified: true,
    endpoint: "a2a.studioatlas.app/giftcards", auth: "Signed requests · workspace key",
    dataOut: "Recipient name & email, for delivery only",
    caps: ["streams", "interrupts", "handoff"],
    abilities: { channels: ["sms", "mail"], skills: ["Gift card sales", "Delivery timing", "Balance tracking"] },
    proof: "+$310/mo avg in gift card revenue", installs: "168 installs",
    autonomyDefault: "Auto-delivers paid cards, asks on refunds",
    requires: ["Payment processor"],
    bullets: [
      "Handles the whole gift-card conversation — amount, message, delivery date",
      "Hands redemption bookings to your Phone Rep the moment a card is used",
      "Tracks balances and nudges unused cards before they're forgotten",
    ],
  },
  {
    id: "insurance-verifier", glyph: "V", name: "Insurance Verifier", category: "backoffice",
    role: "Verifies massage coverage and claim codes before the visit",
    installed: false, price: 250,
    external: true, publisher: "Clearform", verified: false,
    endpoint: "api.clearform.io/a2a", auth: "API key",
    dataOut: "Client name & policy number, one verification at a time — each one you approve",
    caps: ["interrupts"],
    abilities: { channels: ["mail"], skills: ["Coverage checks", "Claim codes", "Superbills"] },
    proof: "New publisher — no track record yet", installs: "31 installs",
    autonomyDefault: "Asks before every verification",
    requires: ["Client intake forms"],
    bullets: [
      "Checks coverage against the client's plan before you hold the slot",
      "Produces the right claim code and a superbill your client can submit",
      "Asks permission per verification — it never batch-reads your book",
    ],
  }
);

// First-party defaults: Chanlytics-published, full native capability set.
STORE_TEMPLATES.forEach(t => {
  if (!t.publisher) { t.publisher = "Chanlytics"; t.firstParty = true; }
  if (!t.caps) t.caps = ["streams", "interrupts", "state"];
});

// ---------- Your listings — agents you connected and published ----------
const STORE_LISTINGS = [
  {
    id: "lst-afterhours", name: "After-hours Answerer",
    role: "Overflow voicemail → booked appointments overnight",
    status: "listed", installs: 3, listedOn: "Apr 12",
    endpoint: "agents.rjcapital.dev/afterhours", price: 200,
    accrued: 208, // sum of per-workspace accruals below (pro-rated by install date)
    // Publishers see anonymized workspaces: category + region, never names.
    // credits = your 80% share of 200/mo; accruedCr pro-rated from `since`.
    workspaces: [
      { id: "ws-1", label: "Med-spa · Austin, TX", since: "Apr 14", status: "active", tasksMo: 46, shareMo: 160, accruedCr: 91 },
      { id: "ws-2", label: "Massage studio · Portland, OR", since: "Apr 18", status: "active", tasksMo: 31, shareMo: 160, accruedCr: 69 },
      { id: "ws-3", label: "Wellness clinic · Chicago, IL", since: "Apr 22", status: "paused", pausedWhy: "budget cap hit — resumes May 1", tasksMo: 12, shareMo: 160, accruedCr: 48 },
    ],
  },
];

// Publisher-side payout terms — one source for all earnings math (80% share).
const STORE_PAYOUT = { rate: 0.8, method: "Bank ····4821", schedule: "monthly on the 1st", nextOn: "May 1", usdPerCredit: 0.10 };

// Review checklist every submitted listing walks through, in order.
// "warn" passes with a note — review edits copy, it doesn't reject for it.
const STORE_REVIEW_CHECKS = [
  { id: "schema", label: "Agent card valid — schema OK, version pinned" },
  { id: "reach", label: "Endpoint answers from the review sandbox — 210ms" },
  { id: "caps", label: "Capabilities verified — streaming and ask-first honored" },
  { id: "kill", label: "Kill-switch drill — disconnect revokes cleanly" },
  { id: "copy", label: "Listing copy review", warnNote: "role line trimmed for clarity — passed" },
];

// =============== SESSION AGENT-PLATFORM STORE ===============
// AS_STORE — session installs, connections, and listings.
// Fleet write-through: every install / connect / publish pushes a real
// FLEET_ROSTER entry so Store ↔ Studio ↔ Fleet stay truthful.
const asFleetEntry = ({ id, glyph, name, role, price, channels, identity, autonomyLabel, sourceLine, connection }) => ({
  id, glyph, name, status: "scheduled",
  connection: connection || null,
  identity: identity || "provisioning · first sync",
  role, since: "Apr 2026", price,
  tone: "Inherits workspace voice",
  channels: channels || [],
  activity: { verb: "Provisioning", target: sourceLine, elapsed: null },
  pending: 0,
  today: { convos: 0, bookings: 0, revenue: 0, conv: "—" },
  spark: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  permissions: [
    { id: "all", label: "Every consequential action", hint: autonomyLabel || "Ships ask-first", value: "ask",
      options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto for routine" }, { v: "auto", label: "Full auto" }] },
  ],
  escalates: ["Everything, until you loosen it"],
  recent: [{ at: "12:04", text: sourceLine, kind: "done" }],
});

// Review runner — shared by first submission and resubmission. The copy check
// rejects overclaims deterministically: superlatives need evidence.
const ST_OVERCLAIM = /\b(best|#1|guaranteed|perfect|instant)\b/i;
const runListingReview = (l) => {
  l.review = STORE_REVIEW_CHECKS.map(c => ({ ...c, state: "pending" }));
  l.rejectReason = null;
  const ping = () => window.dispatchEvent(new CustomEvent("store:listing", { detail: { id: l.id } }));
  let i = 0;
  const step = () => {
    if (l.status !== "submitted") return; // unlisted/removed mid-review
    if (i < l.review.length) {
      const c = l.review[i];
      const claim = c.id === "copy" && ST_OVERCLAIM.exec(`${l.name} ${l.role || ""}`);
      if (claim) {
        c.state = "fail";
        l.status = "rejected";
        l.rejectReason = `Overclaim in listing copy — "${claim[0]}" needs evidence behind it. Soften the claim and resubmit; everything else passed.`;
        ping();
        return;
      }
      c.state = c.warnNote ? "warn" : "ok";
      i += 1;
      ping();
      setTimeout(step, 850);
    } else {
      l.status = "listed";
      ping();
    }
  };
  setTimeout(step, 700);
};

const AS_STORE = {
  entry: asFleetEntry,
  _installed: new Set(STORE_TEMPLATES.filter(t => t.installed).map(t => t.id)),
  _added: [],
  isInstalled(id) { return this._installed.has(id); },
  installedIds() { return [...this._installed]; },
  addedCount() { return this._added.length; },
  addToFleet(entry) {
    window.FLEET_DATA.FLEET_ROSTER.push(entry);
    this._added.push(entry.id);
    window.dispatchEvent(new CustomEvent("store:installed", { detail: { agentId: entry.id } }));
    // Studio-connected agents (they carry a handoff map) demonstrate the map
    // live: one scripted handoff fires ~14s after they join the fleet.
    if (window.__DEMO_MODE && entry.connection && entry.connection.handoffs) {
      setTimeout(() => {
        if (!window.FLEET_DATA.FLEET_ROSTER.some(a => a.id === entry.id)) return; // disconnected meanwhile
        this.emitHandoff({
          agentId: entry.id, agentName: entry.name, glyph: entry.glyph,
          kind: "Reorder approval", route: entry.connection.routeApproval || "your Inbox",
          target: "Massage oil + 2 more low",
          result: "Found 3 items low; reorder drafts attached — routed per your handoff map.",
          recentLine: "Handoff emitted — reorder approval → " + (entry.connection.routeApproval || "your Inbox"),
        });
      }, 14000);
    }
  },
  _handoffs: [],
  handoffs() { return this._handoffs; },
  emitHandoff(h) {
    if (this._handoffs.some(x => x.agentId === h.agentId)) return; // one per agent per session
    this._handoffs.push(h);
    // Write through to the roster card — pending count, activity, recent line
    const a = window.FLEET_DATA.FLEET_ROSTER.find(x => x.id === h.agentId);
    if (a) {
      a.pending = (a.pending || 0) + 1;
      a.activity = { verb: "Waiting on you", target: h.kind, elapsed: null };
      a.recent = [{ at: "12:05", text: h.recentLine, kind: "approval" }, ...(a.recent || [])];
    }
    window.dispatchEvent(new CustomEvent("fleet:handoff", { detail: { agentId: h.agentId, kind: h.kind, route: h.route } }));
  },
  install(t, autonomyLabel) {
    if (this._installed.has(t.id)) return;
    this._installed.add(t.id);
    this.addToFleet(asFleetEntry({
      id: t.id, glyph: t.glyph, name: t.name, role: t.role, price: t.price,
      channels: t.abilities.channels,
      identity: t.external ? `${t.endpoint} · A2A` : undefined,
      autonomyLabel: autonomyLabel || t.autonomyDefault,
      sourceLine: t.external ? `Connected from the Agent Store · by ${t.publisher}` : "Installed from the Agent Store",
      connection: t.external ? {
        publisher: t.publisher, verified: t.verified, endpoint: t.endpoint, auth: t.auth,
        dataOut: t.dataOut, since: "12:04",
      } : null,
    }));
  },
  uninstall(id) {
    this._installed.delete(id);
    this._added = this._added.filter(x => x !== id);
    const r = window.FLEET_DATA.FLEET_ROSTER;
    const i = r.findIndex(a => a.id === id);
    if (i >= 0) r.splice(i, 1);
    window.dispatchEvent(new CustomEvent("store:installed", { detail: { agentId: id } }));
  },
  listings() { return STORE_LISTINGS; },
  addListing(l) {
    STORE_LISTINGS.unshift(l);
    window.dispatchEvent(new CustomEvent("store:listing", { detail: { id: l.id } }));
    runListingReview(l);
  },
  resubmitListing(id, patch) {
    const l = STORE_LISTINGS.find(x => x.id === id);
    if (!l) return;
    Object.assign(l, patch);
    l.status = "submitted";
    window.dispatchEvent(new CustomEvent("store:listing", { detail: { id } }));
    runListingReview(l);
  },
  removeListing(id) {
    const i = STORE_LISTINGS.findIndex(x => x.id === id);
    if (i >= 0) STORE_LISTINGS.splice(i, 1);
    window.dispatchEvent(new CustomEvent("store:listing", { detail: { id } }));
  },
  setListingStatus(id, status) {
    const l = STORE_LISTINGS.find(x => x.id === id);
    if (l) { l.status = status; window.dispatchEvent(new CustomEvent("store:listing", { detail: { id } })); }
  },
};
window.AS_STORE = AS_STORE;

// ---------- Publisher profiles ----------
// Keyed by the publisher string on each template. Verified = identity
// confirmed + endpoint security review passed. Numbers stay derivable.
const STORE_PUBLISHERS = {
  "Chanlytics": {
    id: "chanlytics", firstParty: true, verified: true, since: "2024",
    tagline: "First-party agents — built, run, and supported by the platform",
    verifiedLine: "Platform publisher — runs inside your workspace, no data leaves",
    sla: "Platform SLA · 99.95% · status.chanlytics.app",
    region: "Your workspace region",
    support: "Included in your plan — ask from any page",
    revshare: "Included in platform pricing — no separate billing",
  },
  "Ledgerly Labs": {
    id: "ledgerly-labs", verified: true, since: "Sep 2025",
    tagline: "Back-office agents for money-adjacent work",
    verifiedLine: "Verified Feb 2026 — identity confirmed, endpoint security review passed",
    sla: "99.9% published SLA · 2 incidents in 90 days, both post-mortemed",
    region: "US-East · SOC 2 Type II",
    support: "support@ledgerly.dev · answers in ~4h",
    revshare: "80/20 revenue share (publisher/platform) — billed through your credits, refunded pro-rata on uninstall",
  },
  "Studio Atlas": {
    id: "studio-atlas", verified: true, since: "Jan 2026",
    tagline: "Revenue agents for studios and salons",
    verifiedLine: "Verified Mar 2026 — identity confirmed, endpoint security review passed",
    sla: "99.9% published SLA · clean last 90 days",
    region: "US-West",
    support: "help@studioatlas.app · answers in ~1 day",
    revshare: "80/20 revenue share (publisher/platform) — billed through your credits, refunded pro-rata on uninstall",
  },
  "Clearform": {
    id: "clearform", verified: false, since: "Mar 2026",
    tagline: "Insurance paperwork, automated",
    verifiedLine: null,
    sla: "No published SLA yet",
    region: "US-East",
    support: "founders@clearform.io",
    revshare: "80/20 revenue share (publisher/platform) — billed through your credits, refunded pro-rata on uninstall",
  },
};

// ---------- Ratings & reviews ----------
// Only workspaces that ran an agent 30+ days can rate; publishers can't edit
// or hide reviews. Reviewers are anonymized the same way listing stats are.
const ST_RATINGS = {
  "noshow-shield": [4.7, 96], "waitlist-filler": [4.6, 152], "membership-upseller": [4.4, 88],
  "referral-engine": [4.5, 101], "bookkeeper": [4.6, 74], "feedback-analyst": [4.3, 41],
  "tax-scout": [4.8, 52], "giftcard-concierge": [4.5, 38], "insurance-verifier": [4.2, 9],
  "phone-rep": [4.8, 540], "sms-agent": [4.6, 402], "chat-agent": [4.5, 366], "email-agent": [4.4, 310],
  "qualifier": [4.7, 205], "objection-coach": [4.3, 118], "recovery-agent": [4.6, 186], "review-bot": [4.7, 254],
};
const ST_REVIEWS = {
  "noshow-shield": [
    { who: "Pilates studio · Denver, CO", when: "Mar 2026", stars: 5, usage: "7 months · 412 tasks", text: "No-shows went from 6 a week to 1. The deposit ask is politer than I ever managed to be." },
    { who: "Med-spa · Austin, TX", when: "Jan 2026", stars: 4, usage: "4 months · 203 tasks", text: "Works. Docked a star because a waitlist offer fired at 7am once — before I set quiet hours. My fault, but the default should be safer." },
  ],
  "tax-scout": [
    { who: "Massage collective · Portland, OR", when: "Feb 2026", stars: 5, usage: "5 months · 96 tasks", text: "Caught $3.1k of deductions our bookkeeper missed. Drafts only — it never files, which is exactly why I trust it." },
    { who: "Wellness clinic · Chicago, IL", when: "Apr 2026", stars: 4, usage: "2 months · 31 tasks", text: "Quarterly estimate came in within $40 of our accountant's. The read-only scopes are what sold me." },
  ],
  "insurance-verifier": [
    { who: "Sports-massage studio · Boise, ID", when: "Apr 2026", stars: 4, usage: "1 month · 22 tasks", text: "Verifications come back right. Approving each one is friction — but from a new publisher, honestly the right default." },
  ],
};
STORE_TEMPLATES.forEach(t => {
  const r = ST_RATINGS[t.id];
  if (r) t.rating = { avg: r[0], count: r[1] };
  if (ST_REVIEWS[t.id]) t.reviews = ST_REVIEWS[t.id];
});

window.STORE_DATA = { STORE_CATEGORIES, STORE_TEMPLATES, CAP_META, STORE_LISTINGS, STORE_PUBLISHERS, STORE_PAYOUT, STORE_REVIEW_CHECKS };
