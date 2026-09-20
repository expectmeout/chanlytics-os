/* global React, Icon */
// AskBar — the conversational AI surface invoked by ⌘K.
// v2: persistent threads. Every conversation is saved and resumable — the
// sidebar's "New Chat" starts a fresh one, ⌘K resumes where you left off.
// Answers are grounded in the seed world and link out to real surfaces.

const ASK_SEED_THREADS = [
  {
    id: "at-refund",
    title: "Why did the refund get paused?",
    at: "3m ago",
    msgs: [
      { role: "user", text: "Why did the refund get paused?" },
      { role: "ai", text: "Aisha Khan asked for a $120 refund after her second no-show this week. Phone Rep paused it because refunds over $100 always come to you, and she already used her Q1 waiver. The draft counters with a $120 credit instead — best expected value given her $1,040 LTV.", links: [{ label: "Decide in Inbox", to: "inbox/th-aisha-refund" }, { label: "Open Aisha", to: "clients/c-aisha" }] },
      { role: "user", text: "What happens if I decline?" },
      { role: "ai", text: "The churn model puts her at 78% likely to leave — that's roughly $1,040 of lifetime value at risk to save $120 today. Declining also uses your one 'hard no' with a 7-visit regular. The counter-offer keeps the money and the relationship.", links: [{ label: "See the outcomes", to: "inbox/th-aisha-refund" }] },
    ],
  },
  {
    id: "at-lena",
    title: "How booked is Lena this week?",
    at: "1h ago",
    msgs: [
      { role: "user", text: "How booked is Lena this week?" },
      { role: "ai", text: "Lena is at 82% capacity this week — 19 of 23 bookable hours. Today she has Maya (done), Aisha (no-show), Selena (live now), and Jordan's intro at 1:00pm. Jay is at 61%, so new bookings are being steered his way first.", links: [{ label: "Open Calendar", to: "calendar" }] },
    ],
  },
];

const ASK_ROUTE_HINTS = [
  { match: /refund|approve|decline/i, label: "Decide in Inbox", to: "inbox" },
  { match: /segment|smart list|lapsed|drifting|no-show list/i, label: "Open Segments", to: "segments" },
  { match: /revenue|report|convert|credit|return/i, label: "Open Reports", to: "reports" },
  { match: /book|calendar|schedule|slot|resched/i, label: "Open Calendar", to: "calendar" },
  { match: /agent|fleet|autonomy|pause/i, label: "Open Fleet", to: "fleet" },
  { match: /client/i, label: "Open Clients", to: "clients" },
];

// Named people resolve to their actual records — never the generic page
const ASK_ENTITIES = [
  { match: /maya/i,   label: "Open Maya",   to: "clients/c-maya" },
  { match: /jordan/i, label: "Open Jordan", to: "clients/c-jordan" },
  { match: /aisha/i,  label: "Open Aisha",  to: "clients/c-aisha" },
  { match: /priya/i,  label: "Open Priya",  to: "clients/c-priya" },
  { match: /david/i,  label: "Open David",  to: "clients/c-david-chen" },
  { match: /yuki/i,   label: "Open Yuki",   to: "clients/c-yuki" },
  { match: /marcus/i, label: "Open Marcus", to: "clients/c-marcus" },
];

const askLoadThreads = () => {
  try {
    const raw = localStorage.getItem("chanlytics-ask-threads");
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return ASK_SEED_THREADS;
};
// Persist links but STRIP action chips — their run() functions don't survive
// JSON, and a dead chip that pretends to work is worse than none.
const askSaveThreads = (threads) => {
  try {
    const clean = threads.map((t) => ({
      ...t,
      msgs: t.msgs.map((m) => m.actions ? { ...m, actions: null } : m),
    }));
    localStorage.setItem("chanlytics-ask-threads", JSON.stringify(clean));
  } catch (e) {}
};

// Relative timestamps — stored as epochs so they don't fossilize as "just now"
const askAgo = (t) => {
  if (t.ts) {
    const s = Math.max(0, (Date.now() - t.ts) / 1000);
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    return "earlier";
  }
  return t.at || "";
};

const askAnswerFor = (q, topic = null) => {
  // —— Follow-up context: short questions answer in-topic, not generically ——
  const isFollowUp = q.length < 60 && /decline|what if|why|instead|risk|and then|worth it/i.test(q) && !/jordan|aisha|lena|vip|revenue/i.test(q);
  if (isFollowUp && topic === "jordan") {
    return {
      role: "ai",
      text: "If you decline Jordan: Phone Rep sends a graceful pass and offers the standard intro rate. The model puts conversion at ~40% without the referral rate vs 74% with it — roughly $530 of expected first-year value at risk to protect a $58 discount. Maya also finds out how her referral was treated.",
      links: [{ label: "Decide in Inbox", to: "inbox/th-jordan-discount" }],
    };
  }
  if (isFollowUp && topic === "aisha") {
    return {
      role: "ai",
      text: "If you decline Aisha outright: the churn model puts her at 78% likely to leave — about $1,040 LTV at risk over $120. That's why the plan keeps it human — Phone Rep never decides the refund; it books her onto a resolution call with you at 4:30 and you make the call there. Your no-show guardrail still requires a deposit on her next booking either way.",
      links: [{ label: "Decide in Inbox", to: "inbox/th-aisha-refund" }],
    };
  }
  if (isFollowUp && topic === "pause") {
    return {
      role: "ai",
      text: "While paused: nothing new starts, in-flight threads route to your Inbox, and scheduled sends hold. Nothing is lost — the queue resumes exactly where it stopped. Pauses live in Fleet, so you can flip it back from there or right here.",
      links: [{ label: "Open Fleet", to: "fleet" }],
    };
  }

  // Draft a win-back — routes to the broadcast composer pre-scoped to the list
  if (/(draft|write|compose|re-?engage|win-?back|reach out)/i.test(q) && /drift|vip|lapsed/i.test(q)) {
    return {
      role: "ai",
      text: "4 Drifting VIPs are cooling — about $6.1k of LTV. Recovery Agent already runs a win-back on them and offers cap at 20% per your guardrail. I'll open the broadcast composer scoped to this list; consent and DNC are filtered out automatically before anything sends.",
      links: [
        { label: "Open composer", to: "broadcasts/drifting-vips" },
        { label: "See the list", to: "segments/drifting-vips" },
      ],
    };
  }

  // Segment-aware canned answer — grounded in the live lists
  if (/vip/i.test(q) && /drift|who|list/i.test(q)) {
    return {
      role: "ai",
      text: "4 people are in Drifting VIPs right now — Yuki Tanaka (30d, outreach paused per her ask), Marcus Lee (49d, last nudge queued), Priya Shah (63d), and Amelia Brooks (76d). That's about $6.1k of LTV cooling off. Recovery Agent runs its win-back playbook on this list; offers cap at 20% per your guardrail.",
      links: [
        { label: "Open the list", to: "segments/drifting-vips" },
        { label: "Broadcast to them", to: "broadcasts/drifting-vips" },
      ],
    };
  }
  // —— Grounded answers + actions (Ask executes through the stores) ——
  const S = window.IX_STORE;

  // What's waiting on me — live IX-aware queue
  if (/wait|pending|needs? (my|your)|what.*(call|decide|attention)|queue/i.test(q) && !/jordan|aisha|wellness/i.test(q)) {
    const now = ((window.CHANLY_DATA || {}).AGENT_TASKS || {}).now || [];
    const open = now.filter(t => !(t.threadId && S && (S.get(t.threadId) || {}).kind === "decided"));
    if (open.length === 0) {
      return { role: "ai", text: "Queue clear — you've decided everything that was waiting. Agents will pause anything new that crosses your thresholds.", links: [{ label: "Open Inbox", to: "inbox" }] };
    }
    return {
      role: "ai",
      text: `${open.length} decision${open.length === 1 ? " is" : "s are"} waiting — ${open.map(t => `${t.who} (${t.kind.toLowerCase()})`).join(", ")}. Aisha's refund has been waiting longest (42m). A approves, D declines, right from the Inbox.`,
      links: open.filter(t => t.threadId).map(t => ({ label: t.who.split(" ")[0], to: `inbox/${t.threadId}` })).concat([{ label: "Open Inbox", to: "inbox" }]),
    };
  }

  // Revenue pacing — pulse numbers
  if (/revenue|pacing|sales|how('| i)?s today|numbers/i.test(q)) {
    const { pulse } = (window.CHANLY_DATA || {}).MORNING_BRIEF || { pulse: { revenue: 1840, target: 2400 } };
    const pct = Math.round((pulse.revenue / pulse.target) * 100);
    return {
      role: "ai",
      text: `$${pulse.revenue.toLocaleString()} booked against a $${pulse.target.toLocaleString()} pace — ${pct}%, ahead of yesterday by 22%. Phone Rep leads attribution ($840); the next 4 hours forecast +$640 more. Two campaigns (win-back, package nudges) are compounding underneath.`,
      links: [{ label: "Open Reports", to: "reports" }, { label: "Today's pulse", to: "today" }],
    };
  }

  // Lena capacity — promoted from the seed thread
  if (/lena|capacity|how booked/i.test(q)) {
    return {
      role: "ai",
      text: "Lena is at 82% capacity this week — 19 of 23 bookable hours. Today: Maya (done), Aisha (no-show), Selena (live now), Jordan's intro at 1:00pm. Jay sits at 61%, so agents steer new bookings his way first.",
      links: [{ label: "Open Calendar", to: "calendar" }],
    };
  }

  // Book Aisha's resolution call — money is owner-handled; the agent only books
  if (/(approve|book).*aisha|aisha.*(refund|approve|counter|resolution|call)/i.test(q)) {
    const at = ((window.INBOX_DATA || {}).THREADS || []).find(t => t.id === "th-aisha-refund");
    const rec = S && S.get("th-aisha-refund");
    if (rec && rec.kind === "decided") {
      return { role: "ai", text: `Already decided — you chose “${rec.action}” at ${rec.at}. Phone Rep is executing; undo from the thread if you've changed your mind.`, links: [{ label: "View thread", to: "inbox/th-aisha-refund" }] };
    }
    const action = at?.approval?.recommended || "Approve";
    const planLabel = at?.approval?.plan?.label || "Resolution call — today 4:30";
    return {
      role: "ai",
      text: `Aisha wants her $120 no-show fee refunded. Refunds are owner-handled — agents never decide money — so Phone Rep sent a holding message and drafted “${planLabel}”: she talks to you, and you decide the refund on the call. It protects ~$1,040 LTV (churn model says 78% if she's declined cold). I can book it right here; it resolves everywhere (Inbox, Today, Tasks, her profile).`,
      actions: [{
        label: "Approve — book the 4:30 call",
        run: () => S && S.set("th-aisha-refund", { action, at: window.CHANLY.IX_NOW, kind: "decided" }),
        done: `Booked — Phone Rep offers Aisha the 4:30 slot now and it's held on your calendar. Every surface reflects it; undo from the thread.`,
        doneLinks: [{ label: "View thread", to: "inbox/th-aisha-refund" }, { label: "Open Aisha", to: "clients/c-aisha" }],
        gateAction: "approve",
        undo: () => S && S.clear("th-aisha-refund"),
        undoDone: "Reverted — Aisha is back in Needs you on every surface.",
      }],
      links: [{ label: "Review first", to: "inbox/th-aisha-refund" }],
    };
  }

  // Compliance — can we message this person?
  if (/can (we|i) (text|message|sms|email|call)|consent|\bdnc\b|do not (call|message)/i.test(q)) {
    const all = [...(window.CLIENTS || []), ...(window.LEADS || [])];
    const hit = all.find((p) => p.name && q.toLowerCase().includes(p.name.split(" ")[0].toLowerCase()));
    if (hit) {
      const cp = window.CHANLY.compliance(hit.id);
      const ok = window.CHANLY.canMessage(hit.id);
      return {
        role: "ai",
        text: ok
          ? `Yes — ${hit.name} has consent on record${cp.method ? ` (${cp.method}${cp.date ? `, ${cp.date}` : ""})` : ""} and isn't on the DNC list.`
          : cp.dnc
          ? `No — ${hit.name} is on the DNC list${cp.date ? ` (checked ${cp.date})` : ""}. Agents hold them out of every send automatically; replying to their inbound is still allowed.`
          : `Not yet — ${hit.name}'s consent is ${cp.consent}. Agents hold them out of broadcasts until it's granted.`,
        links: [{ label: "Open profile", to: hit.stage ? window.CHANLY.R.lead(hit.id) : window.CHANLY.R.client(hit.id) }],
      };
    }
    return { role: "ai", text: "Consent & DNC are checked on every send automatically — broadcasts and batches hold back anyone without consent or on the DNC list. Ask about a specific person by name.", links: [{ label: "Clients", to: "clients" }] };
  }

  // Presence — Ask reads and flips it
  if (/set me (to )?(away|available)|go (away|offline)|back online|take transfers|transfers (on|off)|am i (away|available)/i.test(q)) {
    const P = window.PR_STORE;
    const away = P && P.away;
    return {
      role: "ai",
      text: away
        ? "You're Away — veto timers are frozen at their current second and phone agents use the holding line + async approval. Nothing auto-sends until you're back."
        : `You're Available — veto timers run and transfers are ${P && P.transfers ? "on: agents may warm-transfer live calls to you" : "off: callers get the holding line"}.`,
      actions: [{
        label: away ? "Set Available" : "Set Away",
        run: () => P && P.setAway(!away),
        done: away ? "Available — countdowns resumed where they froze; transfers follow your toggle." : "Away — countdowns froze; agents switch to the holding line.",
      }],
      links: [{ label: "Live monitor", to: "live" }],
    };
  }

  // Trust digest — live from RP_TRUST
  if (/trust|edit rate|how (are|'re) (the )?agents (doing|performing)|auto-?sent|earn(ing)?.{0,8}autonomy|more autonomy/i.test(q)) {
    const T = ((window.REPORTS_DATA || {}).RP_TRUST || {});
    const total = Object.values(T.byClass || {}).reduce((s, t) => s + t.sent, 0);
    const edits = Object.values(T.byClass || {}).reduce((s, t) => s + t.edited, 0);
    const best = Object.entries(T.byAgent || {}).sort((a, b) => (a[1].edited / a[1].sent) - (b[1].edited / b[1].sent))[0];
    const bestAgent = best && window.CHANLY.agentById(best[0]);
    return {
      role: "ai",
      text: `${total.toLocaleString()} agent messages went out on their own in the last 30 days; you edited ${edits} (${Math.round((edits / Math.max(1, total)) * 100)}%). Cleanest: ${bestAgent ? bestAgent.name : "—"} at ${best ? Math.round((best[1].edited / best[1].sent) * 100) : 0}%. Under 5% is the widen-autonomy signal — above it, tighten that class in the matrix.`,
      links: [{ label: "Reports", to: "reports" }, { label: "Policy matrix", to: "admin/autonomy" }],
    };
  }

  // What agents may do — answered live from window.POLICY
  if (/what can (the )?agents? do|polic(y|ies)|on their own|autonomy rules/i.test(q)) {
    const lines = window.POLICY.ROWS.map((r) => `${r.chip || r.label}: ${window.POLICY.modeOf(r.id)}${r.locked ? " (charter — books a call with you instead)" : ""}`).join(" · ");
    return {
      role: "ai",
      text: `Right now — ${lines}. Auto runs silently, Veto auto-sends after the window unless you step in, Ask waits for you, Never converts to a call.`,
      links: [{ label: "Open the matrix", to: "admin/autonomy" }],
    };
  }

  // Book Jordan's intro call — Ask acts through IX_STORE
  if (/approve.*jordan|book.*jordan|jordan.*(discount|pricing|approve|deal|intro|call)/i.test(q)) {
    const jt = ((window.INBOX_DATA || {}).THREADS || []).find(t => t.id === "th-jordan-discount");
    const rec = S && S.get("th-jordan-discount");
    if (rec && rec.kind === "decided") {
      return { role: "ai", text: `Already decided — you chose “${rec.action}” at ${rec.at}. Phone Rep is executing; undo from the thread if you've changed your mind.`, links: [{ label: "View thread", to: "inbox/th-jordan-discount" }] };
    }
    const action = jt?.approval?.recommended || "Approve";
    return {
      role: "ai",
      text: `Jordan asked about Maya's 20% referral rate. Phone Rep drafted an intro-call offer — Thursday 2:00 or 4:30, 82% confidence; the rate is quoted on the call. I can send it right here; it resolves everywhere (Inbox, Today, Pipeline, Tasks).`,
      actions: [{
        label: "Approve — offer the slots",
        run: () => S && S.set("th-jordan-discount", { action, at: window.CHANLY.IX_NOW, kind: "decided" }),
        done: "Approved — Phone Rep is offering Jordan your Thursday slots now. Every surface reflects it; undo from the thread.",
        doneLinks: [{ label: "View thread", to: "inbox/th-jordan-discount" }],
        gateAction: "approve",
        undo: () => S && S.clear("th-jordan-discount"),
        undoDone: "Reverted — Jordan is back in Needs you on every surface.",
      }],
      links: [{ label: "Review first", to: "inbox/th-jordan-discount" }],
    };
  }

  // Pause / resume an agent — Ask acts through FL_STORE
  const pauseMatch = q.match(/\b(pause|resume|unpause)\b.*?\b(sms|phone|chat|email|recovery|review|qualifier|objection)\b/i);
  if (pauseMatch) {
    const verb = pauseMatch[1].toLowerCase();
    const frag = pauseMatch[2].toLowerCase();
    const agent = (window.CHANLY.agents() || []).find(a => a.name.toLowerCase().includes(frag));
    if (agent) {
      const paused = window.FL_STORE && window.FL_STORE.statuses[agent.id] === "paused";
      const wantPause = verb === "pause";
      if (wantPause === paused) {
        return { role: "ai", text: `${agent.name} is already ${paused ? "paused" : "running"}.`, links: [{ label: "Open agent", to: `fleet/${agent.id}` }] };
      }
      return {
        role: "ai",
        text: wantPause
          ? `${agent.name} handles ${agent.role.toLowerCase()} — pausing stops new work immediately and routes in-flight items to your Inbox. Scheduled sends hold until you resume.`
          : `${agent.name} will pick its queue back up exactly where it left off.`,
        actions: [{
          label: wantPause ? `Pause ${agent.name}` : `Resume ${agent.name}`,
          run: () => window.FL_STORE && window.FL_STORE.setStatus(agent.id, wantPause ? "paused" : null),
          done: wantPause
            ? `${agent.name} paused — the Fleet page and Today both show it. Resume any time.`
            : `${agent.name} resumed — back on its queue.`,
          doneLinks: [{ label: "Open agent", to: `fleet/${agent.id}` }],
          gateAction: "autonomy",
        }],
        links: [{ label: "Open Fleet", to: `fleet/${agent.id}` }],
      };
    }
  }

  // Teach the agents — the shared knowledge base every agent answers from
  if (/teach|new (answer|faq)|knowledge base|remember this|add (an? )?(faq|answer)|agents?.{0,12}(learn|remember|memory)/i.test(q)) {
    return {
      role: "ai",
      text: "Agents answer FAQs from one shared knowledge base — your hours, prices, and policies. Add or edit an answer in Memory and every agent uses it on the next conversation. Per your charter they'll quote list prices but never invent exceptions — a money moment always books a call with you.",
      links: [{ label: "Open Memory", to: "admin/memory" }],
    };
  }

  // Approve all safe drafts — the batch verb, same threshold as everywhere (#12)
  if (/approve (all|every).{0,12}(safe|draft)|all safe/i.test(q)) {
    const T = ((window.INBOX_DATA || {}).THREADS) || [];
    const safe = T.filter(t => t.state === "needs" && t.confidence >= 0.8 && !(window.IX_STORE && window.IX_STORE.get(t.id)));
    if (!safe.length) return { role: "ai", text: "Nothing qualifies right now — every waiting decision is under the 80% confidence bar or already decided. The queue only batches what's safe.", links: [{ label: "Open Inbox", to: "inbox" }] };
    return {
      role: "ai",
      text: `${safe.length} draft${safe.length === 1 ? "" : "s"} sit at 80%+ confidence: ${safe.map(t => t.who).join(", ")}. Approving batches them in one move — one Undo reverses it, and everything else stays waiting for you.`,
      actions: [{
        label: `Approve ${safe.length} — agents send now`,
        run: () => safe.forEach(t => window.IX_STORE.set(t.id, { action: (t.approval && t.approval.recommended) || "Approve", at: window.CHANLY.IX_NOW, kind: "decided" })),
        done: "Approved — receipts are in each thread and the Tasks ledger. Undo from any thread.",
        undo: () => safe.forEach(t => window.IX_STORE.clear(t.id)),
      }],
      links: [{ label: "Open Inbox", to: "inbox" }],
    };
  }

  const entity = ASK_ENTITIES.find((e) => e.match.test(q));
  const hint = ASK_ROUTE_HINTS.find((h) => h.match.test(q));
  const links = [];
  if (entity) links.push({ label: entity.label, to: entity.to });
  if (hint) links.push({ label: hint.label, to: hint.to });
  if (links.length === 0) links.push({ label: "Open Today", to: "today" });
  return {
    role: "ai",
    text: "Here's what I can see: " + (entity || hint
      ? "this touches work your agents are already tracking — I've pulled the relevant surface below. Ask a follow-up and I'll go deeper."
      : "I've noted it. Ask a follow-up, or jump to Today for the live picture."),
    links,
  };
};

// Topic detection for follow-up memory — stored per thread on each exchange
const askTopicFor = (q, prev = null) => {
  if (/jordan/i.test(q)) return "jordan";
  if (/aisha|refund/i.test(q)) return "aisha";
  if (/\b(pause|resume|unpause)\b/i.test(q)) return "pause";
  return prev;
};

// Global entry point for agent actions anywhere in the app:
// askAbout({ prompt, title?, answer?, links?, mode: "thread" | "compose" })
window.askAbout = (detail) => {
  if (window.appAsk) window.appAsk();
  window.dispatchEvent(new CustomEvent("ask:seed", { detail: detail || {} }));
};

// ⌘K is a palette too: typing matches pages and entities for instant jumps
const ASK_JUMP_PAGES = [
  { label: "Today", to: "today" }, { label: "Inbox", to: "inbox" }, { label: "Clients", to: "clients" },
  { label: "Leads", to: "clients/leads" }, { label: "Segments", to: "segments" }, { label: "Pipeline", to: "pipeline" },
  { label: "Calendar", to: "calendar" }, { label: "Conversations", to: "conversations" }, { label: "Live Monitor", to: "live" },
  { label: "Fleet", to: "fleet" }, { label: "Agent Store", to: "store" }, { label: "Tasks", to: "tasks" },
  { label: "Reports", to: "reports" }, { label: "Broadcasts", to: "broadcasts" }, { label: "Outbound", to: "outbound" },
  { label: "Content", to: "content" }, { label: "Settings", to: "admin" },
];
const askJumpMatches = (q) => {
  const s = q.trim().toLowerCase();
  if (s.length < 2 || s.split(/\s+/).length > 3 || /\?$/.test(s)) return [];
  const out = [];
  for (const p of ASK_JUMP_PAGES) if (p.label.toLowerCase().includes(s)) out.push({ ...p, kind: "page", icon: "arrow-right" });
  for (const c of (window.CLIENTS || [])) if (c.name.toLowerCase().includes(s)) out.push({ label: c.name, to: `clients/${c.id}`, kind: "client", icon: "users" });
  for (const l of (window.LEADS || [])) if (l.name.toLowerCase().includes(s)) out.push({ label: l.name, to: window.CHANLY.R.lead(l.id), kind: "lead", icon: "bolt" });
  for (const t of (((window.INBOX_DATA || {}).THREADS) || [])) if (t.who.toLowerCase().includes(s)) out.push({ label: `${t.who} — thread`, to: `inbox/${t.id}`, kind: "thread", icon: "inbox" });
  for (const a of (window.CHANLY ? window.CHANLY.agents() : [])) if (a.name.toLowerCase().includes(s)) out.push({ label: a.name, to: `fleet/${a.id}`, kind: "agent", icon: "agents" });
  for (const g of (window.CLIENT_SEGMENTS || [])) if (g.label.toLowerCase().includes(s)) out.push({ label: g.label, to: `segments/${g.id}`, kind: "list", icon: "filter" });
  return out.slice(0, 6);
};

const AskAnswer = ({ msg, onClose, onAction }) => (
  <div className="ask-msg ai">
    <span className="ask-msg-avatar"><Icon name="sparkle" size={11} /></span>
    <div className="ask-msg-body">
      <p className="ask-msg-text">{msg.text}</p>
      {(msg.actions || msg.links) && (
        <div className="ask-msg-links">
          {(msg.actions || []).map((a, i) => (
            <button key={"a" + i} className="ask-action-chip" onClick={() => onAction(a)}>
              <Icon name="check" size={11} /> {a.label}
            </button>
          ))}
          {(msg.links || []).map((l, i) => (
            <button key={i} className="ask-link-chip" onClick={() => { onClose(); window.CHANLY.nav(l.to); }}>
              {l.label} <Icon name="arrow-right" size={10} />
            </button>
          ))}
        </div>
      )}
    </div>
  </div>
);

const AskBarSeed = ({ open, onClose }) => {
  const { ASK_SUGGESTIONS } = window.CHANLY_DATA;
  const [query, setQuery] = React.useState("");
  const [threads, setThreads] = React.useState(askLoadThreads);
  const [activeId, setActiveId] = React.useState(null);
  const [railQuery, setRailQuery] = React.useState("");
  const [seedCtx, setSeedCtx] = React.useState(null);
  const [toastNode, ppFlash] = window.usePPToast();
  const inputRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const bodyRef = React.useRef(null);
  const [sel, setSel] = React.useState(0);

  const active = threads.find((t) => t.id === activeId) || null;

  const removeThread = (t) => {
    const idx = threads.findIndex((x) => x.id === t.id);
    const next = threads.filter((x) => x.id !== t.id);
    setThreads(next);
    askSaveThreads(next);
    if (activeId === t.id) setActiveId(null);
    ppFlash({
      msg: <>Thread <b>“{t.title}”</b> deleted</>,
      undo: () => setThreads((prev) => {
        const restored = [...prev];
        restored.splice(Math.min(idx, restored.length), 0, t);
        askSaveThreads(restored);
        return restored;
      }),
    });
  };

  const clearHistory = () => {
    const prev = threads;
    setThreads([]);
    askSaveThreads([]);
    setActiveId(null);
    ppFlash({
      msg: <>Ask history cleared — {prev.length} thread{prev.length === 1 ? "" : "s"} removed</>,
      undo: () => { setThreads(prev); askSaveThreads(prev); },
    });
  };

  React.useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, activeId]);

  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && open) onClose(); };
    const onNew = () => { setActiveId(null); setQuery(""); };
    const onSeed = (e) => {
      const d = (e && e.detail) || {};
      if (d.mode === "compose") { setActiveId(null); setQuery(d.prompt || ""); return; }
      const q = d.prompt || "Help me with this";
      const title = d.title || (q.length > 44 ? q.slice(0, 44) + "…" : q);
      setSeedCtx(d.about || (d.prompt ? String(d.prompt).slice(0, 64) : null));
      const base = askAnswerFor(q);
      const ai = { role: "ai", text: d.answer || base.text, links: d.links || base.links, actions: d.actions || base.actions };
      setThreads((prev) => {
        // Dedupe: an identical seed appends to its existing thread instead of cloning
        const existing = prev.find((t) => t.title === title);
        let next;
        if (existing) {
          next = prev.map((t) => t.id === existing.id
            ? { ...t, ts: Date.now(), topic: askTopicFor(q, t.topic), msgs: [...t.msgs, { role: "user", text: q }, ai] }
            : t);
          setActiveId(existing.id);
        } else {
          const id = "at-" + Date.now();
          next = [{ id, title, ts: Date.now(), topic: askTopicFor(q), msgs: [{ role: "user", text: q }, ai] }, ...prev];
          setActiveId(id);
        }
        askSaveThreads(next);
        return next;
      });
      setQuery("");
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("ask:new", onNew);
    window.addEventListener("ask:seed", onSeed);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("ask:new", onNew); window.removeEventListener("ask:seed", onSeed); };
  }, [open, onClose]);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeId, threads]);

  // Reset the keyboard cursor whenever the visible list changes
  React.useEffect(() => { setSel(0); }, [query, activeId, open]);

  // Reopen clean: drop a stale search (an open conversation still resumes)
  React.useEffect(() => { if (!open) setQuery(""); }, [open]);

  // Keep the selected row in view without scrollIntoView (which jars the app)
  React.useEffect(() => {
    const b = bodyRef.current; if (!b) return;
    const el = b.querySelector(".cmd-row.sel"); if (!el) return;
    const t = el.offsetTop, h = el.offsetHeight, st = b.scrollTop, ch = b.clientHeight;
    if (t < st) b.scrollTop = Math.max(0, t - 8);
    else if (t + h > st + ch) b.scrollTop = t + h - ch + 8;
  }, [sel]);

  if (!open) return null;

  const submit = (qArg) => {
    const q = (typeof qArg === "string" ? qArg : query).trim();
    if (!q) return;
    const userMsg = { role: "user", text: q };
    const topic = askTopicFor(q, active ? active.topic : null);
    const aiMsg = askAnswerFor(q, active ? active.topic : null);
    let next;
    if (active) {
      next = threads.map((t) => t.id === active.id ? { ...t, ts: Date.now(), topic, msgs: [...t.msgs, userMsg, aiMsg] } : t);
    } else {
      const newTitle = q.length > 44 ? q.slice(0, 44) + "…" : q;
      const dup = threads.find((t) => t.title === newTitle);
      if (dup) {
        next = threads.map((t) => t.id === dup.id ? { ...t, ts: Date.now(), topic, msgs: [...t.msgs, userMsg, aiMsg] } : t);
        setActiveId(dup.id);
        setThreads(next);
        askSaveThreads(next);
        setQuery("");
        return;
      }
      const id = "at-" + Date.now();
      next = [{ id, title: newTitle, ts: Date.now(), topic, msgs: [userMsg, aiMsg] }, ...threads];
      setActiveId(id);
    }
    setThreads(next);
    askSaveThreads(next);
    setQuery("");
  };

  // Action chips execute through the stores, then confirm in-thread
  const runAction = (a) => {
    // Role gate — denied actions explain themselves and change nothing
    if (a.gateAction && window.canDo && !window.canDo(a.gateAction)) {
      a = { run: null, done: window.gateTitle(a.gateAction) + " — nothing was changed.", doneLinks: [{ label: "Workspace roles", to: "admin/team" }] };
    }
    try { a.run && a.run(); } catch (e) {}
    if (!active) return;
    const confirmMsg = { role: "ai", text: a.done || "Done.", links: a.doneLinks || [], actions: a.undo ? [{ label: "Undo", run: a.undo, done: a.undoDone || "Undone — everything reverted on every surface." }] : null };
    setThreads((prev) => {
      const next = prev.map((t) => t.id === active.id
        ? { ...t, ts: Date.now(), msgs: [...t.msgs.map((m) => m.actions ? { ...m, actions: null } : m), confirmMsg] }
        : t);
      askSaveThreads(next);
      return next;
    });
  };

  // ---- Live context + ranked command rows (keyboard-first rebuild) ----
  const S = window.IX_STORE;
  const nowTasks = (((window.CHANLY_DATA || {}).AGENT_TASKS) || {}).now || [];
  const openWaiting = nowTasks.filter((t) => !(t.threadId && S && (S.get(t.threadId) || {}).kind === "decided"));
  const decidedOf = (tid) => !!(S && (S.get(tid) || {}).kind === "decided");
  const iconFor = (k) => k === "act" ? "zap" : k === "draft" ? "edit" : "sparkle";
  const mapSug = (s) => {
    const isAct = s.kind === "act";
    const done = isAct && ((/jordan/i.test(s.q) && decidedOf("th-jordan-discount")) || (/aisha/i.test(s.q) && decidedOf("th-aisha-refund")));
    const badge = /waiting on me/i.test(s.q) && openWaiting.length ? String(openWaiting.length) : null;
    return { type: s.kind, icon: iconFor(s.kind), label: s.q, q: s.q, done, badge };
  };

  // "Right now" is computed from live state — the panel is different at 9am vs 5pm
  const rightNow = [];
  if (openWaiting.length) rightNow.push({ type: "now", icon: "inbox", label: `${openWaiting.length} decision${openWaiting.length === 1 ? "" : "s"} waiting on you`, sub: `Oldest: ${openWaiting[0].who} · ${(openWaiting[0].kind || "").toLowerCase()}`, q: "What's waiting on me?" });
  const pulse = ((window.CHANLY_DATA || {}).MORNING_BRIEF || {}).pulse;
  if (pulse) { const pct = Math.round((pulse.revenue / pulse.target) * 100); rightNow.push({ type: "now", icon: "trending-up", label: `$${pulse.revenue.toLocaleString()} booked · ${pct}% of pace`, sub: "See what's driving today", q: "How's revenue pacing today?" }); }
  if (window.PR_STORE && window.PR_STORE.away) rightNow.push({ type: "now", icon: "pause", label: "You're Away — veto timers frozen", sub: "Agents are on the holding line", q: "Set me to Available" });

  const qStr = query.trim();
  const sections = [];
  if (!active) {
    if (qStr) {
      sections.push({ key: "fb", items: [{ type: "ask", icon: "sparkle", label: `Ask Chanlytics: “${qStr}”`, sub: "Answer from your live workspace", q: qStr }] });
      const jumps = askJumpMatches(query);
      if (jumps.length) sections.push({ key: "jump", label: "Jump to", items: jumps.map((j) => ({ type: "jump", icon: j.icon, label: j.label, meta: j.kind, to: j.to })) });
      const hits = ASK_SUGGESTIONS.filter((s) => s.q.toLowerCase().includes(qStr.toLowerCase())).map(mapSug);
      if (hits.length) sections.push({ key: "cmds", label: "Commands", items: hits });
    } else {
      if (rightNow.length) sections.push({ key: "now", label: "Right now", items: rightNow });
      sections.push({ key: "ask", label: "Ask", items: ASK_SUGGESTIONS.filter((s) => s.kind === "ask").map(mapSug) });
      sections.push({ key: "act", label: "Act", items: ASK_SUGGESTIONS.filter((s) => s.kind === "act").map(mapSug) });
      sections.push({ key: "draft", label: "Draft", items: ASK_SUGGESTIONS.filter((s) => s.kind === "draft").map(mapSug) });
      if (threads.length) sections.push({ key: "recent", label: "Recent", clear: clearHistory, items: threads.slice(0, 6).map((t) => ({ type: "thread", icon: "sparkle", label: t.title, sub: askAgo(t), tid: t.id, onDelete: () => removeThread(t) })) });
    }
  }
  const flat = [];
  sections.forEach((sec) => sec.items.forEach((it) => { it._i = flat.length; flat.push(it); }));
  const selMax = flat.length - 1;

  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") { setActiveId(it.tid); return; }
    if (it.type === "jump") { onClose(); window.CHANLY.nav(it.to); return; }
    submit(it.q);
  };

  const onKey = (e) => {
    if (active) {
      if (e.key === "Escape") { e.stopPropagation(); setActiveId(null); setQuery(""); }
      else if (e.key === "Enter") { e.preventDefault(); submit(); }
      else if (e.key === "ArrowUp" && !query) { const last = [...((active.msgs) || [])].reverse().find((m) => m.role === "user"); if (last && last.text) { e.preventDefault(); setQuery(last.text); } }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(selMax, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[sel]) activate(flat[sel]); else if (qStr) submit(); }
  };

  return (
    <div className="ask-overlay" onClick={onClose}>
      <div className="ask-modal cmd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-bar">
          {active
            ? <button className="cmd-back" onClick={() => { setActiveId(null); setQuery(""); }} aria-label="Back to commands"><Icon name="chevron" size={13} style={{ transform: "rotate(180deg)" }} /></button>
            : <Icon name="sparkle" size={15} style={{ color: "var(--accent)", flexShrink: 0 }} />}
          {seedCtx && <span className="cmd-ctx" title="Context carried into this thread"><Icon name="sparkle" size={10} /> {seedCtx}<button onClick={() => setSeedCtx(null)} aria-label="Clear context"><Icon name="x" size={9} /></button></span>}
          <input ref={inputRef} className="cmd-input" placeholder={active ? "Follow up…" : "Ask, command, draft, or search…"} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} />
          <span className="kbd">↵</span>
        </div>

        <div className="cmd-body" ref={bodyRef}>
          {active ? (
            <div className="ask-msgs" ref={scrollRef}>
              {active.msgs.map((m, i) => m.role === "user"
                ? <div key={i} className="ask-msg user"><p className="ask-msg-text">{m.text}</p></div>
                : <AskAnswer key={i} msg={m} onClose={onClose} onAction={runAction} />)}
            </div>
          ) : flat.length === 0 ? (
            <div className="cmd-empty">No commands match “{qStr}”.<br />Press <span className="kbd">↵</span> to ask it anyway.</div>
          ) : (
            sections.map((sec) => (
              <React.Fragment key={sec.key}>
                {sec.label && <div className="cmd-sec-label">{sec.label}{sec.clear && <span className="cmd-clear" onClick={sec.clear}>Clear</span>}</div>}
                {sec.items.map((it) => (
                  <button key={it._i} className={`cmd-row ${it.type} ${it._i === sel ? "sel" : ""} ${it.done ? "done" : ""}`} onMouseMove={() => setSel(it._i)} onClick={() => activate(it)}>
                    <span className="cmd-row-ic"><Icon name={it.done ? "check" : it.icon} size={12} /></span>
                    <span className="cmd-row-main">
                      <span className="cmd-row-label">{it.label}</span>
                      {it.sub && <span className="cmd-row-sub">{it.sub}</span>}
                    </span>
                    {it.badge && <span className="cmd-row-badge">{it.badge}</span>}
                    {it.meta && <span className="cmd-row-kind">{it.meta}</span>}
                    {it.onDelete && <span className="cmd-row-del" role="button" tabIndex={-1} aria-label="Delete thread" onClick={(e) => { e.stopPropagation(); it.onDelete(); }}><Icon name="x" size={10} /></span>}
                    <Icon name="arrow-right" size={12} className="cmd-row-arrow" />
                  </button>
                ))}
              </React.Fragment>
            ))
          )}
        </div>

        <footer className="cmd-foot">
          {active ? (
            <><span><span className="kbd">↵</span> send</span><span><span className="kbd">esc</span> back</span><span className="cmd-foot-note">{threads.length} saved · resume any time</span></>
          ) : (
            <><span><span className="kbd">↑↓</span> move</span><span><span className="kbd">↵</span> select</span><span><span className="kbd">esc</span> close</span><span className="cmd-foot-note">{threads.length ? `${threads.length} thread${threads.length === 1 ? "" : "s"} saved` : "Threads save automatically"}</span></>
          )}
        </footer>
      </div>
      {toastNode}
    </div>
  );
};

// Persistent ambient dock at the bottom — shows the most recent agent action
const AmbientDock = ({ onAsk }) => {
  const { LIVE_TICKER } = window.CHANLY_DATA;
  const live = LIVE_TICKER.find((t) => t.state === "live");
  const [dismissed, setDismissed] = React.useState(false);
  const [, setTick] = React.useState(0);

  // Ending the call in Live Monitor flips the dock to "wrapped"
  React.useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("live:ended", bump);
    return () => window.removeEventListener("live:ended", bump);
  }, []);
  const ended = live && window.LM_STORE && window.LM_STORE.isEnded("lc-selena") && /Selena/.test(live.target || "");

  if (dismissed || !live) return null;

  if (ended) return (
    <div className="dock">
      <span className="dock-pulse"><Icon name="check" size={12} style={{ color: "var(--ok)" }} /></span>
      <span className="dock-text">
        <strong>{live.agent}</strong> wrapped the call <span className="muted">{live.target}</span>
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav(window.CHANLY.R.conversation("cv-selena-live"))}>
        Transcript
      </button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <Icon name="x" size={12} />
      </button>
    </div>
  );

  return (
    <div className="dock">
      <span className="dock-pulse">
        <span className="live-dot" />
      </span>
      <span className="dock-text">
        <strong>{live.agent}</strong> {live.verb} <span className="muted">{live.target}</span>
        <span className="dock-elapsed mono">{live.duration}</span>
      </span>
      <button className="btn btn-ghost btn-sm" onClick={() => window.CHANLY.nav("live")}>
        Listen in
      </button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <Icon name="x" size={12} />
      </button>
    </div>
  );
};

// Outside a demo the palette reads the workspace (ask-real.jsx); the seed
// palette above answers only the seed world and stays for the demo.
const AskBar = (props) => (!window.__DEMO_MODE && window.AskReal ? <window.AskReal {...props} /> : <AskBarSeed {...props} />);

window.AskBar = AskBar;
window.AskBarSeed = AskBarSeed;
window.AmbientDock = AmbientDock;
