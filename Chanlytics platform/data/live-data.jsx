/* global window */
// Chanlytics — Live Monitoring seed data
// Modeled on our Retell backend: live calls support Live Listen, Take Over,
// End Call, and runtime context injection (update-live-call: additional_context
// + trigger_response). Transcript lines may carry an emotion tag.

const LIVE_CALLS = [
  {
    id: "lc-selena",
    cvId: "cv-selena-live",
    live: true,
    startedAt: "11:41 AM",
    date: "Apr 26 · 11:41:12",
    type: "Phone · inbound",
    from: "Selena Cho",
    fromNumber: "+1 (415) 555-0132",
    agent: { glyph: "P", name: "Phone Rep" },
    callId: "call_a4441234567890777c4a4a123e6",
    durationSec: 42,
    clientId: null,
    transcript: [
      { role: "agent",  text: "Serenity Spa, this is the booking line — how can I help?" },
      { role: "client", text: "Hi! I'd like a Swedish massage today if you have anything." },
      { role: "agent",  tone: "warm", text: "We have 11:30 with Lena for a 60-minute. Shall I hold it for you?" },
      { role: "client", text: "Yes, 11:30 today works. Do you take walk-in add-ons like the scalp treatment?" },
      { role: "agent",  tone: "helpful", text: "We do — it's $40 for 15 minutes. I can note it so Lena plans the time…" },
    ],
  },
  {
    id: "lc-aisha",
    live: false,
    startedAt: "11:38 AM",
    date: "Apr 26 · 11:38:41",
    type: "Phone · inbound",
    from: "Aisha Khan",
    fromNumber: "+1 (628) 555-0198",
    agent: { glyph: "P", name: "Phone Rep" },
    callId: "call_b7719876543210444d8b8b456f2",
    durationSec: 124,
    clientId: "c-aisha",
    conversationNote: "Refund request — paused for your approval in Inbox.",
  },
  {
    id: "lc-maya",
    live: false,
    startedAt: "9:42 AM",
    date: "Apr 26 · 9:42:07",
    type: "Phone · inbound",
    from: "Maya Rodriguez",
    fromNumber: "+1 (510) 555-0114",
    agent: { glyph: "P", name: "Phone Rep" },
    callId: "call_c2235550001112223e9c9c789a1",
    durationSec: 201,
    clientId: "c-maya",
    conversationNote: "Booked deep tissue 60 (+$280) — referral mentioned.",
  },
];

window.LIVE_DATA = { LIVE_CALLS };

// =============== SESSION LIVE-CALL STORE ===============
// Calls ended from the Live Monitor flip their Conversations record too.
// Event: live:ended {callId, cvId}. See CLAUDE.md · Window contracts.
const LM_STORE = {
  ended: {},   // callId -> true; cvIds -> true (both keyed for cheap lookups)
  end(callId, cvId) {
    this.ended[callId] = true;
    if (cvId) this.ended[cvId] = true;
    window.dispatchEvent(new CustomEvent("live:ended", { detail: { callId, cvId } }));
  },
  isEnded(id) { return !!this.ended[id]; },
};
window.LM_STORE = LM_STORE;
