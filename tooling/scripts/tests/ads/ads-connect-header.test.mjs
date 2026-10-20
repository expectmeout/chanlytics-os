/**
 * "From an ad" in a thread's header (surfaces/inbox/thread/header.tsx), drawn on the stub React for the demo's seeded threads:
 * the four an ad brought carry one quiet line under the head, a door to the ad; it stands beside the person's link and never
 * inside it (a link inside a link is neither valid nor reachable); every other thread, and every real one, draws none.
 */
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { memberWords, stateOf } from "@chanlytics/contracts";
import { installLegacyReact, fresh, again, unmount, all, byTestId, find, textOf } from "../_legacy-react.mjs";

const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
installLegacyReact({
  location: {
    pathname: "/w/studio",
    hash: "",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
    reload() {},
  },
  __chrome: { state: stateOf },
  __identity: { member: memberWords },
  CHANLY: { nav() {}, R: { client: (id) => `clients/${id}`, thread: (id) => `inbox/${id}` } },
  __surfaceState: () => "live",
  __DEMO_MODE: true,
  canDo: () => true,
  gate: () => ({}),
  setTimeout: () => 1,
  clearTimeout() {},
  setInterval: () => 1,
  clearInterval() {},
});
after(() => Object.assign(globalThis, timers));
(await import("../../../../apps/dashboard/src/surfaces/frame/frame-globals.ts")).installFrameGlobals();
const S = "../../../../apps/dashboard/src/surfaces";
const { ThreadHeader } = await import(`${S}/inbox/thread/header.tsx`);
const { NEEDING_YOU } = await import(`${S}/inbox/sample/threads-needing-you.ts`);
const { WATCHING } = await import(`${S}/inbox/sample/threads-watching.ts`);
const { DEMO_ADS } = await import(`${S}/demo-ads.ts`);

const threads = [...NEEDING_YOU, ...WATCHING];
const labels = { phone: "Phone", sms: "Text", mail: "Email", instagram: "Instagram" };
const draw = (thread) => {
  unmount();
  fresh();
  return again(() => ThreadHeader({ thread, channelLabels: labels }));
};
const threadOf = (id) => threads.find((t) => t.id === id);

test("a thread an ad brought says so under the head, as a door to the ad, beside the person's link", () => {
  const cases = [
    ["th-jordan-discount", DEMO_ADS.spring],
    ["th-maya-recovery", DEMO_ADS.spring],
    ["th-david-complaint", DEMO_ADS.saturday],
    ["th-aisha-refund", DEMO_ADS.saturday],
  ];
  for (const [id, ad] of cases) {
    const tree = draw(threadOf(id));
    const line = byTestId(tree, "ix-th-ad");
    assert.ok(line, `${id}: a line`);
    const door = find(line, (n) => n.type === "a");
    assert.equal(door.props.href, `#/campaigns/ads:ad:${ad.id}`, `${id}: a real link to the ad`);
    assert.equal(textOf(door).trim(), `From an ad · ${ad.name}`);
    const person = byTestId(tree, "ix-th-person");
    assert.ok(person, `${id}: and the person keeps their link`);
    assert.equal(
      all(person.props.children, (n) => n.type === "a" || n.props?.["data-testid"] === "ix-th-ad").length,
      0,
      `${id}: the door is not inside the person's link`,
    );
  }
});

test("a thread no ad brought draws no such line", () => {
  const plain = threads.filter((t) => !t.fromAd);
  assert.ok(plain.length > 3, "the demo has threads of other kinds");
  for (const t of plain.slice(0, 4)) assert.equal(byTestId(draw(t), "ix-th-ad"), null, t.id);
});
