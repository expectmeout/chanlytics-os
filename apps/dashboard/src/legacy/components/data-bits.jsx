/* global React */
// Chanlytics — small reusable bits (sparklines, KPI, stat strips)

const Sparkline = ({ data = [], width = 60, height = 22, stroke = "currentColor" }) => {
  if (!data.length) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="kpi-spark">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
};

const KPI = ({ label, value, delta, deltaLabel = "vs last week", trend, sparkData }) => {
  const dir = delta != null ? (delta >= 0 ? "up" : "down") : null;
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-meta">
        {dir && <span className={`delta-${dir}`}>{dir === "up" ? "↑" : "↓"} {Math.abs(delta)}%</span>}
        <span>{deltaLabel}</span>
      </div>
      {sparkData && <Sparkline data={sparkData} stroke="var(--ink-faint)" />}
    </div>
  );
};

// ---- Unified stat strip ------------------------------------------------
// ONE pattern for every "row of stats" surface: dashboard brief anchors,
// clients page header, client profile money strip.
const StatStrip = ({ children, className = "" }) => (
  <div className={`stat-strip ${className}`}>{children}</div>
);

const StatCell = ({ label, value, valueSize, meta, metaTone = "", spark, tip, children }) => (
  <div className="stat-cell" data-tip={tip ? tip + " · click to ask more" : undefined} onClick={tip && window.askAbout ? (() => window.askAbout({ prompt: "Explain \u201C" + label + "\u201D", answer: label + (value != null ? " is " + value : "") + ". " + tip + ".", links: [] })) : undefined}>
    <span className="stat-cell-label">{label}</span>
    {value !== undefined && (
      <span className="stat-cell-value tabular" style={valueSize ? { fontSize: valueSize } : undefined}>{value}</span>
    )}
    {children}
    {meta && <span className={`stat-cell-meta ${metaTone}`} title={typeof meta === "string" ? meta : undefined}>{meta}</span>}
    {spark && <Sparkline data={spark} stroke="var(--ink-faint)" />}
  </div>
);

// ---- MoreMenu — shared 3-dot popover -----------------------------------
// items: [{ label, icon, onClick, danger, meta } | { divider:true } | { header:"…" }]
// Renders its own trigger button; closes on backdrop, Escape, or item click.
const MoreMenu = ({ items = [], align = "right", size = 13, title = "More", btnClass = "btn btn-ghost btn-icon btn-sm", label = null, gated = null }) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const run = (it) => {
    // Synchronous: fire the action, then close. Deferring the action behind a
    // timeout let a re-render/close race swallow clicks on lower items.
    if (it.onClick) it.onClick();
    setOpen(false);
  };

  return (
    <div className="more-wrap" ref={wrapRef}>
      <button
        className={btnClass}
        title={gated || title}
        disabled={!!gated}
        data-gated={gated ? "" : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      >
        {label ? <>{label} <Icon name="chevron-down" size={10} /></> : <Icon name="more" size={size} />}
      </button>
      {open && (
        <>
          <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className={`more-menu ${align === "left" ? "align-left" : "align-right"}`} role="menu" onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) => {
              if (it.divider) return <div key={i} className="more-divider" />;
              if (it.header) return <div key={i} className="more-header">{it.header}</div>;
              return (
                <button key={i} className={`more-item ${it.danger ? "danger" : ""}`} role="menuitem" onClick={() => run(it)}>
                  {it.icon && <Icon name={it.icon} size={13} />}
                  <span className="more-item-label">{it.label}</span>
                  {it.meta && <span className="more-item-meta">{it.meta}</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

// ---- Shared toast — usePPToast --------------------------------------------
// The ONE toast implementation (CLAUDE.md · UI patterns). Portals to <body> so
// no scroll container can clip it. QUEUE, not a slot: rapid decisions stack up
// to 3 toasts, each with its own dismiss timer, so no undo gets eaten by the
// next action. Oldest drops first when the cap is hit.
//
// TONE. What a toast says is one thing; whether it is good news, a note, a
// warning or a failure is another, and the icon and its colour say the second
// so an owner can tell "saved" from "not saved" from across the room. Every
// toast used to wear a green check, the failures included. The tone also sets
// the lifetime — a failure stays longer than a confirmation — and a toast with
// an Undo lives as long as the undo does: the shared undo window, or the exact
// `ms` a caller knows (the reply's cancel window, from its own receipt), never
// the six seconds a plain confirmation gets. Hovering or focusing a toast holds
// it; leaving resumes what was left. The shape is decided in contracts
// (toastShape) and reaches here through the chrome bridge; the standalone
// mockup has no bridge and keeps the old one-tone behaviour.
// Usage: const [toastNode, flash] = usePPToast();
//   flash({ msg, tone?: "ok"|"info"|"warn"|"danger", undo?, action?: {label,onClick}, links?: [{label,to}], ms?, icon? })
const toastShapeOf = (p) => (window.__chrome && window.__chrome.toast)
  ? window.__chrome.toast(p)
  : { tone: p.tone || "ok", icon: p.icon || "check", role: "status", ms: p.ms || 6000 };
const usePPToast = () => {
  const [toasts, setToasts] = React.useState([]);
  const timers = React.useRef({});
  React.useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t.handle)), []);
  const close = (id) => {
    const t = timers.current[id];
    if (t) window.clearTimeout(t.handle);
    delete timers.current[id];
    setToasts((ts) => ts.filter((x) => x.id !== id));
  };
  const arm = (id, ms) => {
    timers.current[id] = { handle: window.setTimeout(() => close(id), ms), endsAt: Date.now() + ms, left: null };
  };
  // A toast under the pointer, or holding focus, keeps its clock.
  const hold = (id) => {
    const t = timers.current[id];
    if (!t || t.handle === null) return;
    window.clearTimeout(t.handle);
    t.handle = null;
    t.left = Math.max(1000, t.endsAt - Date.now());
  };
  const release = (id) => {
    const t = timers.current[id];
    if (!t || t.handle !== null) return;
    arm(id, t.left);
  };
  const flash = (payload) => {
    const shape = toastShapeOf(payload);
    const id = ++usePPToast._seq;
    setToasts((ts) => {
      const next = [...ts, { ...payload, ...shape, id }];
      while (next.length > 3) {
        const gone = next.shift();
        const t = timers.current[gone.id];
        if (t) window.clearTimeout(t.handle);
        delete timers.current[gone.id];
      }
      return next;
    });
    arm(id, shape.ms);
  };
  const node = toasts.length ? ReactDOM.createPortal(
    // stopPropagation: portal events bubble through the REACT tree, so a toast
    // rendered inside an overlay (Ask modal, dialogs) would otherwise trigger
    // the overlay's close-on-click and kill the undo.
    <div className="pp-toast-stack" onClick={(e) => e.stopPropagation()}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pp-toast pp-toast-${toast.tone}`}
          data-tone={toast.tone}
          role={toast.role}
          onMouseEnter={() => hold(toast.id)}
          onMouseLeave={() => release(toast.id)}
          onFocus={() => hold(toast.id)}
          onBlur={() => release(toast.id)}
        >
          <Icon name={toast.icon} size={13} />
          <span className="pp-toast-msg">{toast.msg}</span>
          {(toast.links || []).map((l, i) => (
            <button key={i} className="pp-toast-cta" onClick={() => { close(toast.id); window.CHANLY.nav(l.to); }}>{l.label}</button>
          ))}
          {toast.action && <button className="pp-toast-cta" onClick={() => { close(toast.id); toast.action.onClick(); }}>{toast.action.label}</button>}
          {toast.undo && <button className="pp-toast-cta" onClick={() => { toast.undo(); close(toast.id); }}>Undo</button>}
          <button className="pp-toast-x" onClick={() => close(toast.id)} aria-label="Dismiss"><Icon name="x" size={11} /></button>
        </div>
      ))}
    </div>,
    document.body
  ) : null;
  return [node, flash];
};
usePPToast._seq = 0;

Object.assign(window, { Sparkline, KPI, StatStrip, StatCell, MoreMenu, usePPToast });

// Shared hotkey hook (CLAUDE.md): suppress-while-typing is handled here.
// matcher(e, typing) -> true means preventDefault + handler(e).
const useHotkey = (matcher, handler) => {
  React.useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
      if (matcher(e, typing)) { e.preventDefault(); handler(e); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
};
window.useHotkey = useHotkey;

// ---- Role gating (ST_STORE.can · CLAUDE.md UI patterns) ------------------
// gate(action) spreads onto a committing control's opening tag AFTER onClick:
// allowed -> {}, denied -> disabled + reason tooltip + onClick stripped.
// Engine fns double-guard with canDo(action) so hotkeys/bulk paths respect roles.
const GATE_VERB = { approve: "approve or send", autonomy: "change agent autonomy", disconnect: "disconnect", billing: "change billing", team: "manage the team", settings: "change the business details", export: "export the customer list" };
const canDo = (a) => !window.ST_STORE || window.ST_STORE.can(a);
const gateTitle = (a) => {
  const r = window.ST_STORE ? window.ST_STORE.myRole() : "owner";
  return r.charAt(0).toUpperCase() + r.slice(1) + " role can't " + (GATE_VERB[a] || a) + " — ask an owner";
};
const gate = (a) => canDo(a) ? {} : { disabled: true, onClick: undefined, title: gateTitle(a), "data-gated": "" };
Object.assign(window, { canDo, gateTitle, gate });

// ---- Attachments in a thread (real sessions) ---------------------------
// The bytes live in a private bucket; the route answers with a five-minute
// signed URL by redirect, so an <img>, <audio> or <video> can point straight
// at it. Without the bridge there is no route, and a seeded thread never
// carries `media`, so the standalone mockup renders nothing here.
const TlMedia = ({ media }) => {
  if (!media || !window.__href) return null;
  if (!media.available) return <div className="tl-media tl-media-missing">Attachment couldn't be saved.</div>;
  const src = window.__href("GET messages/[id]/media", { id: media.messageId });
  if (media.kind === "image") {
    return (
      <a className="tl-media" href={src} target="_blank" rel="noopener noreferrer" title="Open the photo">
        <img src={src} alt={media.caption || "Photo the customer sent"} loading="lazy" />
      </a>
    );
  }
  if (media.kind === "audio") return <audio className="tl-media tl-media-audio" controls preload="none" src={src} />;
  if (media.kind === "video") return <video className="tl-media tl-media-video" controls preload="metadata" src={src} />;
  return (
    <a className="tl-media tl-media-file" href={src} download>
      <Icon name="external" size={12} /> {media.filename || "Download attachment"}
    </a>
  );
};
window.TlMedia = TlMedia;

// ---- Presence (Take transfers) — phone agents check this before warm-transferring ----
window.PR_STORE = window.PR_STORE || {
  away: false,       // manual Away — freezes veto timers, forces the holding line
  transfers: true,   // warm transfers allowed while Available
  reachable() { return !this.away; },
  _emit() { window.dispatchEvent(new CustomEvent("presence:changed", { detail: { away: this.away, transfers: this.transfers } })); },
  setAway(v) { this.away = v; this._emit(); },
  setTransfers(v) { this.transfers = v; this._emit(); },
};
window.transferGate = () => {
  const P = window.PR_STORE;
  if (P && P.away) return { disabled: true, onClick: undefined, title: "You're Away — agents use the holding line + async approval", "data-gated": "" };
  if (P && !P.transfers) return { disabled: true, onClick: undefined, title: "Transfers off — callers get the holding line", "data-gated": "" };
  return {};
};

// ---- Workspace policy (charter matrix) — single source; Settings edits it, Fleet reads it ----
window.POLICY = window.POLICY || {
  MODES: ["Auto", "Veto", "Ask", "Never"],
  ROWS: [
    { id: "faq",      label: "Service & pricing FAQs",        note: "list prices only",          def: "Auto", chip: "FAQs" },
    { id: "book",     label: "Book · reschedule · remind",    note: "15-min pre-call reminders", def: "Auto", chip: "Booking" },
    { id: "reply",    label: "Safe replies",                   note: "in scope · conf ≥ 0.8",      def: "Veto", chip: "Replies" },
    { id: "reengage", label: "Re-engage dormant leads",        note: "offer-free",                def: "Veto", chip: "Re-engage" },
    { id: "campaign", label: "Standing offer campaigns",       note: "e.g. birthday 20%",         def: "Ask", chip: "Campaigns" },
    { id: "money",    label: "Refunds · rates · negotiation", note: "books a call with you",     def: "Never", locked: true, chip: "Money" },
  ],
  forPerm: { booking: "book", money: "money", discount: "money", winback: "reengage", scope: "faq" },
  row(id) { return this.ROWS.find((r) => r.id === id) || null; },
  modeOf(id) { const r = this.row(id); if (!r) return null; return r.locked ? "Never" : (window.ST_STORE ? window.ST_STORE.get("policy." + id, r.def) : r.def); },
  set(id, m) { const r = this.row(id); if (!r || r.locked) return; window.ST_STORE.set("policy." + id, m); window.dispatchEvent(new CustomEvent("policy:changed", { detail: { id, mode: m } })); },
};

// ---- PolicyChip — the ONE policy-class chip. Self-subscribes to policy:changed. ----
const PolicyChip = ({ cls, className = "" }) => {
  const [, pcTick] = React.useReducer((n) => n + 1, 0);
  React.useEffect(() => {
    window.addEventListener("policy:changed", pcTick);
    return () => window.removeEventListener("policy:changed", pcTick);
  }, []);
  const r = cls && window.POLICY.row(cls);
  if (!r) return null;
  return (
    <button className={`pill ${r.locked ? "pill-warn" : ""} pol-chip ${className}`} data-tip={(() => { const t = window.TRUST && window.TRUST.cls(r.id); return t ? `${r.chip} · ${window.POLICY.modeOf(r.id)} — ${t.sent.toLocaleString()} auto-sent · ${window.TRUST.rate(t)}% edited (30d)` : "Workspace policy — Settings · Autonomy"; })()} onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.admin("autonomy")); }}>
      {r.locked ? <>Owner-only · {r.chip}</> : <>{r.chip} · {window.POLICY.modeOf(r.id)}</>}
    </button>
  );
};
Object.assign(window, { PolicyChip });

// ---- Tip — one styled tooltip for every [data-tip] element (hover + keyboard focus) ----
(() => {
  if (window.__uiTip) return;
  let node = null, showT = null, hideT = null, lastHide = 0, cur = null;
  const ensure = () => {
    if (!node) { node = document.createElement("div"); node.className = "ui-tip"; node.setAttribute("role", "tooltip"); document.body.appendChild(node); }
    return node;
  };
  const place = (t) => {
    const text = t.getAttribute("data-tip");
    if (!text) return;
    const tip = ensure();
    tip.textContent = text;
    tip.classList.remove("show");
    tip.style.left = "0px"; tip.style.top = "-9999px";
    const r = t.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, m = 8;
    const side = t.getAttribute("data-tip-side") || "top";
    let y = side === "bottom" ? r.bottom + m : r.top - th - m;
    if (y < 6) y = r.bottom + m;
    if (y + th > innerHeight - 6) y = Math.max(6, r.top - th - m);
    const x = Math.max(6, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 6));
    tip.style.left = x + "px"; tip.style.top = y + "px";
    tip.classList.add("show");
  };
  const show = (t) => {
    cur = t;
    clearTimeout(showT); clearTimeout(hideT);
    const quick = Date.now() - lastHide < 400;
    showT = setTimeout(() => { if (cur === t) place(t); }, quick ? 50 : 280);
  };
  const hide = () => {
    clearTimeout(showT);
    if (node && node.classList.contains("show")) lastHide = Date.now();
    cur = null;
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (node) node.classList.remove("show"); }, 80);
  };
  document.addEventListener("mouseover", (e) => {
    const t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t === cur) return;
    if (t) show(t); else if (cur) hide();
  });
  document.addEventListener("mousedown", hide, true);
  document.addEventListener("focusin", (e) => {
    const t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) show(t); else if (cur) hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.__uiTip = true;
})();
