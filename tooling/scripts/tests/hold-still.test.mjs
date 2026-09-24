/**
 * A switch holds still, and a door is a link (data-bits holdStill, routeDoor).
 *
 * On a phone the person's History tabs jumped out from under the thumb: Consent put them 328px further down the screen
 * and Visits 439px, because a shorter list made the page shorter and the browser pulled the scroll back to fit (measured
 * on the salon at 375px, 23 Sep). Every tab, filter and fold that swaps what is drawn beside it now runs its change
 * through holdStill: where the page came out too short to stay where it stood, what scrolls gets the difference as room
 * at its foot and goes back where it was; the room gives itself back as the page is scrolled up; and a control that
 * moved anyway is scrolled back.
 *
 * A thread's person was reachable only through its Actions menu; the name, the face and the line under them are a link
 * now, built by routeDoor: the address in the href, the app's own way there on a plain press.
 *
 * Run against data-bits itself, on a scroller that clamps as a browser's does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const styleOf = (over = {}) => ({ overflowY: "visible", overflowX: "visible", paddingBottom: "0px", ...over });
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
 * A page that scrolls in a 696px window (`box`, from 56 to 752 on the screen), `content` tall with `pad` of padding of
 * its own at its foot, scrolled to `top`; and the control pressed on it, `controlAt` down the content. The scroller
 * clamps as a browser's does: a page made shorter pulls the scroll back to fit, the moment it is read.
 */
const page = ({ content = 2600, pad = 32, top = 1326, controlAt = 1446 } = {}) => {
  const at = { content, controlAt };
  const heard = new Map();
  let scroll = top;
  const style = {};
  const writes = [];
  const box = {
    __style: { overflowY: "auto", paddingBottom: `${pad}px` },
    clientHeight: 696,
    isConnected: true,
    parentElement: null,
    style: new Proxy(style, {
      set: (t, k, v) => {
        if (k === "paddingBottom") writes.push(v);
        t[k] = v;
        return true;
      },
    }),
    get scrollHeight() {
      const inline = parseFloat(style.paddingBottom);
      return at.content + (Number.isFinite(inline) ? inline : pad);
    },
    get scrollTop() {
      scroll = Math.max(0, Math.min(scroll, this.scrollHeight - this.clientHeight));
      return scroll;
    },
    set scrollTop(v) {
      scroll = Math.max(0, Math.min(v, this.scrollHeight - this.clientHeight));
    },
    getBoundingClientRect: () => ({ top: 56, bottom: 752 }),
    addEventListener: (k, fn) => heard.set(k, fn),
    removeEventListener: (k, fn) => {
      if (heard.get(k) === fn) heard.delete(k);
    },
  };
  const control = {
    isConnected: true,
    parentElement: box,
    getBoundingClientRect: () => ({ top: 56 + at.controlAt - box.scrollTop }),
  };
  const scrolled = () => heard.get("scroll") && heard.get("scroll")();
  return { at, box, control, heard, writes, scrolled, screenTop: () => control.getBoundingClientRect().top };
};

test("a switch that makes the page too short to stay where it stood keeps the control where it was, with room at the foot", () => {
  // History parked 120px down the window: 1446 into the content, the page scrolled to 1326.
  const p = page();
  const before = p.screenTop();
  holdStill(p.control, () => {
    p.at.content = 1760; // Consent: the list lost 840px
  });
  assert.equal(p.screenTop(), before, "the tabs are where the thumb left them");
  assert.equal(p.box.scrollTop, 1326, "the page did not move");
  assert.equal(p.box.style.paddingBottom, "262px", "the 230px the page lacked, under everything, on its own 32px");
  assert.ok(p.heard.has("scroll"), "and it listens, to give the room back");
});

test("a switch the page can take without being pulled back adds nothing", () => {
  const p = page({ top: 200, controlAt: 400 });
  holdStill(p.control, () => {
    p.at.content = 1760;
  });
  assert.equal(p.box.scrollTop, 200);
  assert.equal(p.box.style.paddingBottom, undefined, "no room where none was needed");
  assert.ok(!p.heard.has("scroll"));
});

test("scrolled up, the room gives back what the screen no longer needs, and goes once none is", () => {
  const p = page();
  holdStill(p.control, () => {
    p.at.content = 1760;
  });
  p.box.scrollTop = 1200;
  p.scrolled();
  assert.equal(p.box.style.paddingBottom, "136px", "104px of room keeps 1200 where it is");
  p.box.scrollTop = 1300;
  p.scrolled();
  assert.equal(
    p.box.style.paddingBottom,
    "136px",
    "scrolled back down, it never grows: the page ends where it was held",
  );
  p.box.scrollTop = 900;
  p.scrolled();
  assert.equal(p.box.style.paddingBottom, "", "none needed: the scroller's own padding again");
  assert.ok(!p.heard.has("scroll"), "and nothing listens any more");
});

test("a second switch adds to the room it already has, and back to a long list the room goes at the next scroll", () => {
  const p = page();
  holdStill(p.control, () => {
    p.at.content = 1968; // Messages: 632px shorter
  });
  assert.equal(p.box.style.paddingBottom, "54px", "22px short");
  holdStill(p.control, () => {
    p.at.content = 1760; // then Consent
  });
  assert.equal(p.box.style.paddingBottom, "262px", "the 208px more it lacked, added to the 22 it had");
  assert.equal(p.box.scrollTop, 1326);
  holdStill(p.control, () => {
    p.at.content = 2600; // All again
  });
  p.scrolled();
  assert.equal(p.box.style.paddingBottom, "", "a page long enough on its own needs no room");
});

test("REGRESSION: a control the change takes with it still has the page held -- Mark all read and a form's Not right? left the page to be pulled back", () => {
  const p = page();
  holdStill(p.control, () => {
    p.control.isConnected = false; // the last row read: the button goes with the list
    p.at.content = 1760;
  });
  assert.equal(p.box.scrollTop, 1326, "the page stands where it stood");
  assert.equal(p.box.style.paddingBottom, "262px", "with the room it lacked at its foot");
});

test("a control that moved anyway (what changed was above it) is scrolled back to where it was", () => {
  const p = page({ top: 800, controlAt: 1200 });
  const before = p.screenTop();
  holdStill(p.control, () => {
    p.at.controlAt = 1100; // a list over a "Show fewer" lost 100px
    p.at.content = 2500;
  });
  assert.equal(p.screenTop(), before, "the button is under the thumb again");
  assert.equal(p.box.scrollTop, 700);
});

test("where nothing scrolls, or there is no control, the change just runs", () => {
  let ran = 0;
  holdStill(null, () => ran++);
  holdStill(undefined, () => ran++);
  const p = page();
  p.box.__style = { overflowY: "visible" };
  holdStill(p.control, () => ran++);
  assert.equal(ran, 3);
  assert.equal(p.box.style.paddingBottom, undefined, "nothing added where nothing scrolls");
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
