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
// items: [{ label, icon, onClick, danger, meta, gate } | { divider:true } | { header:"…" }]
// Renders its own trigger button; closes on backdrop, Escape, or item click.
// `gated` (a sentence) keeps the whole menu shut and says why; an item's `gate`
// is window.gate(...)'s props, spread after its click, so a refused item stays in
// the menu, says why when pressed, and leaves the menu open.
// `escape` is for a menu opened inside a pane that scrolls (the People rail): see moreFit.
// An item with `checked` (true or false) is one of a set: a menuitemradio, ticked when true.

/**
 * Where a menu that escapes its pane hangs (MoreMenu `escape`). A pane that scrolls cuts off whatever crosses its
 * edge, so a menu in the People rail had to fit beside its trigger: 196px, where every other menu is 232 to 292, and
 * its words broke onto three to six lines. An escaped menu is placed against the window instead: under its trigger, on
 * the side `align` names, above the trigger when the window has more room there, and held inside the window. Where
 * neither side has room for all of it, it takes the room there is and scrolls (the room is its max-height). Until
 * placed it is drawn but not shown (.placed), so it never flashes at the window's corner.
 */
const MORE_EDGE = 8; // kept clear of the window's edges
const MORE_GAP = 8; // between trigger and menu, as .more-menu's own top: calc(100% + 8px)
const moreFit = (wrap) => {
  if (!wrap || typeof wrap.querySelector !== "function") return;
  const btn = wrap.querySelector(":scope > button");
  const menu = wrap.querySelector(":scope > .more-menu");
  if (!btn || !menu || typeof btn.getBoundingClientRect !== "function" || typeof menu.getBoundingClientRect !== "function") return;
  const t = btn.getBoundingClientRect();
  const m = menu.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  const from = menu.classList.contains("align-left") ? t.left : t.right - m.width;
  const left = Math.max(MORE_EDGE, Math.min(from, vw - MORE_EDGE - m.width));
  const below = vh - MORE_EDGE - (t.bottom + MORE_GAP);
  const above = t.top - MORE_GAP - MORE_EDGE;
  const up = below < m.height && above > below;
  const room = Math.max(96, up ? above : below);
  const height = Math.min(m.height, room);
  if (room < m.height) menu.style.maxHeight = `${Math.floor(room)}px`;
  const top = up ? Math.max(MORE_EDGE, t.top - MORE_GAP - height) : t.bottom + MORE_GAP;
  const put = (x, y) => { menu.style.left = `${Math.round(x)}px`; menu.style.top = `${Math.round(y)}px`; };
  put(left, top);
  // A transformed or filtered ancestor makes itself a fixed box's containing block and moves the menu with it; that
  // offset is taken back, so the menu lands where it was meant to whatever the page around it does.
  const got = menu.getBoundingClientRect();
  if (Math.round(got.left) !== Math.round(left) || Math.round(got.top) !== Math.round(top)) put(2 * left - got.left, 2 * top - got.top);
  menu.classList.toggle("up", up);
  menu.classList.add("placed");
};

// `icon` is the trigger's glyph where the menu is not a "more": Leads' Call opens the ways of calling, and a ⋯
// there would hide what the button is for.
const MoreMenu = ({ items = [], align = "right", size = 13, title = "More", btnClass = "btn btn-ghost btn-icon btn-sm", label = null, icon = "more", gated = null, escape = false, testid = null }) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    if (!escape) return () => window.removeEventListener("keydown", onKey);
    // Placed against the window, an escaped menu would stay put while the page under it moved, so a scroll anywhere
    // but inside the menu itself, or a resize, closes it rather than leave it beside the wrong row. Only a node can be
    // inside it: a resize's target is the window, which contains() refuses with a throw.
    const wrap = wrapRef.current;
    moreFit(wrap);
    const menu = wrap && typeof wrap.querySelector === "function" ? wrap.querySelector(":scope > .more-menu") : null;
    const inside = (t) => !!(menu && t && typeof t.nodeType === "number" && typeof menu.contains === "function" && menu.contains(t));
    const onMove = (e) => { if (!inside(e && e.target)) setOpen(false); };
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, escape]);

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
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testid || undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        {...(gated ? gatedProps(gated) : {})}
      >
        {label ? <>{label} <Icon name="chevron-down" size={10} /></> : <Icon name={icon} size={size} />}
      </button>
      {open && (
        <>
          <div className="more-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className={`more-menu ${align === "left" ? "align-left" : "align-right"}${escape ? " escape" : ""}`} role="menu" onClick={(e) => e.stopPropagation()}>
            {items.map((it, i) => {
              if (it.divider) return <div key={i} className="more-divider" />;
              if (it.header) return <div key={i} className="more-header">{it.header}</div>;
              // One of a set (a sort, say): a radio item with the tick drawn on every one, hidden where it is not the
              // one chosen (components.css), so the words stand in one column either way.
              const radio = typeof it.checked === "boolean";
              return (
                <button key={i} className={`more-item ${it.danger ? "danger" : ""}`} role={radio ? "menuitemradio" : "menuitem"} aria-checked={radio ? it.checked : undefined} title={it.title || undefined} onClick={() => run(it)} {...(it.gate || {})}>
                  {radio ? <Icon name="check" size={13} /> : it.icon && <Icon name={it.icon} size={13} />}
                  <span className="more-item-label">{it.label}</span>
                  {it.meta && <span className="more-item-meta">{it.meta}</span>}
                  {it.hint && <span className="more-item-hint">{it.hint}</span>}
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

Object.assign(window, { Sparkline, KPI, StatStrip, StatCell, MoreMenu, moreFit, usePPToast });

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

// ---- Tab stays inside a modal ---------------------------------------------------
// Tab and Shift+Tab walk a dialog's own controls and wrap round, so focus never leaves it for the page behind: call
// trapTab(e, box) from the dialog's keydown when e.key is "Tab". It counts only what Tab actually stops at
// (tabStops(box)), not a control taken out of the tab order (tabindex -1: a radiogroup's unchosen options) nor one
// with no box on screen (a closed fold's head and fields, hidden). Counting either, the wrap waited on a control Tab
// never reached, and focus walked out of an aria-modal dialog. calendar-real.jsx's crTrapTab still counts both.
const TAB_STOP_KINDS = 'button, a[href], input, select, textarea, [tabindex]';
const tabStopsIn = (box) =>
  Array.from(box.querySelectorAll(TAB_STOP_KINDS)).filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0);
const trapTab = (e, box) => {
  if (!box || !box.querySelectorAll) return;
  const stops = tabStopsIn(box);
  if (!stops.length) { e.preventDefault(); return; }
  const first = stops[0];
  const last = stops[stops.length - 1];
  const at = document.activeElement;
  if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus(); }
};
Object.assign(window, { trapTab, tabStops: tabStopsIn });

// ---- A swipe under a thumb ---------------------------------------------------------------------
// One reader of a touch's travel, for what a thumb walks or lets go of: a lead's peek walks its pile across and is
// pulled down to close; a sheet on a phone is pulled down to close. touchSwipe({ onLeft, onRight, onDown, min, when })
// gives the handlers for the element the swipe is on. The touch's start is kept on that element (nothing between
// draws), and at its end ONE way is called: `min` of travel (80px), along the axis it went further on, so a scroll is
// never a move and a move never a scroll. `onDown` is a pull down from the top: it is called only when the scroller
// under the finger (the first ancestor that scrolls, up to the element) was at its top as the touch began, so a
// scroll back up through a list never closes it, and only where `when` says (a phone's width): a sheet from the
// bottom is pulled down, the same sheet beside a desktop page is not. Across, `when` is the caller's: a peek has a
// pile only on a phone.
const swipeScrollerAtTop = (from, upTo) => {
  for (let n = from; n && n !== upTo; n = n.parentElement) {
    if (!(n.scrollHeight > n.clientHeight + 1)) continue;
    const over = window.getComputedStyle ? window.getComputedStyle(n).overflowY : "auto";
    if (over === "auto" || over === "scroll") return n.scrollTop <= 0;
  }
  return true;
};
const touchSwipe = ({ onLeft = null, onRight = null, onDown = null, min = 80, when = null }) => ({
  onTouchStart: (e) => {
    const t = e && e.touches && e.touches[0];
    const el = e && e.currentTarget;
    if (!t || !el || !el.dataset) return;
    el.dataset.sx = String(t.clientX);
    el.dataset.sy = String(t.clientY);
    el.dataset.stop = swipeScrollerAtTop(e.target, el) ? "1" : "0";
  },
  onTouchEnd: (e) => {
    const t = e && e.changedTouches && e.changedTouches[0];
    const el = e && e.currentTarget;
    if (!t || !el || !el.dataset) return;
    const sx = Number(el.dataset.sx);
    const sy = Number(el.dataset.sy);
    if (Number.isNaN(sx) || Number.isNaN(sy)) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) < min) return;
      const way = dx < 0 ? onLeft : onRight;
      if (way) way();
      return;
    }
    if (dy < min || el.dataset.stop !== "1" || !onDown) return;
    if (when && !when()) return;
    onDown();
  },
});
Object.assign(window, { touchSwipe });

// ---- Role gating (ST_STORE.can · CLAUDE.md UI patterns) ------------------
// gate(action, doing?) spreads onto a committing control's opening tag AFTER its
// handlers. Allowed -> {}. Denied -> the control stays on the page and in the tab
// order, says why on hover, on focus and when pressed, and does nothing. It used
// to return `disabled` and a `title`: a disabled button takes no focus and fires
// no hover, so the reason reached no keyboard, no finger and most pointers (A7).
// The words are contracts' (refusal.ts roleGate, through the bridge): the same no
// the server's refusal gives after a press. `doing` names what this control does
// where the permission's own words would mislead -- snoozing is an `approve` act.
// Engine fns double-guard with canDo(action) so hotkeys and bulk paths respect roles.
const canDo = (a) => !window.ST_STORE || window.ST_STORE.can(a);
const gateTitle = (a, doing) => {
  const said = window.__roleGate ? window.__roleGate(window.ST_STORE ? window.ST_STORE.myRole() : "viewer", a, doing) : null;
  return said ? said.reason : "Your role can't do this.";
};
// A control that refuses: focusable, described, and inert. Every handler that would
// act is replaced -- the click; Enter and Space, which would also reach a row's own
// key handler; a hold's pointer and key-up events -- and pressing it shows the
// reason at the control, which is how a finger gets to read it.
const gatedProps = (reason) => {
  const refuse = (e) => { e.preventDefault(); e.stopPropagation(); if (window.__tip) window.__tip.show(e.currentTarget); };
  return {
    disabled: false,
    title: undefined,
    "aria-disabled": true,
    "aria-description": reason,
    "data-tip": reason,
    "data-gated": "",
    onClick: refuse,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") refuse(e); },
    onKeyUp: undefined,
    onPointerDown: undefined,
    onPointerUp: undefined,
    onPointerLeave: undefined,
    onPointerCancel: undefined,
  };
};
const gate = (a, doing) => (canDo(a) ? {} : gatedProps(gateTitle(a, doing)));
Object.assign(window, { canDo, gateTitle, gate, gatedProps });

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
// Presence refuses the way a role does: the same props, the same reachable reason.
window.transferGate = () => {
  const P = window.PR_STORE;
  if (P && P.away) return gatedProps("You're Away — agents use the holding line + async approval");
  if (P && !P.transfers) return gatedProps("Transfers off — callers get the holding line");
  return {};
};

// ---- Workspace policy (charter matrix) — single source; Settings edits it, Fleet reads it ----
window.POLICY = window.POLICY || {
  MODES: ["Auto", "Veto", "Ask", "Never"],
  // Auto/Veto/Ask/Never are how a mode is FILED. What anyone reads is this: a
  // salon owner does not say "veto". The app replaces the whole store with one
  // built on contracts' POLICY_MODE_WORDS (legacy-bridge/policy-store.ts); this
  // copy is the standalone harness's, and says the same thing.
  WORDS: {
    Auto:  { head: "Sends it",    sub: "right away",      chip: "sends it",    does: "Sends it right away." },
    Veto:  { head: "Holds it",    sub: "you can stop it", chip: "holds it",    does: "Writes it, holds it, and sends it unless you stop it." },
    Ask:   { head: "Asks you",    sub: "nothing sent",    chip: "asks you",    does: "Waits for you. Nothing is sent until you say so." },
    Never: { head: "Stays quiet", sub: "nothing happens", chip: "stays quiet", does: "Stays out of it entirely." },
  },
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
  // What the mode DOES, not how it is filed: "Replies · holds it", never
  // "Replies · Veto". One word map, the matrix's (window.POLICY.WORDS).
  const polWords = (m) => ((window.POLICY.WORDS || {})[m] || {}).chip || m;
  // TRUST is the mockup's seeded table ("128 auto-sent · 9% edited"). A real
  // workspace has its policies loaded (__POLICIES is set, or null when the read
  // failed) and no such figures, so its chip names the policy instead.
  return (
    <button className={`pill ${r.locked ? "pill-warn" : ""} pol-chip ${className}`} data-tip={(() => { const t = window.__POLICIES === undefined && window.TRUST && window.TRUST.cls(r.id); return t ? `${r.chip} · ${polWords(window.POLICY.modeOf(r.id))} — ${t.sent.toLocaleString()} auto-sent · ${window.TRUST.rate(t)}% edited (30d)` : "Workspace policy — Settings · Autonomy"; })()} onClick={(e) => { e.stopPropagation(); window.CHANLY.nav(window.CHANLY.R.admin("autonomy")); }}>
      {r.locked ? <>Owner-only · {r.chip}</> : <>{r.chip} · {polWords(window.POLICY.modeOf(r.id))}</>}
    </button>
  );
};
// ---- StatePill — the one pill for a state ---------------------------------
// The tone comes from contracts (tone.ts, through the chrome bridge), the
// words from the label maps contracts keeps unless the page has better ones,
// and a live dot rides the accent, which means "right now" and nothing else.
// Ten components drew this before, each with its own colours: "Needs you" was
// the accent in the Inbox, amber in Conversations and the accent on a
// playbook. Without the bridge (the standalone mockup) it is a plain pill.
// Usage: <StatePill kind="thread" value={t.state} /> · label= overrides the words.
const StatePill = ({ kind, value, label = null, className = "", title = null, tip = null, testid = null }) => {
  const said = window.__chrome && window.__chrome.state ? window.__chrome.state(kind, value) : { tone: "plain", label: String(value ?? "") };
  const tone = said.tone;
  return (
    <span
      className={`pill${tone === "plain" ? "" : ` pill-${tone}`}${className ? ` ${className}` : ""}`}
      data-state={value}
      data-tone={tone}
      title={title || undefined}
      data-tip={tip || undefined}
      data-testid={testid || undefined}
    >
      {tone === "accent" && <span className="live-dot" style={{ width: 5, height: 5 }} />}
      {label ?? said.label}
    </span>
  );
};
// ---- Confirm — the one way an act is confirmed -----------------------------
// Armed inline, where the control that armed it was: the question names the
// thing, the detail says what happens, the Yes names the verb and is a real
// button (red when the act destroys or cannot be undone), the No is quiet.
// Five idioms did this before -- a hand-rolled Yes/No sentence in four
// wordings, a button that changed its own label on the first click, a typed
// name, commit-then-Undo, and nothing at all on the most destructive act on
// Settings (the audit's D13). One shape now; pure, so any harness can draw it.
//
//   <Confirm question="Disconnect Google?" detail="The public listing stays; replies and the history do not."
//            yes="Yes, disconnect" danger busy={busy} onYes={...} onNo={...} testid="google-disconnect" />
//
// `typed` with `value`/`onType` gates the Yes on a typed match -- for erasure
// only; `ready` overrides the match when the page knows better (a phone
// number for a name). `block` draws a panel under the row instead of a line
// beside it. The Yes takes focus as the question appears; Escape is No.
// Testids from `testid`: `${testid}-confirm` on the group, -yes, -no, -typed.
const Confirm = ({ question, detail = null, yes = "Yes", no = "No", onYes, onNo, busy = false, busyLabel = "Working…", danger = false, typed = null, value = "", onType = null, ready = null, error = null, block = false, className = "", testid = null }) => {
  const ok = ready != null ? !!ready : typed == null || String(value).trim() === String(typed);
  const id = (part) => (testid ? `${testid}-${part}` : undefined);
  const onKey = (e) => { if (e.key === "Escape" && !busy && onNo) { e.stopPropagation(); onNo(); } };
  return (
    <span
      className={`confirm${block ? " confirm-block" : ""}${danger ? " confirm-danger" : ""}${className ? ` ${className}` : ""}`}
      role="group"
      aria-label={typeof question === "string" ? question : undefined}
      data-testid={id("confirm")}
      onKeyDown={onKey}
    >
      <span className="confirm-words">
        <span className="confirm-q">{question}</span>
        {detail && <span className="confirm-detail">{detail}</span>}
      </span>
      {typed != null && (
        <input
          className="confirm-typed"
          value={value}
          onChange={(e) => onType && onType(e.target.value)}
          placeholder={String(typed)}
          aria-label={`Type ${typed} to confirm`}
          autoFocus
          disabled={busy}
          data-testid={id("typed")}
        />
      )}
      {error && <span className="confirm-error" role="alert">{error}</span>}
      <span className="confirm-acts">
        <button type="button" className={`btn btn-sm${danger ? " btn-danger" : ""}`} disabled={busy || !ok} onClick={onYes} autoFocus={typed == null} data-testid={id("yes")}>
          {busy ? busyLabel : yes}
        </button>
        <button type="button" className="cl-bucket-link" disabled={busy} onClick={onNo} data-testid={id("no")}>{no}</button>
      </span>
    </span>
  );
};
// ---- EmptyState — the one way "nothing here" is said ------------------------
// Thirteen classes said it before, each with its own glyph, size and colour,
// and one of them offered a next step. One shape: a glyph, a title, a line
// of body, and the next thing to do -- given whenever the reader can do
// something about it. `kind`: "page" centres it in a whole pane, "card" sits
// in a card or a rail, "line" is one sentence in a table or a list (with
// className="empty-center" to centre it in a table cell).
//   <EmptyState kind="page" glyph="inbox" title="Inbox zero" body="…"
//               action={{ label: "See what it handled", to: "conversations" }} />
// `action.to` navigates (window.CHANLY.nav), `action.onClick` runs, and
// `action.gate` carries the honesty gate's props; `also` is a quieter second;
// `tone="ok"` is the green check of a day with nothing left to do.
const EmptyState = ({ kind = "card", glyph = null, title = null, body = null, action = null, also = null, tone = null, className = "", testid = null, children = null }) => {
  const go = (a) => () => { if (a.onClick) a.onClick(); else if (a.to && window.CHANLY) window.CHANLY.nav(a.to); };
  const size = kind === "page" ? 24 : kind === "card" ? 16 : 13;
  const act = (a, primary) => (
    <button
      type="button"
      className={kind === "line" ? "cl-bucket-link" : primary ? (kind === "page" ? "btn btn-primary btn-sm" : "btn btn-sm") : "btn btn-ghost btn-sm"}
      onClick={go(a)}
      data-testid={a.testid || undefined}
      // An act that opens a record fold carries the fold's id, where the fold gives focus back as it closes
      // (record-fold.jsx data-rec-act): the Business tab's "Set up the receptionist".
      data-rec-act={a.recAct || undefined}
      {...(a.gate || {})}
    >
      {a.label}{kind === "line" && <Icon name="arrow-right" size={10} />}
    </button>
  );
  return (
    <div className={`empty empty-${kind}${tone ? ` empty-${tone}` : ""}${className ? ` ${className}` : ""}`} data-testid={testid || undefined}>
      {glyph && <div className="empty-glyph"><Icon name={glyph} size={size} /></div>}
      <div className="empty-words">
        {title && <div className="empty-title">{title}</div>}
        {body && <div className="empty-body">{body}</div>}
        {children}
      </div>
      {(action || also) && (
        <div className="empty-acts">
          {action && act(action, true)}
          {also && act(also, false)}
        </div>
      )}
    </div>
  );
};

// ---- FailedRead — the one way "couldn't read" is said ------------------------
// Never as "nothing there". A read that failed is its own state -- the
// audit's D9: Reports went blank when one of its two reads failed; Today,
// Conversations, Broadcasts and Playbooks kept silent; Team reloaded the
// whole page. The same three kinds as EmptyState, the alert glyph, a Retry
// that re-reads the surface, and the sentence that the rest is current.
//   <FailedRead kind="card" what="your team" surface="settings" />
//   <FailedRead kind="line" what="the calls" onRetry={fn} busy={busy} />
// `surface` retries through window.__refreshSurface(key); `onRetry` runs
// instead; neither, and there is nothing to press (a state support repairs).
const FailedRead = ({ kind = "card", what = "this", why = null, title = null, body = null, surface = null, onRetry = null, busy = false, also = null, className = "", testid = null, retryTestid = null, children = null }) => {
  const retry = onRetry || (surface && window.__refreshSurface ? () => window.__refreshSurface(surface) : null);
  const reason = why ? `${String(why).replace(/\.?\s*$/, "")}. ` : "";
  return (
    <div className={`empty empty-${kind} empty-failed${className ? ` ${className}` : ""}`} role="status" data-testid={testid || undefined}>
      <div className="empty-glyph"><Icon name="alert" size={kind === "page" ? 24 : kind === "card" ? 16 : 13} /></div>
      <div className="empty-words">
        <div className="empty-title">{title || `Couldn't read ${what}`}</div>
        <div className="empty-body">{body ? <>{reason}{body}</> : <>{reason}Everything else here is current, and the receptionist keeps working.</>}</div>
        {children}
      </div>
      {(retry || also) && (
        <div className="empty-acts">
          {retry && (
            <button type="button" className={kind === "line" ? "cl-bucket-link" : kind === "page" ? "btn btn-primary btn-sm" : "btn btn-sm"} disabled={busy} onClick={retry} data-testid={retryTestid || (testid ? `${testid}-retry` : undefined)}>
              <Icon name="refresh" size={11} /> {busy ? "Retrying…" : "Retry"}
            </button>
          )}
          {also && <button type="button" className={kind === "line" ? "cl-bucket-link" : "btn btn-ghost btn-sm"} onClick={also.onClick} data-testid={also.testid || undefined}>{also.label}</button>}
        </div>
      )}
    </div>
  );
};
// ---- FieldError — the one way a field says what is wrong with it -------------
// Six forms coloured their own hint red inline, one had a class of its own, and
// none was announced. One sentence under the box it belongs to, read out as it
// appears, with the id the box names:
//   <input aria-invalid={error ? true : undefined} aria-describedby={error ? "list-name-error" : undefined} />
//   <FieldError id="list-name-error" message={error} />
const FieldError = ({ id = null, message = null, testid = null }) => {
  if (!message) return null;
  return (
    <span className="field-error" id={id || undefined} role="alert" data-testid={testid || undefined}>
      <Icon name="alert" size={11} />
      <span className="field-error-words">{message}</span>
    </span>
  );
};

// ---- refusalToast — a refusal, as a toast ------------------------------------
// The client names every refusal (contracts refusalOf): a title for the kind of
// no, and the sentence in the owner's words. The page says what did not happen
// ("Not stopped") and the refusal says why; with no words of the page's own,
// the refusal's title leads. Always the danger tone: nothing happened.
//   flash(res.ok ? { msg: <>Stopped</> } : window.refusalToast(res, "Not stopped"))
const refusalToast = (r, what = null) => {
  const lead = what || (r && r.title) || null;
  const why = (r && r.message) || "That didn't go through.";
  return { tone: "danger", msg: lead ? <><b>{lead}</b> — {why}</> : <>{why}</> };
};
Object.assign(window, { PolicyChip, StatePill, Confirm, EmptyState, FailedRead, FieldError, refusalToast });

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
    // An element gone from the page gets no tip. A tap focuses what it presses, and a press that closes its sheet (a
    // list picked in People's phone sheet) took the element away before the tip's 280ms were up: the tip was then
    // placed at a detached box's zeros, over the top bar's corner, and stayed until the next press.
    if (!text || !t.isConnected) return;
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
  // A pressed gate shows its reason at once, at the control: a tap has no hover,
  // and the press's own mousedown has just hidden whatever the hover began.
  window.__tip = { show: (t) => { if (!t || !t.getAttribute || !t.getAttribute("data-tip")) return; cur = t; clearTimeout(showT); clearTimeout(hideT); place(t); } };
  window.__uiTip = true;
})();
