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

// MoreMenu and its placement, `moreFit`, are the kit's now (surfaces/kit/more-menu); seed-globals publishes MoreMenu.

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
//   flash({ msg, tone?: "ok"|"info"|"warn"|"danger", undo?, action?: {label,onClick}, links?: [{label,to}], ms?, icon?, once? })
// `once`: a name for what the toast says; a second flash with the same name refreshes that toast in place of stacking
// a twin under it (a mic pressed twice says "blocked" once).
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
      const twin = payload.once ? ts.find((x) => x.once === payload.once) : null;
      if (twin) {
        const t = timers.current[twin.id];
        if (t) window.clearTimeout(t.handle);
        delete timers.current[twin.id];
      }
      const next = [...ts.filter((x) => x !== twin), { ...payload, ...shape, id }];
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
    <div className="pp-toast-stack" role="presentation" onClick={(e) => e.stopPropagation()}>
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

Object.assign(window, { Sparkline, KPI, StatStrip, StatCell, usePPToast });

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
// never reached, and focus walked out of an aria-modal dialog.
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
Object.assign(window, { trapTab, tabStops: tabStopsIn, propsWithout: (props, keys) => Object.fromEntries(Object.entries(props).filter(([k]) => !keys.includes(k))) });

// ---- A dialog holds focus while it is open ----
// trapFocus(box): focus goes into the dialog (the box itself, so a phone's keyboard stays down), Tab stays inside it
// (trapTab), and release() puts focus back on the control that opened it, as the record kit's sheet does. Escape is the
// page's own. dialogRef(key) is the ref that does it for an element's life, one per key as `leaving` is, carrying
// `leaving`'s way out too. The modals outside the record kit take one of these.
// What had focus outside every modal: a sheet that autofocuses a field has taken focus by the time it is held.
let focusedOutside = null;
document.addEventListener("focusin", (e) => { if (!(e.target && e.target.closest && e.target.closest('[aria-modal="true"]'))) focusedOutside = e.target; });
const trapFocus = (box) => {
  if (!box || !box.addEventListener) return () => {};
  const at = document.activeElement;
  const from = at && box.contains(at) && focusedOutside ? focusedOutside : at;
  if (!box.contains(at)) {
    if (box.getAttribute("tabindex") === null) box.setAttribute("tabindex", "-1");
    box.focus({ preventScroll: true });
  }
  const onKey = (e) => { if (e.key === "Tab") trapTab(e, box); };
  box.addEventListener("keydown", onKey);
  return () => {
    box.removeEventListener("keydown", onKey);
    if (from && from !== document.body && from.isConnected !== false && from.focus) from.focus({ preventScroll: true });
  };
};
const dialogRefs = new Map();
const dialogRef = (key) => {
  const had = dialogRefs.get(key);
  if (had) return had;
  const leave = window.leaving ? window.leaving(key) : null;
  let release = null;
  const ref = (el) => {
    if (release) { release(); release = null; }
    if (el) release = trapFocus(el);
    if (leave) leave(el);
  };
  dialogRefs.set(key, ref);
  return ref;
};

// A span or div drawn as a control is a button to a keyboard with role="button", a tab stop and keyPress(fn) as its onKeyDown:
// Enter and Space, pressed on the element itself and never typed in a field inside it. A real button is better where one fits.
const keyPress = (fn) => (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); fn(e); }
};

// ---- A thumb's gestures ------------------------------------------------------------------------
// One reader of a touch, for what a thumb walks or lets go of: a lead's peek walks its pile across; a sheet on a phone,
// the peek and an open thread are let go of. touchSwipe({ onLeft, onRight, onDown, onBack, onAway, min, when, onGrab }) gives the
// handlers for the element the gesture is on. Nothing is kept between draws: a touch's state is held against the
// element the browser hands back.
//
// A let-go FOLLOWS the finger. `onDown` is a pull down from the top: once the touch has gone 8px, mostly down, from a
// scroller at its top (the first ancestor under the finger that scrolls, so a scroll back up through a list is never a
// pull), and where `when` says (a phone's width), the element moves with the finger and the wash behind it (its
// previous sibling, when that is a backdrop) fades as it goes. `onBack` is the same, across to the right: an open
// thread on a phone goes back to its list, and `onGrab(el, on)` lets the page show what is under it while it moves.
// `onAway` is the same across to the left, with its wash fading as a sheet's does: the phone's drawer slides back where
// it came from. Nothing opens one by a swipe (from the screen's edge that is the phone's own back). A drawer is slid
// shut by its own rules rather than taken away, so after the close its inline styles go and those rules take it on.
// Let go past a third of the element (160px at most) or with a flick, it leaves the way it was pulled and then the
// close is called; short of that, or when the page kept it open (it asks first about what was typed), it settles back.
// Under reduced motion it still follows the finger, which is the person's own motion, and the rest happens at once.
//
// `pages(el, from)` is the third that follows: a page under a strip, walked across (surface-tabs.jsx stripPager). It is
// asked once, as a touch is taken across (never from 24px of either edge, which is the phone's own back), with where
// the touch began: `{ prev, next, moving, follow(progress, step, how), go(step) }`, or null for no page. The page moves
// with the finger both ways; toward a side with no page it gives a quarter of the drag, 48px at most. `moving` names
// what moves when it is not the element itself (People's strip is inside its page: all around it moves, it stays). Let go past a third (160px at most) or with a flick toward a page, it
// leaves that way and then `go(step)`; otherwise it settles. `follow` hears every move ("move") and the end ("leave",
// "settle"). The answer is kept with the touch, so a page drawn again mid-gesture loses nothing. `back` goes first.
// A page that `stays` (the Calendar's days: the same element shows the next ones) comes back in after `go`, from the
// side it is going to, 40px, as a new view slides in (components.css route-slide-*).
//
// A swipe across, with nothing following, is `onLeft`/`onRight`: `min` of travel (80px) along the axis it went
// further on, so a scroll is never a move and a move never a scroll. A touch the browser reports only at its ends is
// read the same way, down included.
// The element itself counts: a short sheet is its own scroller.
const swipeScrollerAtTop = (from, upTo) => {
  for (let n = from; n; n = n.parentElement) {
    if (n.scrollHeight > n.clientHeight + 1) {
      const over = window.getComputedStyle ? window.getComputedStyle(n).overflowY : "auto";
      if (over === "auto" || over === "scroll") return n.scrollTop <= 0;
    }
    if (n === upTo) break;
  }
  return true;
};
// A touch that began in something that takes a drag of its own -- a field (moving the caret, choosing words), or a
// row that scrolls across -- is that thing's, never a let-go.
const swipeOwnDrag = (from, upTo) => {
  for (let n = from; n; n = n.parentElement) {
    if (n.matches && n.matches("input, textarea, select, [contenteditable='true']")) return true;
    if (n.scrollWidth > n.clientWidth + 1) {
      const over = window.getComputedStyle ? window.getComputedStyle(n).overflowX : "visible";
      if (over === "auto" || over === "scroll") return true;
    }
    if (n === upTo) break;
  }
  return false;
};
const motionReduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const touches = new WeakMap();
const washBehind = (el) => {
  const prev = el && el.previousElementSibling;
  return prev && /backdrop/.test(String(prev.className || "")) ? prev : null;
};
const GRAB_AT = 8;
const LEAVE_MS = 180;
const SETTLE_MS = 240;
// Long enough for React to have taken it away after the close: judged sooner, a sheet on its way out read as kept,
// and settled back into view for a frame before it went.
const KEPT_AFTER_MS = 60;
// A page's switch is a navigation, which lands a task or two after the press, later than a sheet's close.
const PAGE_KEPT_MS = 400;
const EDGE = 24;
const RESIST = 0.25;
const RESIST_MAX = 48;
const ARRIVE_PX = 40;
const screenWide = (el) => (typeof window.innerWidth === "number" && window.innerWidth) || (el && el.offsetWidth) || 0;
const pageStep = (dx) => (dx < 0 ? 1 : -1);
const pageOpen = (p, step) => !!(p && (step > 0 ? p.next : p.prev));
// Back where it was, on the settle's own curve; its inline styles go when it is there, so the page's own rules
// (an entrance, a sheet's frame) own it again.
const swipeSettle = (g) => {
  const { el, wash } = g;
  const them = (g.moving || [el]).filter((m) => m && m.style);
  if (g.onGrab) g.onGrab(el, false);
  if (!el.style) return;
  const now = motionReduced();
  for (const m of them) {
    m.style.transition = now ? "none" : `transform ${SETTLE_MS}ms var(--ease-out)`;
    m.style.transform = "translate3d(0, 0, 0)";
  }
  if (wash && wash.style) {
    wash.style.transition = now ? "none" : `opacity ${SETTLE_MS}ms var(--ease-out)`;
    wash.style.opacity = "";
  }
  setTimeout(() => {
    for (const m of them) {
      m.style.transition = "";
      m.style.transform = "";
    }
    if (wash && wash.style) wash.style.transition = "";
  }, now ? 0 : SETTLE_MS + 20);
};
// A page that stays turns in place: in from the side it is going to, on the settle's curve.
const swipeArrive = (g) => {
  const { el } = g;
  const them = (g.moving || [el]).filter((m) => m && m.style);
  if (g.onGrab) g.onGrab(el, false);
  const now = motionReduced();
  for (const m of them) {
    m.style.transition = "none";
    m.style.transform = now ? "" : `translate3d(${g.step * ARRIVE_PX}px, 0, 0)`;
  }
  if (now) return;
  void el.offsetWidth;
  for (const m of them) {
    m.style.transition = `transform ${SETTLE_MS}ms var(--ease-out)`;
    m.style.transform = "translate3d(0, 0, 0)";
  }
  setTimeout(() => {
    for (const m of them) {
      m.style.transition = "";
      m.style.transform = "";
    }
  }, SETTLE_MS + 20);
};
// Away the way it was pulled, then the close; still on screen after it (the page asked first), it settles back.
const swipeLeave = (g, close) => {
  const { el, wash, way } = g;
  const them = (g.moving || [el]).filter((m) => m && m.style);
  const done = () => {
    close();
    if (way === "page" && g.pages && g.pages.stays) {
      swipeArrive(g);
      return;
    }
    if (way === "away") {
      setTimeout(() => {
        if (g.onGrab) g.onGrab(el, false);
        if (!el.style) return;
        el.style.transition = "";
        el.style.transform = "";
        if (wash && wash.style) { wash.style.transition = ""; wash.style.opacity = ""; }
      }, KEPT_AFTER_MS);
      return;
    }
    setTimeout(() => {
      const shown = el.isConnected !== false && (!el.getClientRects || el.getClientRects().length > 0);
      if (shown) { swipeSettle(g); return; }
      if (g.onGrab) g.onGrab(el, false);
      if (!el.style) return;
      for (const m of them) {
        m.style.transition = "";
        m.style.transform = "";
      }
      if (wash && wash.style) { wash.style.transition = ""; wash.style.opacity = ""; }
    }, way === "page" ? PAGE_KEPT_MS : KEPT_AFTER_MS);
  };
  if (!el.style || motionReduced()) { done(); return; }
  const w = el.offsetWidth || 600;
  for (const m of them) {
    m.style.transition = `transform ${LEAVE_MS}ms var(--ease-in)`;
    m.style.transform =
      way === "down" ? "translate3d(0, 100%, 0)"
      : way === "away" ? "translate3d(-100%, 0, 0)"
      : way === "page" ? `translate3d(${-g.step * w}px, 0, 0)`
      : "translate3d(100%, 0, 0)";
  }
  if (wash && wash.style) {
    wash.style.transition = `opacity ${LEAVE_MS}ms var(--ease-in)`;
    wash.style.opacity = "0";
  }
  setTimeout(done, LEAVE_MS);
};
const touchSwipe = ({ onLeft = null, onRight = null, onDown = null, onBack = null, onAway = null, pages = null, min = 80, when = null, onGrab = null }) => ({
  onTouchStart: (e) => {
    const t = e && e.touches && e.touches[0];
    const el = e && e.currentTarget;
    if (!t || !el) return;
    if (swipeOwnDrag(e.target, el)) {
      touches.delete(el);
      return;
    }
    touches.set(el, { el, x: t.clientX, y: t.clientY, at: Date.now(), top: swipeScrollerAtTop(e.target, el), way: null, onGrab, wash: null, from: e.target, pages: null, moving: null, step: 0 });
  },
  onTouchMove: (e) => {
    const t = e && e.touches && e.touches[0];
    const el = e && e.currentTarget;
    const g = el && touches.get(el);
    if (!t || !g) return;
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.way === null) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < GRAB_AT) return;
      const allowed = !when || when();
      if (Math.abs(dy) > Math.abs(dx)) g.way = dy > 0 && g.top && onDown && allowed ? "down" : "none";
      else if (dx > 0 && onBack && allowed && g.x > EDGE) g.way = "back";
      else if (dx < 0 && onAway && allowed) g.way = "away";
      else if (pages && allowed && g.x > EDGE && g.x < screenWide(el) - EDGE) {
        g.pages = pages(el, g.from);
        g.way = g.pages && (g.pages.prev || g.pages.next) ? "page" : "none";
      } else g.way = "none";
      if (g.way === "none") return;
      g.wash = washBehind(el);
      g.moving = g.way === "page" && g.pages.moving ? g.pages.moving : null;
      for (const m of g.moving || [el]) if (m && m.style) m.style.transition = "none";
      if (g.wash && g.wash.style) g.wash.style.transition = "none";
      if (onGrab) onGrab(el, true);
    }
    if (!el.style) return;
    if (g.way === "down") {
      const d = Math.max(0, dy);
      el.style.transform = `translate3d(0, ${d}px, 0)`;
      if (g.wash && g.wash.style) g.wash.style.opacity = String(Math.max(0, 1 - d / (el.offsetHeight || 600)));
    } else if (g.way === "back") {
      el.style.transform = `translate3d(${Math.max(0, dx)}px, 0, 0)`;
    } else if (g.way === "away") {
      const d = Math.min(0, dx);
      el.style.transform = `translate3d(${d}px, 0, 0)`;
      if (g.wash && g.wash.style) g.wash.style.opacity = String(Math.max(0, 1 + d / (el.offsetWidth || 600)));
    } else if (g.way === "page") {
      const step = pageStep(dx);
      const open = pageOpen(g.pages, step);
      const d = open ? dx : Math.sign(dx) * Math.min(RESIST_MAX, Math.abs(dx) * RESIST);
      for (const m of g.moving || [el]) if (m && m.style) m.style.transform = `translate3d(${d}px, 0, 0)`;
      if (g.pages.follow) g.pages.follow(open ? Math.min(1, Math.abs(dx) / (el.offsetWidth || 600)) : 0, step, "move");
    }
  },
  onTouchEnd: (e) => {
    const t = e && e.changedTouches && e.changedTouches[0];
    const el = e && e.currentTarget;
    const g = el && touches.get(el);
    if (!t || !g) return;
    touches.delete(el);
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.way === "down" || g.way === "back" || g.way === "away") {
      const d = g.way === "down" ? dy : g.way === "away" ? -dx : dx;
      const size = (g.way === "down" ? el.offsetHeight : el.offsetWidth) || 600;
      const flick = d > 24 && d / Math.max(1, Date.now() - g.at) > 0.5;
      if (d > Math.min(size / 3, 160) || flick) swipeLeave(g, g.way === "down" ? onDown : g.way === "away" ? onAway : onBack);
      else swipeSettle(g);
      return;
    }
    if (g.way === "page") {
      const step = pageStep(dx);
      const size = el.offsetWidth || 600;
      const flick = Math.abs(dx) > 24 && Math.abs(dx) / Math.max(1, Date.now() - g.at) > 0.5;
      if (pageOpen(g.pages, step) && (Math.abs(dx) > Math.min(size / 3, 160) || flick)) {
        g.step = step;
        if (g.pages.follow) g.pages.follow(1, step, "leave");
        swipeLeave(g, () => g.pages.go(step));
      } else {
        if (g.pages.follow) g.pages.follow(0, step, "settle");
        swipeSettle(g);
      }
      return;
    }
    // Nothing followed: read at its ends, along the axis it went further on, `min` of travel. A page is walked here too,
    // for a touch the browser reported only at its ends.
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (Math.abs(dx) < min) return;
      const back = dx > 0 && onBack && (!when || when()) && g.x > EDGE;
      if (!back && g.way === null && pages && (!when || when()) && g.x > EDGE && g.x < screenWide(el) - EDGE) {
        const p = pages(el, g.from);
        if (pageOpen(p, pageStep(dx))) {
          p.go(pageStep(dx));
          return;
        }
      }
      const away = dx < 0 && onAway && (!when || when());
      const way = away ? onAway : dx < 0 ? onLeft : back ? onBack : onRight;
      if (way) way();
      return;
    }
    if (dy < min || !g.top || !onDown) return;
    if (when && !when()) return;
    onDown();
  },
  onTouchCancel: (e) => {
    const el = e && e.currentTarget;
    const g = el && touches.get(el);
    if (!g) return;
    touches.delete(el);
    if (g.way === "page" && g.pages.follow) g.pages.follow(0, g.step || 1, "settle");
    if (g.way === "down" || g.way === "back" || g.way === "away" || g.way === "page") swipeSettle(g);
  },
});

// ---- Leaving: an overlay goes the way it came ------------------------------------------------------------
// A dialog, a sheet or a palette is React's to take away, and it went at once: a hard cut, where it had come in. As
// React lets go of it, a still copy -- no id, no test id, no role, inert, hidden from a screen reader -- is put where it
// was, with the wash that was behind it, and `[data-leaving]` in components.css plays it out (the way it came, faster)
// before it is removed. `leaving(key)` is the callback ref that does it, one per key and the same one on every draw,
// so a draw is never a leaving; put it on the sheet (or the palette), and its wash is found as the sibling before it
// as it opens. React takes the wash away before the sheet, so the wash's copy is made from the one it held. Nothing
// leaves under reduced motion, nor from a frame React mounted and let go of at once (StrictMode's check in
// development, a draw that never showed). The fold's sheet has its own (record-fold.jsx recSheetLeaves).
const stillCopy = (node) => {
  const copy = node.cloneNode(true);
  const all = [copy].concat(copy.querySelectorAll ? Array.from(copy.querySelectorAll("*")) : []);
  for (const n of all) {
    n.removeAttribute("id");
    n.removeAttribute("data-testid");
  }
  for (const k of ["role", "aria-modal", "aria-label", "aria-labelledby", "aria-describedby", "aria-busy"]) copy.removeAttribute(k);
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("inert", "");
  copy.setAttribute("data-leaving", "true");
  return copy;
};
const LEAVE_FALLBACK_MS = 420;
const playOut = (copy) => {
  let gone = false;
  const go = () => {
    if (gone) return;
    gone = true;
    copy.remove();
  };
  copy.addEventListener("animationend", (e) => { if (e.target === copy) go(); });
  setTimeout(go, LEAVE_FALLBACK_MS);
};
/** Play a node and its wash out from where the node still stands: called as React lets go of the node. */
const leaveOverlay = (node, wash = null) => {
  const parent = node && node.parentNode;
  if (!parent || !node.cloneNode || motionReduced()) return;
  if (wash && wash.cloneNode) {
    const w = stillCopy(wash);
    parent.insertBefore(w, node);
    playOut(w);
  }
  const copy = stillCopy(node);
  parent.insertBefore(copy, node.nextSibling);
  playOut(copy);
};
const leavingRefs = new Map();
const leaving = (key) => {
  const had = leavingRefs.get(key);
  if (had) return had;
  let held = null;
  let wash = null;
  let since = 0;
  const ref = (el) => {
    if (el) {
      held = el;
      wash = washBehind(el);
      since = Date.now();
      return;
    }
    const was = held;
    const w = wash;
    held = null;
    wash = null;
    if (was && Date.now() - since > 60) leaveOverlay(was, w);
  };
  leavingRefs.set(key, ref);
  return ref;
};
Object.assign(window, { touchSwipe, leaving, leaveOverlay });

// ---- What the keyboard covers -----------------------------------------------------------------------------------
// A phone's keyboard is laid over the page, on iOS and on Android alike: the layout keeps its height and only what the
// browser shows gets shorter. A sheet fixed to the bottom kept its fields and its Save under the keys. The shell calls
// this once; what the keyboard covers is --kb on the document, which every sheet stands on. It follows what the
// browser shows, never the focus: a blur that dropped a sheet at once moved Save from under the finger between the
// press and the click. A pinch zoom shrinks what is shown too, and is no keyboard.
// iOS also moves what it shows down to keep a focused field in view, and says how far (--vv-top) either before it has
// moved or long after: a screen that followed its word jumped one way or the other (Ruben's recording, 25 Sep). So the
// document says a keyboard is EXPECTED (html.kb-expected) the moment a field that types is focused, with the height the
// last keyboard had (--kb-last, kept on the device), and a screen that makes room for it at once gives the browser
// nothing to move the view for; the word is kept for the keyboard that never comes (a hardware one: KEYBOARD_DUE_MS),
// and ends as the keyboard is reported (html.kb-up). Ask's screen stands on all of these (ask.css, the Stage's 5.9).
const KEYBOARD_MIN = 100;
const KEYBOARD_DUE_MS = 600;
const KEYBOARD_KEY = "chanlytics-os-keyboard";
const typesIn = (el) =>
  !!el &&
  (el.tagName === "TEXTAREA" ||
    el.isContentEditable === true ||
    (el.tagName === "INPUT" && !/^(button|checkbox|radio|range|submit|reset|file|color|image|hidden)$/.test(el.type || "")));
const watchKeyboard = () => {
  const vv = window.visualViewport;
  const root = document.documentElement;
  if (!vv || !vv.addEventListener || !root || !root.style) return () => {};
  const cls = root.classList || null;
  let said = null;
  let up = false;
  let due = 0;
  let last = 0;
  try {
    last = Number(window.localStorage.getItem(KEYBOARD_KEY)) || 0;
  } catch {
    /* a device that keeps nothing: the first keyboard is met the old way */
  }
  root.style.setProperty("--kb-last", `${last}px`);
  const expect = (on) => {
    clearTimeout(due);
    if (cls) cls.toggle("kb-expected", on);
    if (on) due = setTimeout(() => expect(false), KEYBOARD_DUE_MS);
  };
  const set = () => {
    const zoomed = (vv.scale || 1) > 1.01;
    const keys = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height));
    const top = zoomed ? 0 : Math.max(0, Math.round(vv.offsetTop));
    const kb = Math.max(0, keys - top);
    up = keys >= KEYBOARD_MIN;
    const now = `${kb} ${top} ${up}`;
    if (now === said) return;
    said = now;
    root.style.setProperty("--kb", `${kb}px`);
    root.style.setProperty("--vv-top", `${top}px`);
    if (cls) cls.toggle("kb-up", up);
    if (!up) return;
    expect(false);
    if (keys === last) return;
    last = keys;
    root.style.setProperty("--kb-last", `${last}px`);
    try {
      window.localStorage.setItem(KEYBOARD_KEY, String(last));
    } catch {
      /* kept for this page only */
    }
  };
  // Not where the phone app shrinks the page above the keys (contracts APP_KEYS_RESIZE_CLASS): room made would then go.
  const focusIn = (e) => !up && typesIn(e.target) && !(cls && cls.contains("app-keys-resize")) && expect(true);
  const focusOut = () => expect(false);
  set();
  vv.addEventListener("resize", set);
  vv.addEventListener("scroll", set);
  document.addEventListener("focusin", focusIn);
  document.addEventListener("focusout", focusOut);
  return () => {
    vv.removeEventListener("resize", set);
    vv.removeEventListener("scroll", set);
    document.removeEventListener("focusin", focusIn);
    document.removeEventListener("focusout", focusOut);
    clearTimeout(due);
    for (const p of ["--kb", "--vv-top", "--kb-last"]) root.style.removeProperty(p);
    if (cls) {
      cls.remove("kb-up");
      cls.remove("kb-expected");
    }
  };
};
Object.assign(window, { watchKeyboard });

// ---- A switch holds still ---------------------------------------------------------------------------------------
// A tab, a filter or a fold changes what is drawn beside it, and on a phone the page moved under the thumb that pressed
// it: the person's History tabs went 328px down the screen for Consent and 439px for Visits (23 Sep), because a shorter
// list made the page shorter and the browser pulled the scroll back to fit. `holdStill(control, change)` runs the change,
// drawn at once, and keeps the control where it was on the screen:
// - where the page came out too short to stay where it stood, what scrolls is given the difference as room at its foot
//   (padding, under everything on it, never between two things) and put back where it was. The room gives itself back
//   as the page is scrolled up, never more than keeps what is on the screen where it is, and is gone once none is
//   needed, so no blank stays at the foot;
// - a control that moved anyway (what changed was above it: a list shrinking over its "Show fewer") is scrolled back to
//   where it was.
// A control the change took with it (Mark all read, a form's "Not right?") still has the page held where it stood.
// Where nothing scrolls, the change just runs. A change that lands later (after a server answers) is not held.
const holdScroller = (from) => {
  for (let n = from && from.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
    const over = window.getComputedStyle ? window.getComputedStyle(n).overflowY : "visible";
    if ((over === "auto" || over === "scroll") && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return null;
};
// The room a scroller was given, and the padding it had of its own: one per scroller, grown by each switch.
const holdRooms = new WeakMap();
const holdRoom = (box, more) => {
  let room = holdRooms.get(box);
  if (!room) {
    room = { extra: 0, own: parseFloat(window.getComputedStyle(box).paddingBottom) || 0, inline: box.style.paddingBottom || "" };
    const release = () => {
      box.style.paddingBottom = room.inline;
      box.removeEventListener("scroll", room.onScroll);
      holdRooms.delete(box);
    };
    // Scrolled up, the page needs less of it: what keeps the screen where it is, and nothing once that is none.
    room.onScroll = () => {
      if (!box.isConnected) { release(); return; }
      const need = Math.ceil(box.scrollTop + box.clientHeight - (box.scrollHeight - room.extra));
      if (need <= 0) { release(); return; }
      if (need < room.extra) {
        room.extra = need;
        box.style.paddingBottom = `${room.own + need}px`;
      }
    };
    box.addEventListener("scroll", room.onScroll, { passive: true });
    holdRooms.set(box, room);
  }
  room.extra += more;
  box.style.paddingBottom = `${room.own + room.extra}px`;
};
const holdStill = (control, change) => {
  const run = () => { if (typeof change === "function") change(); };
  if (!control || !control.isConnected || !control.getBoundingClientRect) { run(); return; }
  const box = holdScroller(control);
  const was = control.getBoundingClientRect().top;
  const at = box ? box.scrollTop : 0;
  // Drawn now, so where the page and the control landed are read before anything is painted.
  const flush = window.ReactDOM && window.ReactDOM.flushSync;
  if (flush) flush(run); else run();
  if (!box) return;
  // Pulled back: the page came out shorter than where it stood. The difference goes under everything, and the page back.
  const pulled = Math.ceil(at - box.scrollTop);
  if (pulled >= 1) {
    holdRoom(box, pulled);
    box.scrollTop = at;
  }
  if (!control.isConnected) return;
  const moved = control.getBoundingClientRect().top - was;
  if (Math.abs(moved) >= 1) box.scrollTop += moved;
};

// ---- A door is a link -------------------------------------------------------------------------------------------------
// A name, a face or a chip with a page of its own is a link to that page: `<a {...window.routeDoor(to, go)}>`. Its
// address is in the href, so a long press, a middle click or a new tab opens it too, and a plain press takes the app's
// own way there (`go`, else CHANLY.nav), which keeps Back the app's. A thread's person was reachable only through its
// Actions menu, "Open profile", under a name that looked like a link and was not one. A door to a person reads them as
// a pointer reaches it or it takes focus, as People's rows do: their page opens on nothing of theirs until it is whole.
const RD_PERSON = /^clients\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const routeDoor = (to, go = null) => {
  const person = RD_PERSON.exec(to);
  const warm = person ? () => { if (window.__warmPerson) window.__warmPerson(person[1]); } : null;
  return {
    href: window.CHANLY && window.CHANLY.address ? window.CHANLY.address.href(to) : `#/${to}`,
    onClick: (e) => {
      if (e && (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) return;
      if (e && e.preventDefault) e.preventDefault();
      if (go) go(to);
      else if (window.CHANLY) window.CHANLY.nav(to);
    },
    ...(warm ? { onPointerEnter: warm, onFocus: warm } : {}),
  };
};
Object.assign(window, { holdStill, routeDoor });

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
// Whether the member, as they are acting (View-as included), stands on this rung or above it: contracts' roleAtLeast,
// through the role store the bridge completes (legacy-bridge/identity.ts). With nothing to say who is looking: no.
const mayAtLeast = (rung) => !!(window.ST_STORE && window.ST_STORE.mayAtLeast && window.ST_STORE.mayAtLeast(rung));
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
Object.assign(window, { canDo, mayAtLeast, gateTitle, gate, gatedProps });

// TlMedia is the kit's now (surfaces/kit/media), which seed-globals publishes under this name.

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

// PolicyChip, StatePill and Confirm are the kit's now (surfaces/kit/policy-chip, pill and confirm), which seed-globals
// publishes under these names.
// EmptyState and FailedRead are the kit's now (surfaces/kit/empty), which seed-globals publishes under these names.
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
Object.assign(window, { FieldError, refusalToast, trapFocus, dialogRef, keyPress });

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
