/**
 * A switch holds still, and a door is a link (data-bits holdStill, routeDoor).
 *
 * On a phone the person's History tabs jumped out from under the thumb: Consent put them 328px further down the screen
 * and Visits 439px, because a shorter list made the page shorter and the browser pulled the scroll back to fit (measured
 * on the salon at 375px, 23 Sep). Every tab, filter and fold that swaps what is drawn beside it now runs its change
 * through holdStill, which holds the region it changes at least as tall as the screen below the region's top, gives the
 * hold back as the page is scrolled up, and scrolls back a control that moved anyway.
 *
 * A thread's person was reachable only through its Actions menu; the name, the face and the line under them are a link
 * now, built by routeDoor: the address in the href, the app's own way there on a plain press.
 *
 * Run against data-bits itself, on elements that answer what the helpers ask of them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const styleOf = (over = {}) => ({
  overflowY: "visible",
  overflowX: "visible",
  boxSizing: "content-box",
  paddingTop: "0px",
  paddingBottom: "0px",
  borderTopWidth: "0px",
  borderBottomWidth: "0px",
  ...over,
});
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  getComputedStyle: (n) => styleOf(n.__style),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return true;
  },
  // What React's flushSync does, for what these tests ask of it: the change is drawn before it returns.
  ReactDOM: { flushSync: (fn) => fn() },
};
globalThis.document = {
  addEventListener() {},
  removeEventListener() {},
  body: { appendChild() {} },
  documentElement: {},
  createElement: () => ({ style: {} }),
};
globalThis.React = {
  createElement: () => null,
  useState: (v) => [v, () => {}],
  useEffect() {},
  useRef: (v) => ({ current: v }),
  Fragment: "Fragment",
};
await import("../../../apps/dashboard/src/legacy/components/data-bits.jsx");
const { holdStill, routeDoor } = globalThis.window;

/**
 * A page that scrolls (`box`, 696px of window from 56 to 752), a section in it (`region`) whose top is at `regionTop`
 * on the screen, and the control pressed inside it at `controlTop`. The positions are the tests' to move.
 */
const page = ({ regionTop = 120, controlTop = 170, regionStyle = {}, regionHeight = 1046 } = {}) => {
  const at = { regionTop, controlTop, regionHeight };
  const heard = new Map();
  const box = {
    __style: { overflowY: "auto" },
    scrollHeight: 2654,
    clientHeight: 696,
    scrollTop: 1446,
    parentElement: null,
    getBoundingClientRect: () => ({ top: 56, bottom: 752 }),
    contains: (n) => n === region || n === control,
    addEventListener: (k, fn) => heard.set(k, fn),
    removeEventListener: (k, fn) => {
      if (heard.get(k) === fn) heard.delete(k);
    },
  };
  const writes = [];
  const style = {};
  const region = {
    __style: regionStyle,
    tagName: "SECTION",
    isConnected: true,
    parentElement: box,
    get offsetHeight() {
      const min = parseFloat(style.minHeight) || 0;
      return Math.max(at.regionHeight, min);
    },
    getBoundingClientRect: () => ({ top: at.regionTop, bottom: at.regionTop + region.offsetHeight }),
    style: new Proxy(style, {
      set: (t, k, v) => {
        if (k === "minHeight") writes.push(v);
        t[k] = v;
        return true;
      },
    }),
  };
  const control = {
    isConnected: true,
    parentElement: region,
    getBoundingClientRect: () => ({ top: at.controlTop }),
    closest: (sel) => (sel === "section" ? region : null),
  };
  const scroll = () => heard.get("scroll") && heard.get("scroll")();
  return { at, box, region, control, writes, heard, scroll };
};

test("a switch that shortens what is under it holds the page to the screen's foot, before the change is drawn", () => {
  const p = page();
  let heldWhenDrawn = null;
  holdStill(p.control, () => {
    heldWhenDrawn = p.region.style.minHeight;
    p.at.regionHeight = 206; // Consent: two rows
  });
  assert.equal(
    heldWhenDrawn,
    "632px",
    "held from the section's top (120) to the window's foot (752) before the list changed",
  );
  assert.equal(p.box.scrollTop, 1446, "the page did not move");
  assert.ok(p.heard.has("scroll"), "and it listens, to give the hold back");
});

test("a section's padding and border sit on top of its min-height: the hold is its content's", () => {
  const p = page({
    regionStyle: { paddingTop: "12px", paddingBottom: "32px", borderTopWidth: "1px", borderBottomWidth: "1px" },
  });
  holdStill(p.control, () => {});
  assert.equal(p.region.style.minHeight, "586px", "632 less 46 of padding and border");
  const q = page({ regionStyle: { boxSizing: "border-box", paddingTop: "12px" } });
  holdStill(q.control, () => {});
  assert.equal(q.region.style.minHeight, "632px", "a border-box region is held whole");
});

test("scrolled up, the hold gives back what the screen no longer needs, and lets go once the section is under it", () => {
  const p = page();
  holdStill(p.control, () => {
    p.at.regionHeight = 95; // Visits: one row
  });
  p.at.regionTop = 300;
  p.scroll();
  assert.equal(p.region.style.minHeight, "452px", "from 300 to the foot");
  p.at.regionTop = 200;
  p.scroll();
  assert.equal(
    p.region.style.minHeight,
    "452px",
    "scrolled back down, it never grows: the page ends where it was held",
  );
  p.at.regionTop = 760;
  p.scroll();
  assert.equal(p.region.style.minHeight, "", "under the screen, the page may be as short as it is");
  assert.ok(!p.heard.has("scroll"), "and nothing listens any more");
});

test("a section taller than the hold on its own lets it go at the next scroll", () => {
  const p = page();
  holdStill(p.control, () => {
    p.at.regionHeight = 95;
  });
  p.at.regionHeight = 2000; // back to All, and more
  p.scroll();
  assert.equal(p.region.style.minHeight, "");
  assert.ok(!p.heard.has("scroll"));
});

test("a second switch takes the section over without letting it shrink first", () => {
  const p = page();
  holdStill(p.control, () => {
    p.at.regionHeight = 206;
  });
  p.at.regionTop = 200;
  holdStill(p.control, () => {
    p.at.regionHeight = 95;
  });
  assert.deepEqual(
    p.writes,
    ["632px", "552px"],
    "never an empty min-height in between, which would pull the scroll back",
  );
});

test("a control that moved anyway (what changed was above it) is scrolled back to where it was", () => {
  const p = page({ controlTop: 400 });
  holdStill(p.control, () => {
    p.at.controlTop = 300; // a list over a "Show fewer" lost 100px
  });
  assert.equal(p.box.scrollTop, 1346, "scrolled up by what the control rose");
});

test("where nothing scrolls, or there is no control, the change just runs", () => {
  let ran = 0;
  holdStill(null, () => ran++);
  holdStill(undefined, () => ran++);
  const p = page();
  p.box.__style = { overflowY: "visible" };
  holdStill(p.control, () => ran++);
  assert.equal(ran, 3);
  assert.equal(p.region.style.minHeight, undefined, "nothing held where nothing scrolls");
});

test("a door is a link: its address in the href, the app's own way there on a plain press, the browser's on any other", () => {
  let went = null;
  const door = routeDoor("clients/p1", (to) => {
    went = to;
  });
  assert.equal(door.href, "#/clients/p1");
  let prevented = false;
  door.onClick({ button: 0, preventDefault: () => (prevented = true) });
  assert.equal(went, "clients/p1");
  assert.ok(prevented, "the app navigates, not the browser");
  went = null;
  prevented = false;
  for (const mods of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
    door.onClick({ button: 0, ...mods, preventDefault: () => (prevented = true) });
  }
  assert.equal(went, null, "a new tab or window is the browser's");
  assert.equal(prevented, false);
  const navs = [];
  globalThis.window.CHANLY = { nav: (to) => navs.push(to) };
  routeDoor("calendar/2026-09-28").onClick({ button: 0, preventDefault() {} });
  assert.deepEqual(navs, ["calendar/2026-09-28"], "without a way of the page's own, the app's navigation");
});
