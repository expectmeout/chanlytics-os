/**
 * A swipe crosses the page and touches no tab, so it reaches for nothing, and the page leaving goes with the finger. The first swipe
 * from the Inbox to Conversations on a phone found Conversations not yet fetched: the screen stood empty under the old title for as
 * long as the router took, 881 ms, with the page's rows already in hand (production, 7 Nov 2026). The bar keeps those pages warm, as it
 * keeps its own places.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installStubReact, fresh, again } from "../../_stub-react.mjs";
import { importSrc } from "../../_source.mjs";

installStubReact();
const h = globalThis.React.createElement;
const { PhoneTabs } = await importSrc("apps/dashboard/src/surfaces/frame/phone-tabs.tsx");
const { PHONE_TABS, PHONE_WARM_ROUTES } = await importSrc("apps/dashboard/src/surfaces/frame/places.ts");
const { stripPlace } = await importSrc("apps/dashboard/src/surfaces/frame/surface-tabs.tsx");

const drawBar = (page) =>
  again(() => h(PhoneTabs, { page, param: null, inboxNeeds: 0, onNavigate() {}, onMenu() {}, onPlace() {} }));

test("the bar keeps warm its four places and the pages a swipe walks to from them", () => {
  const kept = [];
  const had = globalThis.window.CHANLY;
  globalThis.window.CHANLY = { address: { keepWarm: (routes) => kept.push(routes) } };
  try {
    fresh();
    drawBar("today");
    assert.equal(kept.length, 1, "asked once as the bar stands");
    assert.deepEqual([...kept[0]].sort(), ["calendar", "clients", "conversations", "inbox", "live", "today"]);
  } finally {
    globalThis.window.CHANLY = had;
  }
});

test("a new view on a strip the bar holds is warmed with the rest, or this fails", () => {
  const walked = PHONE_TABS.flatMap((place) => place.holds).filter((page) => stripPlace(page));
  assert.ok(walked.includes("conversations"), "the strip is read from its own table");
  for (const page of walked) assert.ok(PHONE_WARM_ROUTES.includes(page), `${page} is one a swipe walks to`);
});
