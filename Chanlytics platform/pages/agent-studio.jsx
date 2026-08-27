/* global React, Icon, StatStrip, StatCell */
// Chanlytics — Agent Studio
// Two modes. Compose: build a native agent from abilities + voice + autonomy.
// Connect: bring an external agent in via A2A — fetch its agent card, map
// permissions, prove the handshake on the test bench, then add to Fleet and
// optionally publish to the Store. The test bench is the ONE place raw
// protocol (event traces) is visible in the product.

const { useState: useSdState, useEffect: useSdEffect, useRef: useSdRef } = React;

const SD_SKILLS = ["Booking", "Reschedules", "Refund triage", "FAQ answers", "Lead scoring", "Win-back", "Review capture", "Deposits", "Waitlist", "Upsell math", "Invoice chasing", "Sentiment watch"];
const SD_CHANNELS = [{ id: "phone", icon: "phone" }, { id: "sms", icon: "chat" }, { id: "mail", icon: "mail" }, { id: "instagram", icon: "instagram" }];
const SD_GUARDRAILS = ["Never discounts alone", "Escalates complaints", "Respects quiet hours", "No medical advice"];
const SD_KNOWLEDGE = ["Service menu & pricing", "Policies v4.2", "FAQ document", "Therapist schedules"];
const SD_TONES = ["Warm", "Professional", "Playful"];
const SD_SAMPLE = {
  Warm: "Hi Maya! I found a spot tomorrow at 2 — want me to hold it for you?",
  Professional: "Hello Maya — tomorrow at 2:00 PM is available. Shall I confirm the booking?",
  Playful: "Good news Maya — 2 PM tomorrow just opened up. Snag it?",
};
const SD_TEMPLATES = [
  { id: "blank", label: "Blank", preset: { name: "", role: "", skills: [], channels: [], tone: "Warm" } },
  { id: "phone", label: "From Phone Rep", preset: { name: "Phone Rep II", role: "Overflow line — books and reschedules after hours", skills: ["Booking", "Reschedules", "Refund triage"], channels: ["phone", "sms"], tone: "Warm" } },
  { id: "shield", label: "From No-show Shield", preset: { name: "Deposit Desk", role: "Runs deposits and reminder policy for repeat no-shows", skills: ["Deposits", "Reschedules", "Waitlist"], channels: ["sms"], tone: "Professional" } },
];

const sdKebab = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const SD_AUT_HINT = {
  ask: "Every consequential action lands in your Inbox first.",
  earn: "Asks first; graduates to auto after 10 clean approvals.",
  auto: "Acts alone within guardrails — you can rein it in per decision type in Fleet.",
};

const SdAutonomySeg = ({ value, onChange }) => (
  <>
    <div className="ix-autonomy-seg">
      <button className={`ix-aut-seg ${value === "ask" ? "active" : ""}`} onClick={() => onChange("ask")}><Icon name="agents" size={11} /><span>Ask me first</span></button>
      <button className={`ix-aut-seg ${value === "earn" ? "active" : ""}`} onClick={() => onChange("earn")}><Icon name="shield" size={11} /><span>Earn autonomy</span></button>
      <button className={`ix-aut-seg ${value === "auto" ? "active" : ""}`} onClick={() => onChange("auto")}><Icon name="check" size={11} /><span>Full auto</span></button>
    </div>
    <div className="ix-aut-hint">{SD_AUT_HINT[value]}</div>
  </>
);

// =============================================================
// Connect external — A2A agent card → permissions → test bench
// =============================================================
const SD_REMOTE_CARD = {
  name: "Inventory Scout", publisher: "Ledgerly Labs", verified: true, version: "1.4.2",
  role: "Watches stock of oils, towels, and retail — drafts reorders before you run out",
  skills: ["Stock checks", "Reorder drafts", "Supplier pings"],
  caps: ["streams", "interrupts", "state", "push", "handoff"],
  auth: "OAuth 2 · read-only scopes",
  modes: "in: text · out: text, structured",
  pace: 270, // declared credit pace at a typical studio's task volume (cr/mo)
};

const SD_TRACE = [
  ["RUN_STARTED", "lc", '{ threadId: "th-bench", runId: "run-01" }'],
  ["TEXT_MESSAGE_START", "tx", '{ role: "assistant" }'],
  ["TEXT_MESSAGE_CONTENT", "tx", '"Checking stock across oils, towels, retail…"'],
  ["TOOL_CALL_START", "tc", '{ name: "check_inventory" }'],
  ["TOOL_CALL_ARGS", "tc", '{ "category": "massage oils" }'],
  ["TOOL_CALL_END", "tc", "{ }"],
  ["STATE_DELTA", "st", '[{ op: "replace", path: "/lowStock", value: 3 }]'],
  ["TEXT_MESSAGE_CONTENT", "tx", '"3 items low — reorder drafts ready for review."'],
  ["TEXT_MESSAGE_END", "tx", "{ }"],
  ["RUN_FINISHED", "lc", '{ runId: "run-01" }'],
];

// Scripted health checks: steady → one timeout → recovery. Deterministic so
// the degraded + incident states are always reachable in a demo.
const SD_HEALTH_SCRIPT = [
  { path: "GET /healthz", code: "200", ms: 184 },
  { path: "stream open", code: "SSE", ms: 62 },
  { path: "GET /healthz", code: "200", ms: 176 },
  { path: "GET /healthz", code: "timeout", ms: 5000 },
  { path: "retry /healthz", code: "200", ms: 212 },
  { path: "GET /healthz", code: "200", ms: 168 },
  { path: "GET /healthz", code: "200", ms: 190 },
  { path: "GET /healthz", code: "200", ms: 181 },
];
const sdHhTime = (i) => "12:04:" + String(7 + i * 2).padStart(2, "0");
const sdAudTime = (n) => { const s = 122 + n * 9; return `12:${String(4 + Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

// Redaction — what rides along in handoffs & shared state (scopes gate queries)
const SD_MASKS = [
  { id: "identity", label: "Client identity", masked: '"Maya Rodriguez" → client-4821', visible: "full name rides along" },
  { id: "contact", label: "Contact details", masked: "phone & email stripped", visible: "reachable directly" },
  { id: "notes", label: "Visit notes", masked: "summary only — never verbatim", visible: "full notes attached" },
];

// Scoped data access — least privilege by default; the flagged scope is the
// one its skills don't need. suppliers.write only exists after the upgrade.
const SD_SCOPES = [
  { id: "inventory.read", purpose: "Stock levels & product list", granted: true, note: "granted at authorization" },
  { id: "suppliers.read", purpose: "Supplier catalog & lead times", granted: true, note: "granted at authorization" },
  { id: "clients.contact.read", purpose: "Client names & emails", granted: false, flag: "More than its skills need — leave off" },
];
const SD_SCOPE_NEW = { id: "suppliers.write", purpose: "Place reorders directly with suppliers", granted: false, flag: "New in v1.5.0 — review before granting", isNew: true };

const SD_CHANGELOG = [
  { k: "+", tone: "tx", text: 'New skill: "Damage reports" — flags received stock that arrived damaged' },
  { k: "~", tone: "st", text: "check_inventory args changed: category → categories[] — bench re-run required" },
  { k: "!", tone: "tc", text: "Requests new scope: suppliers.write — stays off until you grant it" },
];

const SD_INCIDENTS = [
  { on: "Mar 30", what: "Degraded latency · 41m", how: "resolved · post-mortem published" },
  { on: "Feb 12", what: "Outage · 12m", how: "resolved · region failover added" },
];

// Handoff routes this agent can emit — targets must actually exist in the fleet.
const SD_ROUTES = [
  { id: "approval", label: "Reorder needs approval", opts: [
    { id: "inbox", label: "Your Inbox" },
    { id: "bookkeeper", label: "Bookkeeper", missing: true },
  ]},
  { id: "notice", label: "Client-facing notice", opts: [
    { id: "sms-agent", label: "SMS Agent" },
    { id: "email-agent", label: "Email Agent" },
    { id: "inbox", label: "Your Inbox" },
  ]},
];

const ConnectMode = ({ flash }) => {
  const { CAP_META } = window.STORE_DATA;
  const [url, setUrl] = useSdState("");
  const [fetching, setFetching] = useSdState(false);
  const [card, setCard] = useSdState(null);
  const [channels, setChannels] = useSdState(["mail"]);
  const [guards, setGuards] = useSdState(["Respects quiet hours", "Escalates complaints"]);
  const [autonomy, setAutonomy] = useSdState("ask");
  const [trace, setTrace] = useSdState([]);
  const [running, setRunning] = useSdState(false);
  const [testDone, setTestDone] = useSdState(false);
  const [added, setAdded] = useSdState(false);
  const [pub, setPub] = useSdState(null); // null | {name, price} | {submittedId}
  const [fetchErr, setFetchErr] = useSdState(null);
  const [auth, setAuth] = useSdState("none"); // none | authing | failed | ok
  const [authTries, setAuthTries] = useSdState(0);
  const [health, setHealth] = useSdState([]);
  const [push, setPush] = useSdState("none"); // none | registered | pinging | failed | ok
  const [pushTries, setPushTries] = useSdState(0);
  const [pushLog, setPushLog] = useSdState([]);
  const [quotaCap, setQuotaCap] = useSdState(500);
  const [quotaMode, setQuotaMode] = useSdState("pause"); // pause | stop | alert
  const [upgraded, setUpgraded] = useSdState(false);
  const [upgradePolicy, setUpgradePolicy] = useSdState("pin"); // pin | patch | auto
  const [scopes, setScopes] = useSdState(() => SD_SCOPES.map(s => ({ ...s })));
  const [routes, setRoutes] = useSdState({ approval: "inbox", notice: "sms-agent" });
  const [masks, setMasks] = useSdState({ identity: true, contact: true, notes: true });
  const [creditsUsed, setCreditsUsed] = useSdState(0);
  const [envLast, setEnvLast] = useSdState("sandbox");
  const [offInflight, setOffInflight] = useSdState("finish"); // finish | cancel
  const [offDelete, setOffDelete] = useSdState(true);
  const [auditLog, setAuditLog] = useSdState([]);
  const auditT = useSdRef(0);
  const listedAudited = useSdRef(false);
  const rejectAudited = useSdRef(false);

  const audit = (who, text) => {
    auditT.current += 1;
    const t = sdAudTime(auditT.current);
    setAuditLog(l => [...l, { t, who, text }]);
  };
  const [, setTick] = useSdState(0);

  useSdEffect(() => {
    const bump = () => setTick(t => t + 1);
    window.addEventListener("store:listing", bump);
    return () => window.removeEventListener("store:listing", bump);
  }, []);

  const agentId = "inventory-scout";
  const host = (url.replace(/^https?:\/\//, "").split("/")[0]) || "agents.ledgerly.dev";
  const toggle = (set) => (v) => set(list => list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

  const fetchCard = () => {
    if (!url.trim() || fetching) return;
    setFetching(true); setCard(null); setFetchErr(null); setAuth("none"); setAuthTries(0); setHealth([]);
    setPush("none"); setPushTries(0); setPushLog([]);
    setQuotaCap(500); setQuotaMode("pause");
    setUpgraded(false); setUpgradePolicy("pin"); setScopes(SD_SCOPES.map(s => ({ ...s }))); setRoutes({ approval: "inbox", notice: "sms-agent" });
    setMasks({ identity: true, contact: true, notes: true }); setCreditsUsed(0); setEnvLast("sandbox");
    setOffInflight("finish"); setOffDelete(true); setAuditLog([]); auditT.current = 0;
    listedAudited.current = false;
    rejectAudited.current = false;
    setTestDone(false); setTrace([]); setAdded(false); setPub(null);
    const looksValid = /^https?:\/\/[^\s/]+\.[^\s/]+/.test(url.trim());
    setTimeout(() => {
      setFetching(false);
      if (!looksValid || /typo|404|nothing/.test(url)) {
        setFetchErr(`GET ${host}/.well-known/agent.json → 404 · no agent card at this address`);
        audit("portal", "Card fetch failed — 404 at /.well-known/agent.json");
      } else {
        setCard(SD_REMOTE_CARD);
        audit("agent", "Agent card served — 3 skills · 5 capabilities · v1.4.2");
      }
    }, 950);
  };

  // First token request fails on a missing scope; granting it retries clean.
  const authorize = () => {
    if (auth === "authing") return;
    setAuth("authing");
    const attempt = authTries + 1;
    setAuthTries(attempt);
    setTimeout(() => {
      const ok = attempt !== 1;
      setAuth(ok ? "ok" : "failed");
      audit(ok ? "you" : "portal", ok ? "Scope granted & token issued — read-only, 24h" : "Token refused — 401 invalid_scope, inventory.read missing");
    }, 900);
  };

  // Session restore — "Fix in Studio" must work after this page unmounted.
  // If a session listing exists, rebuild the connection context around it so
  // the review panel (and Edit & resubmit) is reachable again.
  useSdEffect(() => {
    const sess = (((window.STORE_DATA || {}).STORE_LISTINGS) || []).find(l => l.review);
    if (!sess) return;
    setUrl("https://" + (sess.endpoint || "agents.ledgerly.dev/inventory-scout"));
    setCard(SD_REMOTE_CARD);
    setAuth("ok"); setAuthTries(2);
    setPush("ok");
    setTestDone(true);
    setAdded(((window.FLEET_DATA || {}).FLEET_ROSTER || []).some(a => a.id === agentId));
    setPub({ submittedId: sess.id });
    audit("portal", "Session restored — connection and listing state recovered");
  }, []);

  // Health checks start the moment the connection authorizes.
  useSdEffect(() => {
    if (auth !== "ok") return;
    setHealth([]);
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setHealth(SD_HEALTH_SCRIPT.slice(0, i));
      if (i >= SD_HEALTH_SCRIPT.length) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [auth]);

  // Push delivery registers its callback as soon as the connection authorizes.
  useSdEffect(() => {
    if (auth !== "ok") return;
    const t = setTimeout(() => {
      setPush("registered");
      setPushLog([{ t: "12:04:03", text: "POST /push/register → 201 · callback registered" }]);
      audit("portal", "Push callback registered — hooks.chanlytics.app/wh/serenity-x7f2");
    }, 800);
    return () => clearTimeout(t);
  }, [auth]);

  // First test ping fails signature verification; re-syncing the secret fixes it.
  const testPing = () => {
    if (push === "pinging") return;
    setPush("pinging");
    const attempt = pushTries + 1;
    setPushTries(attempt);
    setTimeout(() => {
      if (attempt === 1) {
        setPush("failed");
        setPushLog(l => [...l, { t: "12:04:11", text: "↓ TASK_UPDATE · sig invalid — rejected (secret mismatch)", bad: true }]);
        audit("agent", "Push ping rejected — signature mismatch (old secret)");
      } else {
        setPush("ok");
        setPushLog(l => [...l,
          { t: "12:04:14", text: "POST /push/register → 201 · secret rotated on both sides" },
          { t: "12:04:15", text: "↓ TASK_UPDATE · sig valid · 96ms" },
          { t: "", text: '{ taskId: "bench-01", status: "working", note: "supplier check queued" }', dim: true },
        ]);
        audit("agent", "Push ping verified — TASK_UPDATE delivered signed");
      }
    }, 900);
  };

  const lastCheck = health[health.length - 1];
  const anyTimeout = health.some(h => h.code === "timeout");
  const healthStatus = auth !== "ok" ? "idle" : health.length < 2 ? "checking" : (lastCheck && lastCheck.code === "timeout") ? "degraded" : "healthy";
  const okMs = health.filter(h => h.code === "200").map(h => h.ms).sort((a, b) => a - b);
  const p50 = okMs.length ? okMs[Math.floor(okMs.length / 2)] : null;
  // Honest session usage — counts the calls this flow actually made
  const reqSession = (card ? 1 : 0) + authTries + (push !== "none" ? 1 : 0) + pushTries + (trace.length > 0 ? 3 : 0);
  const version = upgraded ? "1.5.0" : (card ? card.version : "—");
  const mappedN = [routes.approval, routes.notice].filter(v => v !== "inbox").length;

  const upgrade = () => {
    if (upgraded) return;
    setUpgraded(true);
    setScopes(list => [...list, { ...SD_SCOPE_NEW }]);
    setTestDone(false); setTrace([]);
    audit("you", "Upgraded to v1.5.0 — suppliers.write requested, left off");
    flash({
      msg: <>Upgraded to <b>v1.5.0</b> — the new scope stays off until you grant it; re-verify on the bench</>,
      undo: () => { setUpgraded(false); setScopes(list => list.filter(x => x.id !== SD_SCOPE_NEW.id)); },
    });
  };

  const toggleScope = (id) => {
    const s = scopes.find(x => x.id === id);
    if (!s) return;
    setScopes(list => list.map(x => x.id === id ? { ...x, granted: !x.granted } : x));
    audit("you", `Scope ${s.id} ${s.granted ? "revoked" : "granted"} — applies at token refresh`);
    flash({
      msg: <><b>{s.id}</b> {s.granted ? "revoked" : "granted"} — applies at the next token refresh</>,
      undo: () => setScopes(list => list.map(x => x.id === id ? { ...x, granted: s.granted } : x)),
    });
  };

  const runTest = (env = "sandbox") => {
    if (running) return;
    setRunning(true); setEnvLast(env); setTrace([]);
    let i = 0;
    const tick = setInterval(() => {
      i += 1;
      setTrace(SD_TRACE.slice(0, i));
      if (i >= SD_TRACE.length) {
        clearInterval(tick); setRunning(false); setTestDone(true);
        if (env === "production") {
          setCreditsUsed(c => c + 2);
          audit("agent", "Live bench task completed — 2 credits metered");
        } else {
          audit("agent", "Bench task completed in sandbox — 10 events, no credits");
        }
      }
    }, 260);
  };

  const mkEntry = () => window.AS_STORE.entry({
    id: agentId, glyph: card.name[0].toUpperCase(), name: card.name, role: card.role,
    price: 300, channels,
    identity: `${host} · A2A`,
    autonomyLabel: SD_AUT_HINT[autonomy],
    sourceLine: `Connected via A2A · by ${card.publisher}`,
    connection: {
      publisher: card.publisher, verified: card.verified, endpoint: host, auth: card.auth,
      version: version, policy: upgradePolicy === "pin" ? "pinned" : upgradePolicy === "patch" ? "auto-patch" : "auto",
      push: push === "ok" ? "verified — signed webhooks" : push === "failed" ? "rejected — re-sync in Studio" : "registered · unverified",
      scopes: { granted: scopes.filter(s => s.granted).length, total: scopes.length },
      budget: `${quotaCap.toLocaleString()} cr/mo · ${quotaMode === "pause" ? "pause & ask" : quotaMode === "stop" ? "hard stop" : "alert only"}${quotaCap < card.pace ? ` · under ~${card.pace} pace — pauses ~day ${Math.round(30 * quotaCap / card.pace)}` : ""}`,
      redaction: `${Object.values(masks).filter(Boolean).length} of ${SD_MASKS.length} fields masked`,
      handoffs: `${mappedN} to agents · rest → Inbox`,
      routeApproval: routes.approval === "inbox" ? "your Inbox" : "Bookkeeper",
      since: "12:04",
    },
  });

  const addToFleet = () => {
    window.AS_STORE.addToFleet(mkEntry());
    setAdded(true);
    audit("you", "Added to Fleet — ask-first autonomy, scheduled status");
    flash({
      msg: <><b>{card.name}</b> connected — provisioning in your Fleet</>,
      undo: () => { window.AS_STORE.uninstall(agentId); setAdded(false); },
      links: [{ label: "Open in Fleet", to: `fleet/${agentId}` }],
    });
  };

  const disconnect = () => {
    if (!window.canDo("disconnect")) return;
    window.AS_STORE.uninstall(agentId);
    setAdded(false);
    audit("you", `Disconnected — ${offInflight === "finish" ? "in-flight tasks finishing" : "in-flight tasks cancelled"}${offDelete ? " · deletion requested" : ""}`);
    flash({
      msg: <><b>{card.name}</b> disconnected — token revoked{offDelete ? ", deletion requested" : ""}</>,
      undo: () => { window.AS_STORE.addToFleet(mkEntry()); setAdded(true); audit("you", "Disconnect undone — reconnected with the same contract"); },
    });
  };

  const submitListing = () => {
    if (pub.resubmitId) {
      window.AS_STORE.resubmitListing(pub.resubmitId, { name: pub.name, price: pub.price });
      audit("you", `Listing resubmitted after copy fix — "${pub.name}"`);
      listedAudited.current = false;
      rejectAudited.current = false;
      setPub({ submittedId: pub.resubmitId });
      flash({ msg: <><b>{pub.name}</b> resubmitted — review re-runs all 5 checks</> });
      return;
    }
    const id = "lst-" + sdKebab(pub.name);
    window.AS_STORE.addListing({
      id, name: pub.name, role: card.role, status: "submitted", installs: 0,
      listedOn: "Apr 26", endpoint: `${host}/${sdKebab(card.name)}`, price: pub.price,
    });
    setPub({ submittedId: id });
    audit("you", `Listing "${pub.name}" submitted for review`);
    flash({ msg: <><b>{pub.name}</b> submitted for listing review</>, links: [{ label: "Your listings", to: "store" }] });
  };

  const setRoute = (r, o) => {
    setRoutes(m => ({ ...m, [r.id]: o.id }));
    audit("you", `Handoff "${r.label}" → ${o.label}`);
  };

  const toggleMask = (m) => {
    const was = masks[m.id];
    setMasks(x => ({ ...x, [m.id]: !was }));
    audit("you", `Redaction ${was ? "off" : "on"} — ${m.label.toLowerCase()}`);
    if (was) flash({
      msg: <><b>{m.label}</b> now visible to {card.name} in handoffs</>,
      undo: () => { setMasks(x => ({ ...x, [m.id]: true })); audit("you", `Redaction back on — ${m.label.toLowerCase()}`); },
    });
  };

  const listing = pub && pub.submittedId ? window.AS_STORE.listings().find(l => l.id === pub.submittedId) : null;

  // One audit line per review outcome
  useSdEffect(() => {
    if (!listing) return;
    if (listing.status === "listed" && !listedAudited.current) {
      listedAudited.current = true;
      audit("portal", "Listing passed review — 5 checks, live in the Store");
    }
    if (listing.status === "rejected" && !rejectAudited.current) {
      rejectAudited.current = true;
      audit("portal", `Listing rejected — ${listing.rejectReason}`);
    }
  }, [listing && listing.status]);

  return (
    <div className="sd-body">
      <div className="sd-form">
        {/* Endpoint */}
        <section className="fl-card">
          <div className="fl-card-head"><span className="fl-card-title">Endpoint</span><span className="fl-card-sub">where your agent runs</span></div>
          <div className="sd-endpoint">
            <input className="sd-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://agents.yourco.dev/your-agent" onKeyDown={e => e.key === "Enter" && fetchCard()} />
            <button className="btn btn-primary btn-sm" disabled={!url.trim() || fetching} onClick={fetchCard}>
              {fetching ? "Fetching…" : "Fetch agent card"}
            </button>
          </div>
          <div className="sd-hint">{fetching ? `GET ${host}/.well-known/agent.json` : "Try: https://agents.ledgerly.dev/inventory-scout — or a mistyped address to see the failure path"}</div>

          {fetchErr && !fetching && (
            <div className="sd-cardprev sd-errbox">
              <div className="sd-auth-err">{fetchErr}</div>
              <div className="sd-hint" style={{ marginTop: 0 }}>Nothing was connected. Check the address with the publisher — the card should answer at /.well-known/agent.json.</div>
            </div>
          )}

          {card && (
            <div className="sd-cardprev">
              <div className="sd-cardprev-head">
                <span className="st-tile">{card.name[0]}</span>
                <div className="st-card-titles">
                  <span className="st-card-name">{card.name}</span>
                  <div className="st-prov">
                    <span>by {card.publisher}</span>
                    {card.verified && <span className="st-prov-check"><Icon name="check" size={10} /></span>}
                    <span className="st-ext-tag">External · via A2A</span>
                  </div>
                </div>
                <span className="sd-verified"><Icon name="check" size={11} /> Card valid</span>
              </div>
              <div className="st-chips">{card.skills.map(s => <span key={s} className="st-chip">{s}</span>)}</div>
              <div className="st-caps">{card.caps.map(c => <span key={c} className="st-cap">{CAP_META[c]}</span>)}</div>
              <div className="sd-cardprev-meta">
                <span>v{version}</span><span>{card.auth}</span><span>{card.modes}</span>
              </div>
            </div>
          )}

          {card && (
            <div className="sd-auth">
              <div className="sd-auth-row">
                <span className="st-conn-key">Authorization</span>
                <span className="st-conn-val">{card.auth}</span>
                {auth === "ok" ? <span className="pill pill-ok">Authorized</span>
                  : auth === "failed" ? <span className="pill pill-danger">Failed</span>
                  : <span className="pill pill-warn">Required</span>}
              </div>
              {auth === "failed" && (
                <>
                  <div className="sd-auth-err">401 invalid_scope — token is missing inventory.read</div>
                  <div className="sd-hint" style={{ marginTop: 0 }}>The workspace key was issued without the read-only inventory scope. Granting it retries the token request — nothing else about the connection changes.</div>
                </>
              )}
              {auth !== "ok" ? (
                <div className="sd-pub-row" style={{ marginTop: 2 }}>
                  <button className="btn btn-primary btn-sm" disabled={auth === "authing"} onClick={authorize}>
                    {auth === "authing" ? "Requesting token…" : auth === "failed" ? "Grant scope & retry" : "Authorize connection"}
                  </button>
                </div>
              ) : (
                <div className="sd-trace-done" style={{ marginTop: 0 }}><Icon name="check" size={11} /> Read-only token issued — expires in 24h, renews automatically</div>
              )}
            </div>
          )}
        </section>

        {card && (
          <>
            {/* Version & upgrades — pinned by default; scope additions gate on you */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Version & upgrades</span>
                {!upgraded && <span className="pill pill-warn">v1.5.0 available</span>}
                {upgraded && !testDone && <span className="pill pill-warn">{added ? "v1.4.2 serving · v1.5.0 staged" : "Staged — re-verify"}</span>}
                {upgraded && testDone && <span className="pill pill-ok">v1.5.0 current</span>}
              </div>
              <div className="st-conn" style={{ marginBottom: 10 }}>
                <div className="st-conn-row"><span className="st-conn-key">Running</span><span className="st-conn-val mono">v{version}{upgraded && !testDone ? " · unverified" : ""}</span></div>
              </div>
              <div className="st-modal-label" style={{ marginBottom: 6 }}>What's in v1.5.0</div>
              <div className="sd-trace sd-clog">
                {SD_CHANGELOG.map((c, i) => (
                  <div key={i} className="sd-trace-row">
                    <span className={`sd-ev ${c.tone}`}>{c.k}</span>
                    <span className="sd-trace-payload" style={{ whiteSpace: "normal" }}>{c.text}</span>
                  </div>
                ))}
              </div>
              {!upgraded ? (
                <div className="sd-pub-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-primary btn-sm" onClick={upgrade}>Upgrade to v1.5.0</button>
                </div>
              ) : !testDone ? (
                <div className="sd-hint" style={{ marginTop: 10 }}>{added ? "v1.4.2 keeps serving clients until the bench verifies v1.5.0 — nothing swaps mid-conversation." : "Re-run the bench — the tool arguments changed."}</div>
              ) : (
                <div className="sd-trace-done" style={{ marginTop: 10 }}><Icon name="check" size={11} /> v1.5.0 verified and current</div>
              )}
              <div className="ix-autonomy-seg" style={{ marginTop: 12 }}>
                <button className={`ix-aut-seg ${upgradePolicy === "pin" ? "active" : ""}`} onClick={() => setUpgradePolicy("pin")}><Icon name="shield" size={11} /><span>Pin</span></button>
                <button className={`ix-aut-seg ${upgradePolicy === "patch" ? "active" : ""}`} onClick={() => setUpgradePolicy("patch")}><Icon name="check" size={11} /><span>Auto-patch</span></button>
                <button className={`ix-aut-seg ${upgradePolicy === "auto" ? "active" : ""}`} onClick={() => setUpgradePolicy("auto")}><Icon name="agents" size={11} /><span>Auto all</span></button>
              </div>
              <div className="ix-aut-hint">
                {upgradePolicy === "pin" && "Nothing upgrades without you — releases wait here until you press the button."}
                {upgradePolicy === "patch" && "Bug-fix releases (1.4.x) apply automatically; feature releases wait for you."}
                {upgradePolicy === "auto" && "Every release applies on arrival — new scopes still stay off until you grant them."}
              </div>
            </section>

            {/* Push delivery — updates arrive even with no stream open */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Push delivery</span>
                {push === "ok" && <span className="pill pill-ok">Verified</span>}
                {push === "failed" && <span className="pill pill-danger">Rejected</span>}
                {(push === "registered" || push === "pinging") && <span className="pill pill-warn">Unverified</span>}
              </div>
              {auth !== "ok" ? (
                <div className="sg-usage-empty">Registers a callback after the connection is authorized — so {card.name} can finish long-running work and still land the update in your Inbox, hours later, with no stream open.</div>
              ) : (
                <>
                  <div className="st-conn" style={{ marginBottom: 10 }}>
                    <div className="st-conn-row"><span className="st-conn-key">Callback</span><span className="st-conn-val mono">hooks.chanlytics.app/wh/serenity-x7f2</span></div>
                    <div className="st-conn-row"><span className="st-conn-key">Signing</span><span className="st-conn-val mono">HMAC-SHA256 · whsec_…4k2p</span></div>
                    <div className="st-conn-row"><span className="st-conn-key">Retries</span><span className="st-conn-val">3× with backoff · dead-letters to Tasks after 15m</span></div>
                  </div>
                  {pushLog.length > 0 && (
                    <div className="sd-trace sd-health">
                      {pushLog.map((r, i) => (
                        <div key={i} className="sd-trace-row">
                          <span className="sd-ev">{r.t}</span>
                          <span className={`sd-trace-payload ${r.bad ? "sd-bad" : ""}`} style={r.dim ? { color: "var(--ink-faint)" } : null}>{r.text}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {push === "failed" && (
                    <div className="sd-hint" style={{ marginTop: 8 }}>{card.name} signed with an old secret. Re-syncing rotates it on both sides and retries — nothing else about the connection changes.</div>
                  )}
                  {push !== "ok" ? (
                    <div className="sd-pub-row" style={{ marginTop: 8 }}>
                      <button className="btn btn-sm" disabled={push === "pinging" || push === "none"} onClick={testPing}>
                        {push === "pinging" ? "Waiting for ping…" : push === "failed" ? "Re-sync secret & retry" : "Send test ping"}
                      </button>
                    </div>
                  ) : (
                    <div className="sd-trace-done" style={{ marginTop: 8 }}><Icon name="check" size={11} /> Push verified — updates arrive even when no stream is open</div>
                  )}
                </>
              )}
            </section>

            {/* Rate limits & quotas — their ceiling, your budget */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Rate limits & quotas</span>
                <span className="fl-card-sub">their ceiling · your budget</span>
              </div>
              <div className="st-conn" style={{ marginBottom: 12 }}>
                <div className="st-conn-row"><span className="st-conn-key">They allow</span><span className="st-conn-val">60 requests/min · 4 concurrent tasks · burst to 10</span></div>
                <div className="st-conn-row"><span className="st-conn-key">Past the burst</span><span className="st-conn-val">429s are queued and retried by the portal — tasks slow down, they don't fail</span></div>
              </div>
              <div className="st-modal-label" style={{ marginBottom: 6 }}>Monthly credit budget</div>
              <div className="sd-chips" style={{ marginBottom: 12 }}>
                {[250, 500, 1000].map(c => (
                  <button key={c} className={`sd-chip ${quotaCap === c ? "on" : ""}`} onClick={() => {
                    setQuotaCap(c);
                    audit("you", `Budget set to ${c.toLocaleString()} credits/mo`);
                    if (c < card.pace) flash({ msg: <><b>{c.toLocaleString()} cr</b> sits under {card.name}'s ~{card.pace} cr/mo declared pace — expect a pause-&-ask around day {Math.round(30 * c / card.pace)}</> });
                  }}>
                    {quotaCap === c && <Icon name="check" size={10} />}<span className="tabular">{c.toLocaleString()}</span> credits/mo
                  </button>
                ))}
              </div>
              {quotaCap < card.pace ? (
                <div className="sd-scope-flag" style={{ margin: "2px 0 10px" }}><Icon name="shield" size={10} /> Under its ~{card.pace} cr/mo declared pace — at this cap it pauses around day {Math.round(30 * quotaCap / card.pace)}.</div>
              ) : (
                <div className="sd-hint" style={{ margin: "0 0 10px" }}>Comfortably over its ~{card.pace} cr/mo declared pace.</div>
              )}
              <div className="ix-autonomy-seg">
                <button className={`ix-aut-seg ${quotaMode === "pause" ? "active" : ""}`} onClick={() => setQuotaMode("pause")}><Icon name="pause" size={11} /><span>Pause & ask me</span></button>
                <button className={`ix-aut-seg ${quotaMode === "stop" ? "active" : ""}`} onClick={() => setQuotaMode("stop")}><Icon name="x" size={11} /><span>Hard stop</span></button>
                <button className={`ix-aut-seg ${quotaMode === "alert" ? "active" : ""}`} onClick={() => setQuotaMode("alert")}><Icon name="mail" size={11} /><span>Keep going, alert me</span></button>
              </div>
              <div className="ix-aut-hint">
                {quotaMode === "pause" && `At ${quotaCap.toLocaleString()} credits it pauses mid-plan and the ask lands in your Inbox — nothing hard-fails.`}
                {quotaMode === "stop" && "Tasks in flight finish; new ones refuse with a quota error until the month resets."}
                {quotaMode === "alert" && "No brake — you're notified at 80% and 100%, spend keeps accruing."}
              </div>
              <div className="sd-quota">
                <div className="sd-quota-bar"><span style={{ width: `${Math.min(100, (creditsUsed / quotaCap) * 100)}%` }}></span></div>
                <div className="sd-cardprev-meta">
                  <span>{creditsUsed} of {quotaCap.toLocaleString()} credits — {creditsUsed > 0 ? "live bench runs metered" : "metering starts in your Fleet"}</span>
                  {auth === "ok" && <span>{reqSession} requests this session (card · auth · push · bench) — bench runs are free</span>}
                </div>
              </div>
            </section>

            {/* Permissions */}
            <section className="fl-card">
              <div className="fl-card-head"><span className="fl-card-title">What it may touch</span><span className="fl-card-sub">your workspace, your rules</span></div>
              <div className="sd-chips" style={{ marginBottom: 12 }}>
                {SD_CHANNELS.map(c => (
                  <button key={c.id} className={`sd-chip ${channels.includes(c.id) ? "on" : ""}`} onClick={() => toggle(setChannels)(c.id)}>
                    <Icon name={c.icon} size={11} />{c.id}
                  </button>
                ))}
              </div>
              <div className="sd-chips" style={{ marginBottom: 12 }}>
                {SD_GUARDRAILS.map(g => (
                  <button key={g} className={`sd-chip ${guards.includes(g) ? "on" : ""}`} onClick={() => toggle(setGuards)(g)}>
                    <Icon name="shield" size={10} />{g}
                  </button>
                ))}
              </div>
              <SdAutonomySeg value={autonomy} onChange={setAutonomy} />
            </section>

            {/* Scoped data access — least privilege by default */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Data access</span>
                <span className="fl-card-sub">{scopes.filter(s => s.granted).length} of {scopes.length} scopes granted</span>
              </div>
              <div className="sd-scopes">
                {scopes.map(s => (
                  <div key={s.id} className="sd-scope">
                    <div className="sd-scope-main">
                      <span className="sd-scope-id">{s.id}{s.isNew && <span className="st-ext-tag" style={{ marginLeft: 6 }}>new in v1.5.0</span>}</span>
                      <span className="sd-scope-why">{s.purpose}{s.note && !s.flag ? ` — ${s.note}` : ""}</span>
                      {s.flag && <span className="sd-scope-flag"><Icon name="shield" size={10} /> {s.flag}</span>}
                    </div>
                    <button className={`sd-chip ${s.granted ? "on" : ""}`} onClick={() => toggleScope(s.id)}>
                      {s.granted ? <><Icon name="check" size={10} />Granted</> : "Off"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="sd-hint" style={{ marginTop: 8 }}>Default is least privilege — grant only what its skills use. Changes apply at the next token refresh (24h).</div>
            </section>

            {/* Privacy & redaction — what rides along, not what it can query */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Privacy & redaction</span>
                <span className="fl-card-sub">{Object.values(masks).filter(Boolean).length} of {SD_MASKS.length} masked</span>
              </div>
              <div className="sd-scopes">
                {SD_MASKS.map(m => (
                  <div key={m.id} className="sd-scope">
                    <div className="sd-scope-main">
                      <span className="sd-scope-id" style={{ fontFamily: "inherit", fontSize: "var(--text-sm)" }}>{m.label}</span>
                      <span className="sd-scope-why">{masks[m.id] ? m.masked : m.visible}</span>
                      {!masks[m.id] && <span className="sd-scope-flag"><Icon name="shield" size={10} /> Visible outside your workspace</span>}
                    </div>
                    <button className={`sd-chip ${masks[m.id] ? "on" : ""}`} onClick={() => toggleMask(m)}>
                      {masks[m.id] ? <><Icon name="check" size={10} />Masked</> : "Visible"}
                    </button>
                  </div>
                ))}
              </div>
              <div className="sd-hint" style={{ marginTop: 8 }}>Scopes control what it can query. Redaction controls what it sees in passing — masked fields resolve back to real values only inside your workspace.</div>
            </section>

            {/* Multi-agent handoff mapping — unmapped work always lands with you */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Handoffs</span>
                <span className="fl-card-sub">where its work goes next</span>
              </div>
              {SD_ROUTES.map(r => (
                <div key={r.id} className="sd-route">
                  <span className="sd-route-label">{r.label}</span>
                  <div className="sd-chips" style={{ gap: 4 }}>
                    {r.opts.map(o => o.missing ? (
                      <button key={o.id} className="sd-chip sd-chip-ghost" title="Not in your fleet — opens the Store" onClick={() => window.CHANLY.nav("store")}>
                        {o.label} · install first
                      </button>
                    ) : (
                      <button key={o.id} className={`sd-chip ${routes[r.id] === o.id ? "on" : ""}`} onClick={() => setRoute(r, o)}>
                        {routes[r.id] === o.id && <Icon name="check" size={10} />}{o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="sd-route">
                <span className="sd-route-label">Anything unmapped</span>
                <span className="sd-route-fixed"><Icon name="shield" size={10} /> Your Inbox · always</span>
              </div>
            </section>

            {/* Test bench */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Test bench</span>
                <span className="fl-card-sub">one sample task, streamed live over the wire</span>
              </div>
              {auth !== "ok" ? (
                <div className="sg-usage-empty">Authorize the connection first — the bench runs a real task against your endpoint.</div>
              ) : trace.length === 0 && !running ? (
                <>
                  <button className="btn btn-sm" onClick={() => runTest("sandbox")}><Icon name="sparkle" size={12} /> Run sample task — "check today's stock"</button>
                  <div className="sd-hint" style={{ marginTop: 8 }}>Runs in the publisher's sandbox — synthetic data, no credits.</div>
                  {upgraded && !testDone && <div className="sd-hint" style={{ marginTop: 8 }}>v1.5.0 changed check_inventory's arguments — run again to re-verify before it serves clients.</div>}
                </>
              ) : (
                <>
                  <div className="sd-trace">
                    {trace.map(([ev, tone, payload], i) => (
                      <div key={i} className="sd-trace-row">
                        <span className={`sd-ev ${tone}`}>{ev}</span>
                        <span className="sd-trace-payload">{payload}</span>
                      </div>
                    ))}
                  </div>
                  {testDone && !running && (
                    <div className="sd-trace-done"><Icon name="check" size={11} /> {envLast === "production" ? "Live run verified — 2 credits metered · results match sandbox" : `Handshake verified — ${SD_TRACE.length} events · streaming, interrupts, and state sync all answered`}</div>
                  )}
                  {testDone && (
                    <div className="sd-sample" style={{ marginTop: 10 }}>
                      <div className="st-modal-label">What your client-facing reply looks like</div>
                      <div className="tl-msg agent" style={{ justifyContent: "flex-start" }}>
                        <div className="tl-msg-bubble" style={{ alignItems: "flex-start" }}>
                          <div className="tl-msg-body">3 items are running low — massage oil (lavender), hand towels, and the gua sha retail set. Reorder drafts are ready for your review.</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {testDone && !running && (
                    <div className="sd-pub-row" style={{ marginTop: 10 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => runTest("sandbox")}>Run again · sandbox</button>
                      <button className="btn btn-sm" onClick={() => runTest("production")}>Run live — 2 credits</button>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* Endpoint health — live checks once authorized */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Endpoint health</span>
                {healthStatus === "healthy" && <span className="pill pill-ok">{anyTimeout ? "Healthy · 1 incident" : "Healthy"}</span>}
                {healthStatus === "degraded" && <span className="pill pill-warn">Degraded — retrying</span>}
                {healthStatus === "checking" && <span className="pill">Checking…</span>}
              </div>
              {auth !== "ok" ? (
                <div className="sg-usage-empty">Health checks begin the moment the connection is authorized.</div>
              ) : (
                <>
                  <div className="sd-trace sd-health">
                    {health.map((h, i) => (
                      <div key={i} className="sd-trace-row">
                        <span className="sd-ev">{sdHhTime(i)}</span>
                        <span className={`sd-trace-payload ${h.code === "timeout" ? "sd-bad" : ""}`}>
                          {h.path} → {h.code === "timeout" ? `timeout after ${h.ms.toLocaleString()}ms — retrying` : `${h.code} · ${h.ms}ms`}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="sd-cardprev-meta" style={{ marginTop: 8 }}>
                    {p50 && <span>p50 {p50}ms</span>}
                    <span>{health.filter(h => h.code !== "timeout").length}/{health.length} checks ok</span>
                    <span>history: starts now — first connected 12:04</span>
                  </div>
                  <div className="st-modal-label" style={{ margin: "12px 0 6px" }}>SLA & incident history</div>
                  <div className="st-conn">
                    <div className="st-conn-row"><span className="st-conn-key">Publisher SLA</span><span className="st-conn-val">99.9% monthly — credits back below it</span></div>
                    <div className="st-conn-row"><span className="st-conn-key">Their 90 days</span><span className="st-conn-val">99.94% · self-reported by {card.publisher}</span></div>
                    <div className="st-conn-row"><span className="st-conn-key">Your history</span><span className="st-conn-val">none yet — accrues in Fleet from 12:04</span></div>
                  </div>
                  <div className="sd-trace sd-clog" style={{ marginTop: 8 }}>
                    {SD_INCIDENTS.map((inc, i) => (
                      <div key={i} className="sd-trace-row">
                        <span className="sd-ev" style={{ minWidth: 52 }}>{inc.on}</span>
                        <span className="sd-trace-payload">{inc.what} — {inc.how}</span>
                      </div>
                    ))}
                  </div>
                  {added && <div className="sd-hint">Monitoring hands off to Fleet — if {card.name} stops answering, the alert lands in your Inbox.</div>}
                </>
              )}
            </section>

            {/* Audit trail — the connection's paper trail */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Audit trail</span>
                <span className="fl-card-sub">every consequential action · kept 90 days</span>
              </div>
              {auditLog.length === 0 ? (
                <div className="sg-usage-empty">Actions on this connection land here as you take them — nothing is off the record.</div>
              ) : (
                <div className="sd-trace" style={{ maxHeight: 190 }}>
                  {auditLog.map((a, i) => (
                    <div key={i} className="sd-trace-row">
                      <span className="sd-ev" style={{ minWidth: 58, fontWeight: "var(--weight-regular)", color: "var(--ink-faint)" }}>{a.t}</span>
                      <span className={`sd-aud-who sd-aud-${a.who}`}>{a.who}</span>
                      <span className="sd-trace-payload" style={{ whiteSpace: "normal" }}>{a.text}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="sd-hint" style={{ marginTop: 8 }}>The log survives disconnect and follows the agent into Fleet.</div>
            </section>

            {/* Disconnect plan — decided now, boring later */}
            <section className="fl-card">
              <div className="fl-card-head">
                <span className="fl-card-title">Disconnect plan</span>
                <span className="fl-card-sub">decided now, so removal is boring later</span>
              </div>
              <div className="st-modal-label" style={{ marginBottom: 6 }}>In-flight tasks</div>
              <div className="ix-autonomy-seg">
                <button className={`ix-aut-seg ${offInflight === "finish" ? "active" : ""}`} onClick={() => setOffInflight("finish")}><Icon name="check" size={11} /><span>Finish, then stop</span></button>
                <button className={`ix-aut-seg ${offInflight === "cancel" ? "active" : ""}`} onClick={() => setOffInflight("cancel")}><Icon name="x" size={11} /><span>Cancel now</span></button>
              </div>
              <div className="ix-aut-hint">{offInflight === "finish" ? "Running tasks complete and hand off; nothing new starts." : "Running tasks stop mid-flight — anything half-done lands in your Inbox as an escalation."}</div>
              <div className="sd-pub-row" style={{ marginTop: 10 }}>
                <button className={`sd-chip ${offDelete ? "on" : ""}`} onClick={() => setOffDelete(v => !v)}>
                  {offDelete && <Icon name="check" size={10} />}Request data deletion — {card.publisher} confirms within 30 days
                </button>
              </div>
              <div className="st-conn" style={{ marginTop: 10 }}>
                <div className="st-conn-row"><span className="st-conn-key">Immediately</span><span className="st-conn-val">token revoked · push callback removed · handoffs unrouted</span></div>
                <div className="st-conn-row"><span className="st-conn-key">Stays with you</span><span className="st-conn-val">audit trail (90 days) · transcripts · anything it booked</span></div>
              </div>
              <div className="sd-pub-row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm btn-danger-ghost" disabled={!added} onClick={disconnect} {...window.gate("disconnect")}>Disconnect {card.name}</button>
                {!added && <span className="sd-hint" style={{ marginTop: 0 }}>Applies once it's in your Fleet — nothing to disconnect yet.</span>}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Preview / actions */}
      <aside className="sd-preview">
        <div className="fl-card sd-preview-card">
          <div className="fl-card-head">
            <span className="fl-card-title">Connection</span>
            {added && <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />In your Fleet</span>}
          </div>
          {!card ? (
            <div className="sg-usage-empty">Paste your agent's endpoint and fetch its card. Everything it claims — skills, capabilities, auth — shows here before anything touches your workspace.</div>
          ) : (
            <>
              <div className="sd-prev-head">
                <span className="st-tile lg">{card.name[0]}</span>
                <div className="st-card-titles">
                  <span className="st-modal-name">{card.name}</span>
                  <span className="st-card-role">{card.role}</span>
                </div>
              </div>
              <div className="cl-prof-attr-list">
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Autonomy</span><span className="cl-prof-attr-val">{autonomy === "ask" ? "Ask me first" : autonomy === "earn" ? "Earn autonomy" : "Full auto"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Guardrails</span><span className="cl-prof-attr-val">{guards.length} active</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Channels</span><span className="cl-prof-attr-val">{channels.join(" · ") || "none yet"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Status</span><span className="cl-prof-attr-val">{added ? "In your Fleet" : testDone ? "Verified ✓" : auth === "ok" ? "Not tested" : "Not authorized"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Endpoint</span><span className="cl-prof-attr-val">{healthStatus === "healthy" ? "Healthy" : healthStatus === "degraded" ? "Degraded — retrying" : healthStatus === "checking" ? "Checking…" : "—"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Push</span><span className="cl-prof-attr-val">{push === "ok" ? "Verified ✓" : push === "failed" ? "Rejected — re-sync" : push === "none" ? "—" : "Registered · unverified"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Budget</span><span className="cl-prof-attr-val">{quotaCap.toLocaleString()} cr/mo · {quotaMode === "pause" ? "pause & ask" : quotaMode === "stop" ? "hard stop" : "alert only"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Version</span><span className="cl-prof-attr-val">v{version}{upgraded && !testDone ? " · staged" : ""} · {upgradePolicy === "pin" ? "pinned" : upgradePolicy === "patch" ? "auto-patch" : "auto"}</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Handoffs</span><span className="cl-prof-attr-val">{mappedN} to agents · rest → Inbox</span></div>
                <div className="cl-prof-attr"><span className="cl-prof-attr-key">Redaction</span><span className="cl-prof-attr-val">{Object.values(masks).filter(Boolean).length} of {SD_MASKS.length} fields masked</span></div>
              </div>
              <div className="sd-actions">
                {!added ? (
                  <button className="btn btn-primary btn-sm" disabled={!testDone} onClick={addToFleet} title={!testDone ? "Run the sample task first" : ""}>
                    <Icon name="agents" size={12} /> Add to Fleet
                  </button>
                ) : (
                  <button className="btn btn-sm" onClick={() => window.CHANLY.nav(CHANLY.R.agent(agentId))}>Open in Fleet <Icon name="arrow-right" size={11} /></button>
                )}
              </div>
              {!testDone && !added && auth === "ok" && <div className="sd-hint" style={{ marginTop: 6 }}>Run the sample task first — the bench is the proof.</div>}
              {!added && auth !== "ok" && <div className="sd-hint" style={{ marginTop: 6 }}>Authorize the connection, then prove it on the bench.</div>}

              {added && !pub && (
                <div className="sd-pub">
                  <div className="st-modal-label">Publish to the Store</div>
                  <div className="sd-hint" style={{ marginTop: 0 }}>Other workspaces install it; runs stay on your endpoint.</div>
                  <button className="btn btn-sm" onClick={() => setPub({ name: card.name, price: 300 })}><Icon name="external" size={11} /> Draft a listing</button>
                </div>
              )}
              {pub && !pub.submittedId && (
                <div className="sd-pub">
                  <div className="st-modal-label">Listing draft</div>
                  <input className="sd-input" value={pub.name} onChange={e => setPub({ ...pub, name: e.target.value })} placeholder="Listing name" />
                  <div className="sd-pub-row">
                    <input className="sd-input sm tabular" type="number" min="0" step="50" value={pub.price} onChange={e => setPub({ ...pub, price: +e.target.value || 0 })} />
                    <span className="sd-hint" style={{ marginTop: 0 }}>credits/mo</span>
                    <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} disabled={!pub.name.trim()} onClick={submitListing}>Submit for review</button>
                  </div>
                  <div className="sd-hint" style={{ marginTop: 0 }}>New listings show "No track record yet" — proof lines are earned, never written. Overclaims ("guaranteed", "#1", "best") bounce in copy review.</div>
                  <div className="sd-pub-row" style={{ marginTop: 2 }}>
                    <span className="sd-hint" style={{ marginTop: 0 }}>{pub.resubmitId ? "Resubmitting re-runs all 5 checks." : ""}</span>
                  </div>
                </div>
              )}
              {listing && (
                <div className="sd-pub">
                  {(listing.status === "submitted" || listing.status === "rejected") ? (
                    <>
                      <div className="st-modal-label" style={{ marginBottom: 6 }}>{listing.status === "rejected" ? "Review failed" : `In review — ${(listing.review || []).filter(c => c.state !== "pending").length} of ${(listing.review || []).length} checks`}</div>
                      <div className="st-hs">
                        {(listing.review || []).map(c => (
                          <div key={c.id} className={`st-hs-step ${c.state === "ok" ? "done" : c.state === "warn" ? "warn" : c.state === "fail" ? "fail" : ""}`}>
                            <Icon name={c.state === "pending" ? "arrow-right" : c.state === "fail" ? "x" : "check"} size={10} />
                            <span>{c.label}{c.state === "warn" && c.warnNote ? ` — ${c.warnNote}` : ""}</span>
                          </div>
                        ))}
                      </div>
                      {listing.status === "rejected" && (
                        <>
                          <div className="sd-auth-err" style={{ marginTop: 8 }}>{listing.rejectReason}</div>
                          <div className="sd-pub-row" style={{ marginTop: 8 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setPub({
                              name: (listing.name.replace(/\b(best|#1|guaranteed|perfect|instant)\b/gi, "").replace(/\s+/g, " ").trim()) || listing.name,
                              price: listing.price,
                              resubmitId: listing.id,
                            })}>Edit & resubmit</button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <div className="sd-trace-done" style={{ marginTop: 0 }}><Icon name="check" size={11} /> Listed — passed all 5 checks, live in the Store</div>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("store")}>View in Store <Icon name="arrow-right" size={11} /></button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
};

// =============================================================
// Compose — the native builder (unchanged flow, honest publish)
// =============================================================
const ComposeMode = ({ flash, onPublished }) => {
  const [name, setName] = useSdState("Phone Rep II");
  const [role, setRole] = useSdState("Overflow line — books and reschedules after hours");
  const [skills, setSkills] = useSdState(["Booking", "Reschedules", "Refund triage"]);
  const [channels, setChannels] = useSdState(["phone", "sms"]);
  const [tone, setTone] = useSdState("Warm");
  const [guards, setGuards] = useSdState(["Never discounts alone", "Escalates complaints"]);
  const [knowledge, setKnowledge] = useSdState(["Service menu & pricing", "Policies v4.2"]);
  const [autonomy, setAutonomy] = useSdState("ask");
  const [saved, setSaved] = useSdState(false);
  const [published, setPublished] = useSdState(false);

  const glyph = (name.trim()[0] || "N").toUpperCase();
  const credits = 150 + skills.length * 25 + channels.length * 50;
  const toggle = (set) => (v) => set(list => list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const applyTemplate = (t) => {
    setName(t.preset.name); setRole(t.preset.role); setSkills(t.preset.skills);
    setChannels(t.preset.channels); setTone(t.preset.tone); setPublished(false);
  };
  const valid = name.trim() && skills.length > 0 && channels.length > 0;

  const publish = () => {
    const id = sdKebab(name);
    window.AS_STORE.addToFleet(window.AS_STORE.entry({
      id, glyph, name: name.trim(), role: role.trim() || "Custom agent", price: credits, channels,
      autonomyLabel: SD_AUT_HINT[autonomy],
      sourceLine: "Published from Agent Studio",
    }));
    setPublished(true);
    onPublished();
    flash({
      msg: <><b>{name.trim()}</b> published — provisioning in your Fleet</>,
      undo: () => { window.AS_STORE.uninstall(id); setPublished(false); onPublished(); },
      links: [{ label: "Open in Fleet", to: `fleet/${id}` }],
    });
  };

  return (
    <>
      <div className="cl-controls">
        <span className="cal-week-range">Start from</span>
        <div className="cl-controls-right" style={{ marginLeft: 12, marginRight: "auto" }}>
          <div className="cl-tabs">
            {SD_TEMPLATES.map(t => (
              <button key={t.id} className="cl-tab" onClick={() => applyTemplate(t)}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="sd-body">
        <div className="sd-form">
          <section className="fl-card">
            <div className="fl-card-head"><span className="fl-card-title">Identity</span></div>
            <input className="sd-input" value={name} onChange={e => { setName(e.target.value); setPublished(false); }} placeholder="Agent name" />
            <input className="sd-input" value={role} onChange={e => setRole(e.target.value)} placeholder="One-line role — what it does for you" />
          </section>

          <section className="fl-card">
            <div className="fl-card-head"><span className="fl-card-title">Abilities</span><span className="fl-card-sub">{skills.length} selected</span></div>
            <div className="sd-chips">
              {SD_SKILLS.map(s => (
                <button key={s} className={`sd-chip ${skills.includes(s) ? "on" : ""}`} onClick={() => { toggle(setSkills)(s); setPublished(false); }}>
                  {skills.includes(s) && <Icon name="check" size={10} />}{s}
                </button>
              ))}
            </div>
            <div className="fl-card-head" style={{ margin: "14px 0 10px" }}><span className="fl-card-title">Channels</span></div>
            <div className="sd-chips">
              {SD_CHANNELS.map(c => (
                <button key={c.id} className={`sd-chip ${channels.includes(c.id) ? "on" : ""}`} onClick={() => toggle(setChannels)(c.id)}>
                  <Icon name={c.icon} size={11} />{c.id}
                </button>
              ))}
            </div>
          </section>

          <section className="fl-card">
            <div className="fl-card-head"><span className="fl-card-title">Voice & guardrails</span></div>
            <div className="cl-tabs" style={{ marginBottom: 12 }}>
              {SD_TONES.map(t => (
                <button key={t} className={`cl-tab ${tone === t ? "active" : ""}`} onClick={() => setTone(t)}>{t}</button>
              ))}
            </div>
            <div className="sd-chips">
              {SD_GUARDRAILS.map(g => (
                <button key={g} className={`sd-chip ${guards.includes(g) ? "on" : ""}`} onClick={() => toggle(setGuards)(g)}>
                  <Icon name="shield" size={10} />{g}
                </button>
              ))}
            </div>
          </section>

          <section className="fl-card">
            <div className="fl-card-head"><span className="fl-card-title">Knowledge</span><span className="fl-card-sub">sources it can cite</span></div>
            <div className="sd-chips">
              {SD_KNOWLEDGE.map(k => (
                <button key={k} className={`sd-chip ${knowledge.includes(k) ? "on" : ""}`} onClick={() => toggle(setKnowledge)(k)}>
                  <Icon name="content" size={10} />{k}
                </button>
              ))}
            </div>
            <button className="sd-memnote" onClick={() => window.CHANLY.nav(window.CHANLY.R.admin("memory"))}>
              <Icon name="sparkle" size={11} />
              Inherits 5 workspace memories · 2 high-impact
              <Icon name="arrow-right" size={10} />
            </button>
          </section>

          <section className="fl-card">
            <div className="fl-card-head"><span className="fl-card-title">How it ships</span></div>
            <SdAutonomySeg value={autonomy} onChange={setAutonomy} />
          </section>
        </div>

        <aside className="sd-preview">
          <div className="fl-card sd-preview-card">
            <div className="fl-card-head">
              <span className="fl-card-title">Preview</span>
              {published && <span className="pill pill-accent"><span className="live-dot" style={{ width: 5, height: 5 }} />Live</span>}
            </div>
            <div className="sd-prev-head">
              <span className="st-tile lg">{glyph}</span>
              <div className="st-card-titles">
                <span className="st-modal-name">{name.trim() || "Unnamed agent"}</span>
                <span className="st-card-role">{role.trim() || "Give it a one-line role"}</span>
              </div>
            </div>
            <div className="st-chips" style={{ margin: "10px 0" }}>
              {channels.map(c => <span key={c} className="st-chip st-chip-ch"><Icon name={(SD_CHANNELS.find(x => x.id === c) || {}).icon || "chat"} size={11} /></span>)}
              {skills.slice(0, 5).map(s => <span key={s} className="st-chip">{s}</span>)}
              {skills.length > 5 && <span className="st-chip">+{skills.length - 5}</span>}
            </div>
            <div className="sd-sample">
              <div className="st-modal-label">Sample reply · {tone.toLowerCase()}</div>
              <div className="tl-msg agent" style={{ justifyContent: "flex-start" }}>
                <div className="tl-msg-bubble" style={{ alignItems: "flex-start" }}>
                  <div className="tl-msg-body">{SD_SAMPLE[tone]}</div>
                </div>
              </div>
            </div>
            <SdSimulate skills={skills} guards={guards} tone={tone} />
            <div className="cl-prof-attr-list">
              <div className="cl-prof-attr"><span className="cl-prof-attr-key">Autonomy</span><span className="cl-prof-attr-val">{autonomy === "ask" ? "Ask me first" : autonomy === "earn" ? "Earn autonomy" : "Full auto"}</span></div>
              <div className="cl-prof-attr"><span className="cl-prof-attr-key">Guardrails</span><span className="cl-prof-attr-val">{guards.length} active</span></div>
              <div className="cl-prof-attr"><span className="cl-prof-attr-key">Est. cost</span><span className="cl-prof-attr-val tabular">{credits} credits/mo</span></div>
            </div>
            {published && <div className="cal-ev-flash ok"><Icon name="check" size={11} /> Published — provisioning, now in your Fleet</div>}
            <div className="sd-actions">
              <button className="btn btn-sm" disabled={saved} onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 1600); }}>
                {saved ? "Draft saved ✓" : "Save draft"}
              </button>
              {!published ? (
                <button className="btn btn-primary btn-sm" disabled={!valid} onClick={publish}>
                  <Icon name="agents" size={12} /> Publish to Fleet
                </button>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={() => window.CHANLY.nav(CHANLY.R.agent(sdKebab(name)))}>
                  Open in Fleet <Icon name="arrow-right" size={11} />
                </button>
              )}
            </div>
          </div>
        </aside>
      </div>
    </>
  );
};

// Simulation — replay real history through the composed agent BEFORE it meets
// customers: the trust engine applied to onboarding (#20).
const SD_SIM_CASES = (skills, guards, tone) => ([
  {
    who: "Maya Rodriguez", asked: "Can I move Friday to Saturday morning?",
    ok: skills.includes("Reschedules"),
    reply: skills.includes("Reschedules")
      ? (tone === "Playful" ? "Sat 10:15 just opened with Lena — grab it? I'll move you over." : tone === "Professional" ? "Saturday 10:15 AM with Lena is available — shall I move your Friday booking?" : "Saturday 10:15 with Lena is open — want me to move you and text the confirmation?")
      : "Hands off to you — Reschedules isn't in this agent's skill set.",
    verdict: skills.includes("Reschedules") ? { tone: "ok", label: "Handles it · books the change" } : { tone: "warn", label: "Would hand off — add Reschedules" },
  },
  {
    who: "Aisha Khan", asked: "I want my $120 no-show fee refunded.",
    ok: true,
    reply: "I hear you — the owner handles refunds personally. I can get you on a call with Sarah today at 4:30 so it's sorted properly. Hold that slot?",
    verdict: { tone: "ok", label: "On charter · money goes to you" },
  },
  {
    who: "Jordan Patel", asked: "Maya said she gets 20% off — can I get the same?",
    ok: guards.includes("Never discounts alone"),
    reply: guards.includes("Never discounts alone")
      ? "Maya's rate was a campaign that's ended — but let me set up a quick intro call and Sarah can talk options. Tomorrow 2:00 or 4:30?"
      : "Sure — I can apply 20% to your first visit!",
    verdict: guards.includes("Never discounts alone")
      ? { tone: "ok", label: "On charter · books the call" }
      : { tone: "danger", label: "Would invent a discount — add \u201CNever discounts alone\u201D" },
  },
]);

const SdSimulate = ({ skills, guards, tone }) => {
  const [shown, setShown] = useSdState(0);
  const [running, setRunning] = useSdState(false);
  const cases = SD_SIM_CASES(skills, guards, tone);
  const run = () => {
    setShown(0); setRunning(true);
    let i = 0;
    const t = setInterval(() => { i += 1; setShown(i); if (i >= cases.length) { clearInterval(t); setRunning(false); } }, 550);
  };
  const passes = cases.filter(c => c.ok).length;
  return (
    <div className="sd-sim">
      <div className="sd-sim-head">
        <span className="st-modal-label" style={{ margin: 0 }}>Simulate · replayed from your history</span>
        <button className="btn btn-sm" onClick={run} disabled={running}>
          <Icon name="play" size={11} /> {shown > 0 && !running ? "Re-run" : running ? "Replaying\u2026" : "Run 3 conversations"}
        </button>
      </div>
      {shown > 0 && (
        <div className="sd-sim-rows">
          {cases.slice(0, shown).map((c, i) => (
            <div key={i} className="sd-sim-row">
              <div className="sd-sim-q"><b>{c.who}</b> · “{c.asked}”</div>
              <div className="sd-sim-a">{c.reply}</div>
              <span className={`sd-sim-verdict ${c.verdict.tone}`}>{c.verdict.label}</span>
            </div>
          ))}
          {shown >= cases.length && (
            <div className="sd-sim-sum">{passes} of {cases.length} on charter — {passes === cases.length ? "ready to publish." : "fix the flagged gap before publishing."}</div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------- Page ----------
const AgentStudioPage = () => {
  // Land on Connect when a session listing needs attention (e.g. rejected review)
  const [mode, setMode] = useSdState(() =>
    ((((window.STORE_DATA || {}).STORE_LISTINGS) || []).some(l => l.review && l.status === "rejected")) ? "connect" : "compose"
  );
  const [toastNode, flash] = window.usePPToast();
  const [, setTick] = useSdState(0);
  const bump = () => setTick(t => t + 1);

  useSdEffect(() => {
    window.addEventListener("store:installed", bump);
    return () => window.removeEventListener("store:installed", bump);
  }, []);

  const customCount = 1 + (window.AS_STORE ? window.AS_STORE.addedCount() : 0);

  return (
    <div className="studio">
      <div className="cl-head">
        <div className="cl-head-titles">
          <div className="cl-page-title">Agent Studio</div>
          <div className="cl-page-sub">
            Compose a native agent — or connect one you already run elsewhere, test the handshake, and publish it to the Store.
          </div>
        </div>
        <StatStrip className="cl-head-stats">
          <StatCell label="Custom agents" value={customCount} meta="in your fleet" />
          <StatCell label="Abilities" value={SD_SKILLS.length} meta="available to compose" />
          <StatCell label="Your listings" value={window.AS_STORE ? window.AS_STORE.listings().length : 0} meta="in the Store" />
        </StatStrip>
      </div>

      <div className="cl-controls">
        <div className="cl-tabs">
          <button className={`cl-tab ${mode === "compose" ? "active" : ""}`} onClick={() => setMode("compose")}>Compose</button>
          <button className={`cl-tab ${mode === "connect" ? "active" : ""}`} onClick={() => setMode("connect")}>Connect external</button>
        </div>
      </div>

      {mode === "compose"
        ? <ComposeMode flash={flash} onPublished={bump} />
        : <ConnectMode flash={flash} />}
      {toastNode}
    </div>
  );
};

window.AgentStudioPage = AgentStudioPage;
