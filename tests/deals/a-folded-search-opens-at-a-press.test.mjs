/**
 * The phone's bar with its search folded (surfaces/people/rail/phone-bar.tsx foldSearch, the Pipeline's), drawn on the stub
 * React: the search rests in a glyph while it holds no words, so the first deal stands 48px higher, and the field stays
 * drawn, because a phone's keyboard comes only with a focus made inside the press (Ruben, 11 Oct 2026: a first tap that
 * only drew the field changed nothing a person could see).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, byTestId, find, press } from "../_legacy-react.mjs";

installLegacyReact();
const { PeoplePhoneBar } = await import("../../apps/dashboard/src/surfaces/people/rail/phone-bar.tsx");
const { Search } = await import("../../apps/dashboard/src/surfaces/kit/search/search.tsx");

const draw = (props) => {
  fresh();
  return again(() =>
    globalThis.React.createElement(PeoplePhoneBar, {
      q: "",
      onQ() {},
      searchRef: null,
      searchLabel: "Search names",
      testid: "list",
      onLists() {},
      ...props,
    }),
  );
};
const searchOf = (tree) => find(tree, (n) => n.type === Search || n.props?.className?.includes?.("pp-lookup"));

test("at rest the search is a glyph named as the field is, and the field stays drawn", () => {
  const tree = draw({ foldSearch: true });
  assert.match(searchOf(tree).props.className, /\bpp-lookup-folded\b/);
  assert.ok(byTestId(tree, "list-phone-search"), "the field, for the press and for /");
  assert.equal(byTestId(tree, "list-phone-find").props["aria-label"], "Search names");
});

test("the glyph's press puts the caret in the field, inside the press, so a phone's keyboard comes with it", () => {
  let focused = 0;
  const tree = draw({ foldSearch: true, searchRef: { current: { focus: () => (focused += 1) } } });
  press(byTestId(tree, "list-phone-find"));
  assert.equal(focused, 1);
});

test("with words in it the field stays open and the glyph has gone", () => {
  const tree = draw({ foldSearch: true, q: "Sol" });
  assert.doesNotMatch(searchOf(tree).props.className, /\bpp-lookup-folded\b/);
  assert.equal(byTestId(tree, "list-phone-find"), null);
});

test("a list that does not ask keeps its search where it stood", () => {
  const tree = draw({});
  assert.doesNotMatch(searchOf(tree).props.className, /\bpp-lookup-folded\b/);
  assert.equal(byTestId(tree, "list-phone-find"), null);
});
