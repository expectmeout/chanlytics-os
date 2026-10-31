/**
 * Today's Brought in (decision 0073, R23, canvas T-today and T·g; today/pages/brought-in.tsx), drawn without a browser:
 * the small card of what came in before Chanlytics, from the imports ledger Setup reads: where it all stands in its head,
 * a few facts closed, and opened in place the sources one by one in the first run's own lines, with Try again that
 * answers at the press; drawn while anything is coming in, a source stopped, or for a week after. The world is the first
 * run's (_first-run-world.mjs): the card reads the same Setup surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import {
  byTestId,
  flashes,
  fresh,
  mountWith,
  saidOf,
  setSetup,
  setupVerbs,
  surface,
  textOf,
  withFacts,
} from "./_first-run-world.mjs";

const { TodayBroughtIn } = await importSrc("apps/dashboard/src/surfaces/today/pages/brought-in.tsx");
const { ImportLines } = await importSrc("apps/dashboard/src/surfaces/setup/first-run/channels/brought.tsx");
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
/** Today's card drawn, as the page draws it, over Setup as the seam holds it (its own state kept across draws). */
const draw = () => mountWith(TodayBroughtIn);
/** Today's card drawn as a page opened again: every hook's cell empty. */
const drawFresh = () => {
  fresh();
  return draw();
};
const settled = () => new Promise((r) => setImmediate(r));

test("Today's Brought in, closed: where it all stands in its head, then the people, how far back email reached, the calendar", () => {
  const imports = [
    row("google_reviews", "done", { reviews: 212 }),
    row("mailbox", "done", { messages: 300 }, { oldest: "2026-03-07T00:00:00Z" }),
    row("calendar", "done", { past: 412, coming: 9 }),
    row("whatsapp_history", "running", {}, { parts_done: 1, parts_total: 3 }),
  ];
  setSetup(surface({ ...withFacts, imports, people: 640 }));
  const tree = drawFresh();
  const card = byTestId(tree, "today-brought-in");
  assert.ok(card);
  const head = byTestId(card, "today-brought-open");
  assert.equal(head.props["aria-expanded"], false, "closed until pressed");
  const state = byTestId(card, "today-brought-state");
  assert.equal(state.props["data-tone"], "live");
  assert.equal(saidOf(state), "Bringing it in · 3 of 4", "one place says where it all stands, the live dot beside it");
  assert.match(
    textOf(byTestId(card, "today-brought-facts")),
    /^640 people · 212 reviewsEmail since .+412 past appointments · 9 coming up$/,
  );
  assert.doesNotMatch(textOf(card), / In$|\bIn\b(?! )/, "no line says In: a tick does");
});

test("Today's Brought in opens in place: the facts fold, the sources unfold, and the foot says it keeps going only while it does", () => {
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("contacts", "done", { people: 249 }, { via: "google" }),
        row(
          "mailbox",
          "running",
          { messages: 214, dropped: 131 },
          { oldest: "2026-07-01T00:00:00Z", parts_total: null },
        ),
      ],
      people: 282,
    }),
  );
  let tree = drawFresh();
  let card = byTestId(tree, "today-brought-in");
  assert.doesNotMatch(card.props.className, /\bopen\b/);
  const sources = byTestId(card, "fr-bringing-lines");
  assert.ok(sources, "the sources are in the card, folded away while it is closed");
  byTestId(tree, "today-brought-open").props.onClick();
  tree = draw();
  card = byTestId(tree, "today-brought-in");
  assert.match(card.props.className, /\bopen\b/);
  assert.equal(byTestId(card, "today-brought-open").props["aria-expanded"], true);
  const inbox = byTestId(card, "fr-import-mailbox");
  assert.match(textOf(inbox), /^Your inbox214 emails so far · since .+131 newsletters, notices and pitches set aside$/);
  // Each line is a door to its page, and what the mailbox set aside a door to where it is listed.
  const doorTo = (id) => byTestId(card, id).props.href;
  assert.match(doorTo("fr-import-door-mailbox"), /inbox$/, "the inbox's line opens the Inbox");
  assert.match(doorTo("fr-import-door-contacts"), /clients$/, "the contacts' line opens People");
  assert.match(doorTo("fr-import-aside-mailbox"), /admin\/integrations\/left$/, "Left in your mailbox, open");
  assert.equal(typeof byTestId(card, "fr-import-door-mailbox").props.onClick, "function", "a press goes the app's way");
  assert.match(textOf(card), /Keeps going if you leave\. Shown on each person as history, never answered\.$/);
  byTestId(tree, "today-brought-open").props.onClick();
  tree = draw();
  assert.doesNotMatch(byTestId(tree, "today-brought-in").props.className, /\bopen\b/, "a second press closes it");
});

test("Try again answers at the press: Starting, and still, until the run is heard; a refusal gives the press back and says why", async (t) => {
  const again = [];
  let answer = { ok: true, message: "" };
  t.after(() => delete setupVerbs.importAgain);
  setupVerbs.importAgain = async (source) => {
    again.push(source);
    return answer;
  };
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("google_reviews", "done", { reviews: 3 }),
        row("mailbox", "failed", { messages: 130 }, { last_error: "It stopped part way. What came in is kept." }),
      ],
      people: 3,
    }),
  );
  let tree = drawFresh();
  assert.equal(saidOf(byTestId(tree, "today-brought-state")), "1 stopped");
  assert.match(textOf(byTestId(tree, "fr-import-mailbox")), /Stopped part way · 130 emails kept/);
  const press = byTestId(tree, "fr-import-again-mailbox");
  assert.equal(textOf(press), "Try again");
  press.props.onClick();
  await settled();
  assert.deepEqual(again, ["mailbox"]);
  tree = draw();
  const busy = byTestId(tree, "fr-import-again-mailbox");
  assert.equal(saidOf(busy), "Starting");
  assert.equal(busy.props.disabled, true, "a second press does nothing while the first is on its way");
  // The run is heard starting: the line is a bar now, and no press is drawn.
  setSetup(
    surface({
      ...withFacts,
      imports: [
        row("google_reviews", "done", { reviews: 3 }),
        row("mailbox", "running", { messages: 130 }, { oldest: "2026-07-01T00:00:00Z", parts_total: null }),
      ],
      people: 3,
    }),
  );
  tree = draw();
  assert.equal(byTestId(tree, "fr-import-again-mailbox"), null);
  assert.equal(saidOf(byTestId(tree, "today-brought-state")), "Bringing it in · 1 of 2");
  // A press the door refuses: Try again again, and the refusal in a toast.
  answer = { ok: false, message: "Your mailbox signed out." };
  setSetup(
    surface({
      ...withFacts,
      imports: [row("mailbox", "failed", {}, { last_error: "It stopped part way. What came in is kept." })],
      people: 3,
    }),
  );
  tree = drawFresh();
  flashes.length = 0;
  byTestId(tree, "fr-import-again-mailbox").props.onClick();
  await settled();
  tree = draw();
  assert.equal(textOf(byTestId(tree, "fr-import-again-mailbox")), "Try again");
  assert.equal(flashes.length, 1, "the refusal said once");
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

test("the first run's sheet draws the same lines with no doors: its owner stays on the step", () => {
  fresh();
  const lines = [
    {
      source: "mailbox",
      title: "Your inbox",
      says: "414 emails · since Jun 7",
      stand: "In",
      state: "done",
      retry: false,
      share: null,
      aside: "195 newsletters, notices and pitches set aside",
      door: "inbox",
      asideDoor: "admin/integrations/left",
      count: 414,
    },
  ];
  const tree = mountWith(ImportLines, { lines, flash: () => {} });
  assert.equal(byTestId(tree, "fr-import-door-mailbox"), null);
  assert.equal(byTestId(tree, "fr-import-aside-mailbox"), null);
  assert.match(textOf(byTestId(tree, "fr-import-mailbox")), /^Your inbox414 emails · since Jun 7195 newsletters/);
});
