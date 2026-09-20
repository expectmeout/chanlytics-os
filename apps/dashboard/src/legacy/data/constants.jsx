/* global window */
// Chanlytics — shared contracts. Loads FIRST in the data layer.
// Canonical values live here and in CLAUDE.md — never fork thresholds,
// route strings, or agent identity in page code.

const CHANLY = {
  // ---- Confidence (0–1 float everywhere; see CLAUDE.md) ----
  CONF: { SAFE: 0.8, MED: 0.5 },
  isSafe(level) { return level >= this.CONF.SAFE; },
  confTone(level) { return level >= this.CONF.SAFE ? "high" : level >= this.CONF.MED ? "med" : "low"; },
  // dashboard-data AGENT_TASKS uses a 1–3 dot scale; map into the 0–1 contract
  confFromDots(n) { return n >= 3 ? 0.85 : n === 2 ? 0.65 : 0.4; },

  // ---- Seed clock ----
  IX_NOW: "12:04",
  SEED_TODAY: new Date(2026, 3, 26),
  WAIT_WARN_MIN: 30,

  // ---- Route builders (hash routes; always deep-link the entity) ----
  R: {
    segment: (id) => `segments/${id}`,
    client: (id) => `clients/${id}`,
    conversation: (id) => `conversations/${id}`,
    appt: (id) => `calendar/${id}`,
    clientSeg: (id) => `clients/seg:${id}`,
    thread: (id) => `inbox/${id}`,
    // A lead has no page of its own: Leads is a scope of People, and a lead opens in its peek there.
    lead: () => "clients/leads",
    agent: (id) => `fleet/${id}`,
    broadcast: (segId) => `broadcasts/${segId}`,
    admin: (pane) => `admin/${pane}`,
  },
  nav(route) { if (window.appNavigate) window.appNavigate(route); },

  // ---- Formatting ----
  fmtMoney(n) { return "$" + Math.round(n).toLocaleString(); },
  fmtDelta(n) {
    if (n === 0 || n == null) return "\u2014";
    return (n > 0 ? "+" : "\u2212") + "$" + Math.abs(Math.round(n)).toLocaleString();
  },
  fmtPct(x) { return Math.round(x * 100) + "%"; },

  // ---- Agent registry (FLEET_ROSTER is the source of truth) ----
  agents() { return (window.FLEET_DATA && window.FLEET_DATA.FLEET_ROSTER) || []; },
  agentById(id) { return this.agents().find((a) => a.id === id) || null; },
  agentByName(name) { return this.agents().find((a) => a.name === name) || null; },
  agentByGlyph(g) { return this.agents().find((a) => a.glyph === g) || null; },
  agentIdFor(name) {
    const a = this.agentByName(name);
    return a ? a.id : String(name || "").toLowerCase().replace(/\s+/g, "-");
  },

  // ---- Segment helpers (CLIENT_SEGMENTS + SEGMENT_META) ----
  seg(id) { return (window.CLIENT_SEGMENTS || []).find((s) => s.id === id) || null; },
  segsOf(personId, { lead = false } = {}) {
    const META = window.SEGMENT_META || {};
    return Object.keys(META)
      .filter((k) => ((META[k] || {}).members || []).some((m) => m.id === personId && !!m.lead === lead))
      .map((k) => this.seg(k))
      .filter(Boolean);
  },
  membersOf(segId) { return (((window.SEGMENT_META || {})[segId]) || {}).members || []; },

  // ---- Compliance (consent + DNC) ----
  // Absent from the registry = consented and clear; only exceptions are recorded.
  compliance(id) {
    const c = (window.COMPLIANCE || {})[id] || {};
    return { consent: c.consent || "granted", dnc: !!c.dnc, method: c.method || null, date: c.date || null };
  },
  canMessage(id) { const c = this.compliance(id); return c.consent === "granted" && !c.dnc; },
};

window.CHANLY = CHANLY;
