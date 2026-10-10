// src/realtime.ts
var EVERY = ["INSERT", "UPDATE", "DELETE"];
var INSERTS = ["INSERT"];
var INSERTS_AND_UPDATES = ["INSERT", "UPDATE"];
var WATCHED = [
  { table: "messages", events: INSERTS_AND_UPDATES },
  // arrivals, then a send's ticks and a failure written late: an update is told with its statuses (00327)
  { table: "conversations", events: EVERY },
  // the pause and snooze clocks, other tabs
  { table: "escalations", events: EVERY },
  // opened by the edge, resolved elsewhere
  { table: "calls", events: EVERY },
  // a call starting, each live turn, its end, its analysis: told with its statuses
  { table: "notifications", events: INSERTS },
  // an alert the edge kept: the bell repaints
  { table: "lines", events: EVERY },
  // a line's saga step, its failure, its answer, its release: Setup repaints
  { table: "google_listings", events: EVERY },
  // the listing linked, read, or removed: Setup and Reports repaint
  { table: "google_reviews", events: INSERTS },
  // a review seen for the first time
  { table: "billing_accounts", events: EVERY },
  // Stripe's answer, applied by the webhook: Billing and Setup repaint
  { table: "tenant_channels", events: EVERY },
  // a channel connected, switched off, or written by a line's saga: Setup and Connections repaint (00117)
  { table: "capability_activations", events: EVERY },
  // the owner's act, in another tab: Setup repaints (00108)
  { table: "business_records", events: EVERY },
  // the record the carriers read, saved on Connections: Setup repaints (00075)
  { table: "google_connections", events: EVERY },
  // the profile connected, synced or failing by the hourly sweep: Connections repaints (00070)
  { table: "sending_domains", events: EVERY },
  // a domain added, checked, verified, held or removed: Connections repaints (00175)
  // a round's page committed, a check landed, a class changed: the Leads scope repaints (00140)
  { table: "leads", events: EVERY },
  { table: "lead_searches", events: EVERY },
  { table: "lead_rounds", events: EVERY },
  { table: "lead_search_members", events: EVERY },
  // a deal recorded or moved by a teammate, or by a payment: People (and its Pipeline) repaints (00156, 0008)
  { table: "deals", events: EVERY },
  // a note written, a step set or done, or a note removed by a teammate: People's next steps and a person's page repaint (00157, 00166)
  { table: "person_notes", events: EVERY },
  // a list made, renamed, archived, or people put on and taken off by a teammate: People's rail repaints (00169)
  { table: "segments", events: EVERY },
  { table: "segment_members", events: EVERY },
  // a reply to a reach-out read, drafted or undone: the Inbox's strip and chip repaint (00222)
  { table: "reach_out_replies", events: EVERY },
  // a run made by the sweep, approved, stopped, sending or finished: Today's Approve and Stop rows and Campaigns
  // repaint (00321). Its people are not watched: a run's page reads them when it opens.
  { table: "broadcasts", events: EVERY },
  // a playbook paused, resumed, renamed or retimed by a teammate, or stamped by the sweep's run: Campaigns' rows and
  // their acts repaint (00376)
  { table: "playbooks", events: EVERY },
  // a booking that arrived by email written, moved or withdrawn by the booking_read job: the Calendar repaints (00345)
  { table: "appointments", events: EVERY }
];
function watchedTables() {
  return WATCHED.map((w) => w.table);
}
function watchedEvents() {
  return WATCHED.map((w) => ({ table: w.table, events: [...w.events] }));
}
var hearings = /* @__PURE__ */ new WeakMap();
function subscribeWorkspaceChanges(client, onChange, opts = {}) {
  const tenantId = opts.tenantId;
  if (!tenantId) return () => {
  };
  const topic = `workspace:${tenantId}:changes`;
  let byTopic = hearings.get(client);
  if (!byTopic) hearings.set(client, byTopic = /* @__PURE__ */ new Map());
  const heard = byTopic;
  let h = heard.get(topic);
  if (!h) {
    h = { listeners: /* @__PURE__ */ new Set(), channel: null, status: null, joining: null, leaving: Promise.resolve() };
    heard.set(topic, h);
  }
  const hearing = h;
  const listener = { onChange, onStatus: opts.onStatus };
  hearing.listeners.add(listener);
  const status = hearing.channel ? hearing.status : null;
  if (status) queueMicrotask(() => hearing.listeners.has(listener) && report(listener, topic, status));
  else if (!hearing.channel && !hearing.joining)
    hearing.joining = join(client, tenantId, topic, hearing, heard).catch(() => {
      hearing.joining = null;
      for (const l of [...hearing.listeners]) report(l, topic, "CHANNEL_ERROR");
    });
  let left = false;
  return () => {
    if (left) return;
    left = true;
    hearing.listeners.delete(listener);
    if (hearing.listeners.size || !hearing.channel) return;
    const channel = hearing.channel;
    hearing.channel = null;
    hearing.status = null;
    hearing.leaving = client.removeChannel(channel).then(
      () => void 0,
      () => void 0
    );
    void hearing.leaving.then(() => forget(heard, topic, hearing));
  };
}
async function join(client, tenantId, topic, hearing, heard) {
  await hearing.leaving;
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (token) await client.realtime.setAuth(token);
  hearing.joining = null;
  if (!hearing.listeners.size) return forget(heard, topic, hearing);
  const channel = client.channel(topic, { config: { private: true } }).on("broadcast", { event: "*" }, (message) => tell(hearing, tenantId, message));
  hearing.channel = channel;
  channel.subscribe((status) => {
    if (hearing.channel !== channel) return;
    hearing.status = status;
    for (const listener of [...hearing.listeners]) report(listener, topic, status);
  });
}
function forget(heard, topic, hearing) {
  if (hearing.listeners.size || hearing.channel || hearing.joining || heard.get(topic) !== hearing) return;
  heard.delete(topic);
}
function report(listener, topic, status) {
  if (listener.onStatus) listener.onStatus(status);
  else if (status !== "SUBSCRIBED") console.warn("realtime_status", topic, status);
}
function tell(hearing, tenantId, message) {
  const notice = message.payload ?? {};
  if (typeof notice.table !== "string") return;
  const table = notice.table;
  const event = message.event ?? "*";
  const statuses = Array.isArray(notice.statuses) ? notice.statuses : [void 0];
  for (const listener of [...hearing.listeners])
    for (const status of statuses)
      listener.onChange({ tenant_id: tenantId, ...typeof status === "string" ? { status } : {} }, table, event);
}
export {
  subscribeWorkspaceChanges,
  watchedEvents,
  watchedTables
};
