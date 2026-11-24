/**
 * What the model is told on Campaigns › Content, and what its guide says of the page (17 Nov 2026). An owner pasted their
 * Instagram into Content's "Where are your photos?" line and was told AI can't open Instagram links, and to connect in
 * Settings on Meta's own screen. The turn had said they were on Campaigns (offers, promotions, messages), and the guide
 * had no Content page: it filed making a post and bringing a link in under Settings, and its read named no way to ask
 * for either. No model runs here: these are the words it would be given, and the guide it would read.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const C = await import("@chanlytics/contracts");
const { turnWords } = await import(at("apps/dashboard/src/server/ask/prompt/prompt.ts"));
const { ASK_GUIDE_PAGES } = await import(at("apps/dashboard/src/server/ask/proposals/guide.ts"));
const { guideTool } = await import(at("apps/dashboard/src/server/ask/tools/read/guide.ts"));

const facts = {
  role: "owner",
  personLabel: "Ada",
  surface: "campaigns",
  timezone: "America/New_York",
  closures: [],
  now: new Date("2031-03-15T14:05:00Z"),
};

/** The cards Content's own pages commit, which the guide says on Content, and a yes for one of its files (00665). */
const CONTENT_VERBS = ["post", "piece", "publish", "take_down", "bring_in", "week", "claim"];

test("the view Content says is read by its address's own predicate, whichever of its tabs is shown", () => {
  // The page says its view as its param with its tab (bridge/ask/context.ts contentContext): one predicate reads both.
  for (const view of ["content", "content:all", "content:needs", "content:library"])
    assert.equal(C.isContentParam(view), true, view);
  for (const view of [null, undefined, "", "contents:all", "ads", "ads:example", "playbooks"])
    assert.equal(C.isContentParam(view), false, String(view));
});

test("on Content the model is told it is on Content, and never that it is on Campaigns", () => {
  for (const pageView of ["content:all", "content:library"]) {
    const words = turnWords({ ...facts, pageView });
    assert.match(words, /They are on Campaigns › Content/, pageView);
    assert.doesNotMatch(
      words,
      /They are on Campaigns, which lists/,
      "REGRESSION: on Content it was told offers and promotions are campaigns to propose",
    );
  }
});

test("a link to their website or Instagram, or an @name, is theirs to bring in, proposed at once", () => {
  const words = turnWords({ ...facts, pageView: "content:all" });
  assert.match(words, /A link to their website or their Instagram account, or an @name/);
  assert.match(words, /propose bringing them in at once/);
  assert.match(words, /waits in the Library until they keep it/);
  assert.match(
    words,
    /Never answer that you can't open a link/,
    'REGRESSION: a pasted instagram.com link was answered with "I can\'t open Instagram links"',
  );
});

test("a Google Drive folder, by its link or named with none, is theirs to watch, proposed at once", () => {
  const words = turnWords({ ...facts, pageView: "content:all" });
  assert.match(
    words,
    /A Google Drive folder, by its link or when they say their photos and videos are kept in Google Drive/,
  );
  assert.match(words, /a folder is watched from then on/);
  assert.match(words, /it goes straight into the Library/);
  assert.doesNotMatch(words, /propose_|bring_in/, "the line names no tool");
});

test("connecting an Instagram account is said as another thing, for when they ask to connect", () => {
  const words = turnWords({ ...facts, pageView: "content:all" });
  assert.match(words, /Connecting an Instagram account, to answer its messages or to post, is another thing/);
  assert.match(words, /Settings › Connections/);
  assert.match(words, /only when they ask to connect/);
});

test("words about a post or a video are one to make, and the line names no tool", () => {
  const words = turnWords({ ...facts, pageView: "content:all" });
  assert.match(words, /Words that describe a post or a video are a post or a video to propose/);
  assert.doesNotMatch(words, /propose_|bring_in/, "which tool carries it is the tools' own words, found by search");
});

test("anywhere else on Campaigns the line is as it was", () => {
  for (const pageView of [undefined, null, "playbooks", "sequences", "broadcasts"]) {
    const words = turnWords({ ...facts, pageView });
    assert.match(words, /They are on Campaigns, which lists/, String(pageView));
    assert.doesNotMatch(words, /Campaigns › Content/, String(pageView));
  }
  const ads = turnWords({ ...facts, pageView: "ads" });
  assert.match(ads, /They are on Ads, in Campaigns › Content/);
  assert.doesNotMatch(ads, /They are on Campaigns › Content/, "Ads is said as Ads, not as Content's own line");
});

test("the guide has a Content page that holds Content's cards, and Settings holds none of them", () => {
  const content = ASK_GUIDE_PAGES.find((p) => p.route === C.CONTENT_ROUTE);
  assert.ok(content, "REGRESSION: the guide had no Content page");
  assert.equal(content.page, "Content");
  assert.deepEqual([...content.verbs].sort(), [...CONTENT_VERBS].sort());
  const settings = ASK_GUIDE_PAGES.find((p) => p.page === "Settings");
  const stray = settings.verbs.filter((k) => CONTENT_VERBS.includes(k));
  assert.deepEqual(stray, [], "REGRESSION: bringing a link in was filed beside Settings' sign-ins");
});

test("the guide's read says how each of Content's cards is asked for", async () => {
  // The setup's read is not this test's: answered with none, the guide still says every page.
  const rc = { turn: { get: async () => ({ data: { setup: null } }) } };
  const read = await guideTool.actions[""].run({ role: "owner", rc }, {});
  const content = read.pages.find((p) => p.route === C.CONTENT_ROUTE);
  assert.ok(content, "the read answers a Content page");
  for (const tool of ["propose_post", "propose_piece", "propose_publish", "propose_bring_in"])
    assert.ok(
      content.ask_can.some((said) => said === tool || said.startsWith(`${tool} with action `)),
      `REGRESSION: the guide named no way to ask for ${tool}: ${JSON.stringify(content.ask_can)}`,
    );
});
