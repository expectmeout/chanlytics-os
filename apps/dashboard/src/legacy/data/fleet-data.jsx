/* global window */
// Chanlytics — Fleet seed data
// One record per installed agent: identity, live activity, today's numbers,
// per-decision permissions (the control-center core), guardrails, recent actions.
// Ids match Store template ids; names/glyphs match sidebar + dashboard.

const FLEET_ROSTER = [
  {
    id: "phone-rep", glyph: "P", name: "Phone Rep", status: "active",
    identity: "+1 (415) 555-0100 · main line",
    role: "Answers every call, books, reschedules, and knows when to ask you",
    since: "Nov 2025", price: 600,
    tone: "Empathetic · concise · books when possible",
    channels: ["phone", "sms"],
    activity: { verb: "On call", target: "Selena Cho", elapsed: "0:42" },
    pending: 2,
    today: { convos: 28, bookings: 7, revenue: 1840, conv: "25%" },
    spark: [12, 18, 15, 22, 19, 25, 24, 28, 26, 31, 29, 33, 30, 28],
    permissions: [
      { id: "money", label: "Refunds & credits", hint: "Aisha's refund is waiting on this rule", hintThread: "th-aisha-refund", value: "ask",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto ≤ $50" }, { v: "auto", label: "Full auto" }] },
      { id: "booking", label: "Booking & rescheduling", hint: "Core job — runs clean", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto for regulars" }, { v: "auto", label: "Full auto" }] },
      { id: "discount", label: "Discounts", hint: "List prices only — exceptions ask you", value: "ask",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto ≤ 10%" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: [{ label: "Complaints", threadId: "th-david-complaint" }, "Anything medical"],  // money lives in the locked policy rows — never restated here
    recent: [
      { at: "11:40", text: "Paused Aisha Khan's refund for your call", kind: "approval" },
      { at: "11:35", text: "Auto-rescheduled Maya Rodriguez Fri → Sat", kind: "done" },
      { at: "9:42", text: "Booked Maya Rodriguez · deep tissue 60 (+$280)", kind: "done" },
    ],
  },
  {
    id: "chat-agent", glyph: "I", name: "Chat Agent", status: "active",
    identity: "@serenityspa · Instagram",
    role: "Handles Instagram and web chat, escalates what it shouldn't touch",
    since: "Nov 2025", price: 400,
    tone: "Warm · brief · escalates partnerships",
    channels: ["instagram", "chat"],
    activity: { verb: "Drafting reply", target: "@marcus_lee", elapsed: "0:08" },
    pending: 1,
    today: { convos: 41, bookings: 4, revenue: 640, conv: "9.7%" },
    spark: [30, 35, 28, 40, 38, 44, 41, 39, 45, 42, 47, 44, 40, 41],
    permissions: [
      { id: "replies", label: "DM replies", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto for FAQs" }, { v: "auto", label: "Full auto" }] },
      { id: "booking", label: "Booking from chat", hint: "", value: "cap",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto for regulars" }, { v: "auto", label: "Full auto" }] },
      { id: "scope", label: "Out-of-scope topics", hint: "Partnerships, press, complaints", value: "ask",
        options: [{ v: "ask", label: "Escalate" }, { v: "cap", label: "Polite decline" }, { v: "auto", label: "Best judgment" }] },
    ],
    escalates: [{ label: "Partnerships", threadId: "th-wellness-partnership" }, "Complaints", "Press"],
    recent: [
      { at: "11:30", text: "Escalated @thewellness.co partnership to you", kind: "approval" },
      { at: "11:18", text: "Captured partnership inquiry from @thewellness.co", kind: "done" },
      { at: "10:05", text: "Answered pricing FAQ for @jess.moves", kind: "done" },
    ],
  },
  {
    id: "sms-agent", glyph: "S", name: "SMS Agent", status: "scheduled",
    identity: "+1 (415) 555-0107 · SMS",
    role: "Runs reminders, follow-ups, and offers over text",
    since: "Dec 2025", price: 300,
    tone: "Friendly · short · never pushy",
    channels: ["sms"],
    activity: { verb: "Scheduled", target: "Birthday offer · 5:00pm", elapsed: null },
    pending: 2,
    today: { convos: 9, bookings: 2, revenue: 220, conv: "22%" },
    spark: [8, 6, 9, 7, 10, 8, 11, 9, 12, 10, 9, 11, 8, 9],
    permissions: [
      { id: "reminders", label: "Appointment reminders", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, quiet hours" }, { v: "auto", label: "Full auto" }] },
      { id: "campaigns", label: "Offer campaigns", hint: "Birthday batch waiting on this rule", value: "ask",
        options: [{ v: "ask", label: "Review each" }, { v: "cap", label: "Auto ≤ 10 people" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Batches over 5 recipients", "Opt-out disputes"],  // matches the Outbound rule + the birthday batch of 8
    recent: [
      { at: "11:32", text: "Queued birthday offer to 8 clients for 5:00pm", kind: "scheduled" },
      { at: "10:14", text: "Sent pkg-expiry reminder to David Okafor", kind: "done" },
      { at: "9:20", text: "Confirmed today's 6 appointment reminders", kind: "done" },
    ],
  },
  {
    id: "review-bot", glyph: "R", name: "Review Bot", status: "scheduled",
    identity: "reviews@serenityspa.co",
    role: "Captures reviews at the high point, responds to every one",
    since: "Jan 2026", price: 250,
    tone: "Grateful · specific · in your voice",
    channels: ["sms", "mail"],
    activity: { verb: "Scheduled", target: "Maya R. review ask · tmrw 10:00am", elapsed: null },
    pending: 0,
    today: { convos: 6, bookings: 0, revenue: 0, conv: "—" },
    spark: [2, 4, 3, 5, 4, 6, 5, 7, 6, 5, 7, 6, 8, 6],
    permissions: [
      { id: "asks", label: "Review requests", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto after 5★ visit" }, { v: "auto", label: "Full auto" }] },
      { id: "responses", label: "Public responses", hint: "", value: "ask",
        options: [{ v: "ask", label: "Draft for review" }, { v: "cap", label: "Auto for 5★" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Any review under 4★"],
    recent: [
      { at: "10:00", text: "Drafted response to Sophie Martin's 5★ review", kind: "approval" },
      { at: "Yesterday", text: "Captured 2 new reviews (5★, 4★)", kind: "done" },
    ],
  },
  {
    id: "email-agent", glyph: "E", name: "Email Agent", status: "idle",
    identity: "hello@serenityspa.co · Gmail",
    role: "Drafts, nurtures, and qualifies over email",
    since: "Nov 2025", price: 350,
    tone: "Friendly · low-pressure · helpful",
    channels: ["mail"],
    activity: { verb: "Idle", target: "Last action 3m ago", elapsed: null },
    pending: 1,
    today: { convos: 12, bookings: 1, revenue: 360, conv: "8.3%" },
    spark: [10, 12, 9, 14, 11, 13, 12, 15, 13, 12, 14, 11, 13, 12],
    permissions: [
      { id: "nurture", label: "Nurture sequences", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, known leads" }, { v: "auto", label: "Full auto" }] },
      { id: "new", label: "New contacts", hint: "", value: "ask",
        options: [{ v: "ask", label: "Draft only" }, { v: "cap", label: "Auto after intro" }, { v: "auto", label: "Full auto" }] },
      { id: "pricing", label: "Pricing questions", hint: "Jordan's discount waited on this", hintThread: "th-jordan-discount", value: "cap",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, listed prices" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Custom packages"],  // discounts are charter money — the locked row owns it
    recent: [
      { at: "11:31", text: "Queued review request for Maya Rodriguez — sends tmrw 10:00am", kind: "done" },
      { at: "10:45", text: "Day-14 nurture opened by Noah Williams", kind: "done" },
      { at: "10:30", text: "Sent day-14 nurture to Noah Williams", kind: "done" },
    ],
  },
  {
    id: "qualifier", glyph: "Q", name: "Qualifier", status: "idle",
    identity: "internal — never contacts clients",
    role: "Sorts real leads from noise before they reach your pipeline",
    since: "Feb 2026", price: 250,
    tone: "Neutral · fast · invisible to clients",
    channels: ["chat", "mail"],
    activity: { verb: "Idle", target: "Waiting for new leads", elapsed: null },
    pending: 0,
    today: { convos: 18, bookings: 0, revenue: 0, conv: "—" },
    spark: [14, 16, 12, 18, 15, 20, 17, 19, 16, 21, 18, 17, 19, 18],
    permissions: [
      { id: "scoring", label: "Lead scoring", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto ≥ 70 score" }, { v: "auto", label: "Full auto" }] },
      { id: "routing", label: "Routing to agents", hint: "", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, hot leads" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Ambiguous high-value leads"],
    recent: [
      { at: "11:12", text: "Scored new IG lead 84/100 → routed to Phone Rep", kind: "done" },
      { at: "9:58", text: "Parked 3 low-intent leads in nurture", kind: "done" },
    ],
  },
  {
    id: "objection-coach", glyph: "O", name: "Objection Coach", status: "idle",
    identity: "internal — feeds other agents",
    role: "Steps in when price pushback appears, mid-conversation",
    since: "Mar 2026", price: 300,
    tone: "Calm · evidence-led · never discounts",
    channels: ["chat", "sms"],
    activity: { verb: "Standby", target: "Triggers on price pushback", elapsed: null },
    pending: 0,
    today: { convos: 4, bookings: 1, revenue: 180, conv: "25%" },
    spark: [3, 2, 4, 3, 5, 4, 3, 5, 4, 6, 4, 5, 3, 4],
    permissions: [
      { id: "suggest", label: "Suggesting lines", hint: "Feeds other agents, never clients", value: "auto",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, tested lines" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Repeated hard objections"],
    recent: [
      { at: "11:10", text: "Fed framing to Phone Rep on Jordan's discount ask", kind: "done" },
      { at: "Yesterday", text: "2 price objections converted to bookings", kind: "done" },
    ],
  },
  {
    id: "recovery-agent", glyph: "X", name: "Recovery Agent", status: "idle",
    identity: "hello@serenityspa.co · shared",
    role: "Wins back clients who quietly drift away",
    since: "Jan 2026", price: 400,
    tone: "Warm · low-pressure · offer-driven",
    channels: ["sms", "mail"],
    activity: { verb: "Idle", target: "3 cold leads queued", elapsed: null },
    pending: 1,
    today: { convos: 7, bookings: 0, revenue: 0, conv: "—" },
    spark: [5, 7, 6, 8, 6, 9, 7, 8, 6, 9, 8, 7, 8, 7],
    permissions: [
      { id: "winback", label: "Win-back sends", hint: "Elena's draft waits on this rule", hintThread: "th-elena-followup", value: "ask",
        options: [{ v: "ask", label: "Draft only" }, { v: "cap", label: "Auto ≤ 20% off" }, { v: "auto", label: "Full auto" }] },
      { id: "cadence", label: "Follow-up cadence", hint: "", value: "cap",
        options: [{ v: "ask", label: "Ask always" }, { v: "cap", label: "Auto, max 3 touches" }, { v: "auto", label: "Full auto" }] },
    ],
    escalates: ["Clients who ask to stop", "60+ day cold with no response"],
    recent: [
      { at: "11:32", text: "Drafted 30%-off win-back for Elena Park", kind: "approval" },
      { at: "10:00", text: "Paused Yuki Tanaka outreach until May 1 (her ask)", kind: "done" },
      { at: "9:15", text: "Flagged Amelia Brooks for your keep-or-archive call", kind: "approval" },
    ],
  },
];

const STATUS_META = {
  active:    { label: "Live",      rank: 0 },
  scheduled: { label: "Scheduled", rank: 1 },
  idle:      { label: "Idle",      rank: 2 },
};

window.FLEET_DATA = { FLEET_ROSTER, STATUS_META };

// =============== SESSION FLEET STORE ===============
// Live overrides for fleet controls, shared across surfaces (Fleet page,
// Inbox rail "train the agent"). Events: fleet:perms {agentId, permId, value},
// fleet:status {agentId, status}. See CLAUDE.md · Window contracts.
const FL_STORE = {
  perms: {},     // agentId -> { permId: value }
  statuses: {},  // agentId -> "paused" (absent = seed status)
  setPerm(agentId, permId, value) {
    this.perms[agentId] = { ...(this.perms[agentId] || {}), [permId]: value };
    window.dispatchEvent(new CustomEvent("fleet:perms", { detail: { agentId, permId, value } }));
  },
  getPerms(agentId) { return this.perms[agentId] || {}; },
  setStatus(agentId, status) {
    if (status == null) delete this.statuses[agentId];
    else this.statuses[agentId] = status;
    window.dispatchEvent(new CustomEvent("fleet:status", { detail: { agentId, status } }));
  },
  statusOf(agent) { return this.statuses[agent.id] || agent.status; },
  // Playbook pauses — session-scoped, survive navigation like perms do
  playbooks: {},   // pbId -> true (paused)
  setPbPaused(agentId, pbId, paused) {
    if (paused) this.playbooks[pbId] = true; else delete this.playbooks[pbId];
    window.dispatchEvent(new CustomEvent("fleet:playbooks", { detail: { agentId, pbId, paused } }));
  },
  isPbPaused(pbId) { return !!this.playbooks[pbId]; },
};
window.FL_STORE = FL_STORE;
