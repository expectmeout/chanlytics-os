/**
 * The kit's person pick (apps/dashboard/src/surfaces/kit/person-pick/person-pick.tsx), drawn on the stub React and held
 * to the gallery's Person pick family (tooling/scripts/e2e-harness/kit-gallery.mjs) by the skeleton kit-components holds
 * the other families with (_skeleton.mjs); and what it does: a press picks that person, Enter the first found once what
 * is shown answers what was typed, and the words for nobody are a status while it is still being read.
 *
 * New proposal on the Pipeline and New conversation on the Inbox draw it, so each page's own test proves its words and
 * who it finds (tests/deals/pipeline.test.mjs, tests/new-conversation/new-conversation-sheet.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILIES } from "../../../tooling/scripts/e2e-harness/kit-gallery.mjs";
import { all, installStubReact, press } from "../../_stub-react.mjs";
import { PersonPick } from "../../../apps/dashboard/src/surfaces/kit/person-pick/person-pick.tsx";
import { HELD, drawn, parting } from "./_skeleton.mjs";

installStubReact();

const h = (type, props, ...children) => globalThis.React.createElement(type, props, ...children);

/** Two people found, as the gallery draws them: someone named with a deal, and a number who asked to stop. */
const FOUND = [
  {
    id: "a1",
    name: "Aisha Rahman",
    initials: "AR",
    stopped: false,
    deal: { line: "Proposal sent · 2d" },
    lastContact: { label: "Wrote · 3d" },
  },
  {
    id: "n1",
    name: "+1 (212) 555-0143",
    initials: "",
    stopped: true,
    deal: null,
    lastContact: { label: "Phoned · Oct 31" },
  },
];

/** A pick, its words the gallery's, and what it was asked to do kept in `seen`. */
function pickOf({ people = FOUND, reading = false, className } = {}, seen = { picked: [], typed: [] }) {
  return h(PersonPick, {
    label: "Who is it for?",
    placeholder: "Search people",
    q: "",
    onQ: (q) => seen.typed.push(q),
    people,
    onPick: (id) => seen.picked.push(id),
    none: reading ? "Reading…" : "No one matches.",
    reading,
    testid: "pick",
    className,
  });
}

const PERSON_PICKS = {
  "person-pick": () => pickOf(),
  "person-pick-none": () => pickOf({ people: [] }),
  "person-pick-reading": () => pickOf({ people: [], reading: true }),
};

test("PersonPick draws the gallery's Person pick family: the question and its box, who it found, nobody, nobody yet", () => {
  assert.deepEqual(parting(FAMILIES, "Person pick", PERSON_PICKS), HELD);
});

/** The elements of a drawing with this test id. */
const byTestId = (root, id) => all(root, (n) => n.props?.["data-testid"] === id);

test("a press picks that person; Enter the first found, and only once what is shown answers what was typed", () => {
  const seen = { picked: [], typed: [] };
  const root = drawn(pickOf({}, seen));
  const [aisha, number] = byTestId(root, "pick-pick");
  press(number);
  assert.deepEqual(seen.picked, ["n1"], "the person pressed, by their id");
  const [search] = byTestId(root, "pick-search");
  search.props.onChange({ target: { value: "ai" } });
  assert.deepEqual(seen.typed, ["ai"], "what is typed is the page's to match");
  let kept = 0;
  search.props.onKeyDown({ key: "Enter", preventDefault: () => (kept += 1) });
  assert.deepEqual([seen.picked, kept], [["n1", "a1"], 1], "Enter takes the first found, and the key is the pick's");
  search.props.onKeyDown({ key: "a", preventDefault: () => (kept += 1) });
  assert.equal(kept, 1, "any other key is the box's");
  assert.ok(aisha, "each found is a press");
  const reading = drawn(pickOf({ reading: true }, seen));
  byTestId(reading, "pick-search")[0].props.onKeyDown({ key: "Enter", preventDefault: () => (kept += 1) });
  assert.deepEqual([seen.picked.length, kept], [2, 1], "still reading: what is shown is not the answer yet");
  const nobody = drawn(pickOf({ people: [] }, seen));
  byTestId(nobody, "pick-search")[0].props.onKeyDown({ key: "Enter", preventDefault: () => (kept += 1) });
  assert.deepEqual([seen.picked.length, kept], [2, 1], "nobody found: Enter picks nobody");
});

test("a person who asked to stop wears the mark beside their name; the page's class comes last; the box is not focused unless asked", () => {
  const root = drawn(pickOf({ className: "page-place" }));
  assert.equal(root.props.className, "person-pick page-place");
  assert.equal(root.props["data-testid"], "pick");
  assert.equal(byTestId(root, "pick-stopped").length, 1, "only the one who asked to stop");
  assert.equal(byTestId(root, "pick-search")[0].props.autoFocus, false);
  const focused = drawn(h(PersonPick, { ...pickOf().props, autoFocus: true }));
  assert.equal(byTestId(focused, "pick-search")[0].props.autoFocus, true);
  const none = drawn(pickOf({ people: [] }));
  assert.equal(byTestId(none, "pick-none")[0].props.role, undefined, "nobody, once read, is a line and no status");
});
