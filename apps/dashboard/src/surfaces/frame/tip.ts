/**
 * The tip (moved from legacy/components/data-bits.jsx, the one-system plan's step 2): one styled tooltip for every
 * [data-tip] element, on hover and on keyboard focus. A pressed gate shows its reason at once, at the control (a tap has no
 * hover): `window.__tip.show(el)`. Under a finger a tip goes after a plain toast's 3 s, and focus shows one to a keyboard
 * alone: a tapped tip stood until the next tap (Ruben, 18 Oct 2026). Installed once, where the page loads (frame-globals.ts),
 * and published as `__tip`, which a gate's press and the record kit's marks ask for there.
 */

const TIP_TOUCH_MS = 3000;
const SHOW_MS = 280;
const QUICK_MS = 50;
const TIP_AGAIN_MS = 400;
const HIDE_MS = 80;
const EDGE = 6;
const GAP = 8;

/** Put the one tip on the page, once; a tip already there (a test's) is kept. */
export function installTip(): void {
  if (window.__tip) return;
  let node: HTMLDivElement | null = null;
  let showT: ReturnType<typeof setTimeout> | undefined;
  let hideT: ReturnType<typeof setTimeout> | undefined;
  let lastHide = 0;
  let cur: Element | null = null;
  let touch = false;
  const ensure = () => {
    if (!node) {
      node = document.createElement("div");
      node.className = "ui-tip";
      node.setAttribute("role", "tooltip");
      document.body.appendChild(node);
    }
    return node;
  };
  const hide = () => {
    clearTimeout(showT);
    if (node && node.classList.contains("show")) lastHide = Date.now();
    cur = null;
    clearTimeout(hideT);
    hideT = setTimeout(() => {
      if (node) node.classList.remove("show");
    }, HIDE_MS);
  };
  const place = (t: Element) => {
    const text = t.getAttribute("data-tip");
    // An element gone from the page gets no tip. A tap focuses what it presses, and a press that closes its sheet (a list
    // picked in People's phone sheet) took the element away before the tip's 280ms were up: the tip was then placed at a
    // detached box's zeros, over the top bar's corner, and stayed until the next press.
    if (!text || !t.isConnected) return;
    const tip = ensure();
    tip.textContent = text;
    tip.classList.remove("show");
    tip.style.left = "0px";
    tip.style.top = "-9999px";
    const r = t.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const side = t.getAttribute("data-tip-side") || "top";
    let y = side === "bottom" ? r.bottom + GAP : r.top - th - GAP;
    if (y < EDGE) y = r.bottom + GAP;
    if (y + th > innerHeight - EDGE) y = Math.max(EDGE, r.top - th - GAP);
    const x = Math.max(EDGE, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - EDGE));
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.classList.add("show");
    if (touch) hideT = setTimeout(hide, TIP_TOUCH_MS);
  };
  const show = (t: Element) => {
    cur = t;
    clearTimeout(showT);
    clearTimeout(hideT);
    const quick = Date.now() - lastHide < TIP_AGAIN_MS;
    showT = setTimeout(
      () => {
        if (cur === t) place(t);
      },
      quick ? QUICK_MS : SHOW_MS,
    );
  };
  const tipped = (e: Event): Element | null => {
    const at = e.target as Element | null;
    return at && at.closest ? at.closest("[data-tip]") : null;
  };
  document.addEventListener("mouseover", (e) => {
    const t = tipped(e);
    if (t === cur) return;
    if (t) show(t);
    else if (cur) hide();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      touch = e.pointerType !== "mouse";
      hide();
    },
    true,
  );
  document.addEventListener("focusin", (e) => {
    const t = tipped(e);
    const at = e.target as Element | null;
    if (t && at && at.matches && at.matches(":focus-visible")) show(t);
    else if (cur) hide();
  });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  window.__tip = {
    show: (t: Element) => {
      if (!t || !t.getAttribute || !t.getAttribute("data-tip")) return;
      cur = t;
      clearTimeout(showT);
      clearTimeout(hideT);
      place(t);
    },
  };
}
