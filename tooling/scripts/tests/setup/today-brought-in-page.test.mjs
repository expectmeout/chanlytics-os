/**
 * Today's Brought in (decision 0073, R23, canvas T-today and T·g; today/pages/brought-in.tsx), drawn without a browser:
 * the small card of what came in before Chanlytics, from the imports ledger Setup reads, and the sources one by one in
 * the first run's own lines; drawn while anything is coming in, a source stopped, or for a week after. The world is the
 * first run's (_first-run-world.mjs): the card reads the same Setup surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { byTestId, mountWith, setSetup, setupVerbs, surface, textOf, walk, withFacts } from "./_first-run-world.mjs";

const { TodayBroughtIn } = await importSrc("apps/dashboard/src/surfaces/today/pages/brought-in.tsx");
const DAY = 86_400_000;
const row = (source, state, counts, over = {}) => ({
  source,
  state,
  counts,
  parts_done: state === "done" ? 1 : 0,
  parts_total: 1,
  oldest: null,
  started_at: new Date(Date.now() - DAY).toISOString(),
  finished_at: state === "done" ? new Date(Date.now() - DAY).toISOString() : null,
  last_error: null,
  via: null,
  ...over,
});
const sheetOf = (tree, id) => {
  let hit = null;
  walk(tree, (n) => {
    if (!hit && n.props?.testid === id) hit = n;
  });
  return hit;
};
/** Today's card drawn fresh, as the page draws it, over Setup as the seam holds it. */
const draw = () => mountWith(TodayBroughtIn);

test("Today's Brought in: the people and the reviews, how far back email reached, the calendar, and the chats still coming", () => {
  const imports = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 412, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  setSetup(surface({ ...withFacts, imports, people: 640 }));
  const tree = draw();
  const card = byTestId(tree, "today-brought-in");
  assert.ok(card);
  assert.match(textOf(byTestId(card, "today-brought-open")), /^Brought in640 people · 212 reviewsEmail back to /);
  assert.match(textOf(card), /412 on your calendar before today · 9 coming up/);
  assert.equal(textOf(byTestId(card, "today-brought-coming")), "WhatsApp chats · 1 of 3 parts");
});

test("Today's Brought in opens the sources one by one, in Today's own words, with Try again where one stopped", async (t) => {
  const again = [];
  t.after(() => delete setupVerbs.importAgain);
  setupVerbs.importAgain = async (source) => {
    again.push(source);
    return { ok: true, message: "" };
  };
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("google_reviews", "done", { reviews: 3 }),
        row("calendar", "failed", {}, { last_error: "It stopped part way. What came in is kept." }),
      ],
      people: 3,
    }),
  );
  let tree = draw();
  const sheet = sheetOf(tree, "fr-bringing");
  assert.equal(sheet.props.open, false);
  assert.equal(sheet.props.title, "What came in before Chanlytics");
  byTestId(tree, "today-brought-open").props.onClick();
  tree = mountWith(TodayBroughtIn);
  assert.equal(sheetOf(tree, "fr-bringing").props.open, true);
  await byTestId(tree, "fr-import-again-calendar").props.onClick();
  assert.deepEqual(again, ["calendar"]);
});

test("Today's Brought in is drawn while it helps: nothing before anything came, and nothing a week after the last source finished", () => {
  setSetup(surface({ ...withFacts, imports: [] }));
  assert.equal(byTestId(draw(), "today-brought-in"), null, "nothing came");
  const old = new Date(Date.now() - 9 * DAY).toISOString();
  setSetup(
    surface({
      ...withFacts,
      imports: [row("google_reviews", "done", { reviews: 3 }, { finished_at: old })],
      people: 3,
    }),
  );
  assert.equal(
    byTestId(draw(), "today-brought-in"),
    null,
    "past the week: People's, the Inbox's and the Calendar's own",
  );
  setSetup(undefined);
  assert.equal(byTestId(draw(), "today-brought-in"), null, "Setup not read yet");
});
