/**
 * A list to choose one from, as a phone holds it (the kit's Picker and Select; surfaces/kit/picker/phone-list.ts and
 * kit.css): the phone's action sheet, as the kit's Menu is. The census of 13 Oct 2026 photographed 33 of the phone's
 * pickers as a desk's list, hung mid-sentence from its token over the words it covered (Campaigns' hour, its cap, a
 * broadcast's audience, the merge's other record); CmPicker, which the kit's Picker replaced, had drawn a sheet.
 *
 * Base UI's parts draw nothing in this suite (shared/_stand-in-base-ui.mjs), so this reads what the kit hands them, on
 * the stub React the page tests use: the popup marked for the phone's sheet, the veil behind it, its open held so a pull
 * can close it, and the pull kept its own. A browser holds how it looks and moves (the lane's Playwright check, and
 * e2e/kit/kit-behaves.spec.ts for the families on a desk).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { again, all, fresh, find, installStubReact } from "../_stub-react.mjs";

installStubReact();
const { Picker } = await import("../../apps/dashboard/src/surfaces/kit/picker/picker.tsx");
const { Select } = await import("../../apps/dashboard/src/surfaces/kit/select/select.tsx");

const h = (type, props) => globalThis.React.createElement(type, props);
const GROUPS = [
  {
    options: [
      { value: "09:00", label: "9:00 AM" },
      { value: "10:00", label: "10:00 AM" },
    ],
  },
];
const SEARCH = { glass: "G", placeholder: "Search", empty: "None match" };

/** What the kit hands Base UI: the root that holds open, the popup, and the veil, read off the tree it draws. */
const partsOf = (tree) => ({
  root: find(tree, (n) => n.props && typeof n.props.onOpenChange === "function" && "open" in n.props),
  popup: find(tree, (n) =>
    String(n.props?.className || "")
      .split(" ")
      .includes("rec-combo-pop"),
  ),
  veils: all(tree, (n) => n.props?.className === "more-backdrop"),
});

/** A thumb down a list from its top, as a browser reports one, on its own handlers (kit/motion/swipe.ts touchSwipe). */
const pull = (on, dy) => {
  const at = { dataset: {}, removeAttribute() {} };
  on.onTouchStart({ touches: [{ clientX: 200, clientY: 300 }], currentTarget: at, target: null, stopPropagation() {} });
  on.onTouchEnd({ changedTouches: [{ clientX: 200, clientY: 300 + dy }], currentTarget: at, stopPropagation() {} });
};

const KINDS = [
  [
    "a short Picker (Base UI's Select)",
    () => h(Picker, { label: "Hour", value: "09:00", onValueChange() {}, groups: GROUPS, chevron: "v" }),
  ],
  [
    "a Picker with its search (Base UI's Combobox)",
    () => h(Picker, { label: "Record", value: null, onValueChange() {}, groups: GROUPS, chevron: "v", search: SEARCH }),
  ],
  [
    "the kit's Select",
    () =>
      h(Select, {
        label: "Wire",
        value: "09:00",
        onValueChange() {},
        options: GROUPS[0].options,
        chevron: "v",
      }),
  ],
];

for (const [kind, draw] of KINDS) {
  test(`${kind} holds its list as the phone's sheet: marked for it, over the veil, closed by a pull that is its own`, () => {
    const media = globalThis.matchMedia;
    try {
      fresh();
      let tree = again(draw);
      let parts = partsOf(tree);
      assert.ok(parts.root, "its open is held by the kit, so a pull can close it");
      assert.equal(parts.root.props.open, false, "closed until its token is pressed");
      assert.equal(parts.popup.props["data-sheet"], "", "kit.css draws the sheet under 900px from data-sheet");
      assert.equal(parts.veils.length, 1, "the phone's veil behind it, which a press closes it through");
      // Its token opens it (Base UI says so through onOpenChange), and the list is drawn open.
      parts.root.props.onOpenChange(true);
      tree = again(draw);
      parts = partsOf(tree);
      assert.equal(parts.root.props.open, true);
      // The pull: on a phone only, and its touch is its own, so a picker in a sheet does not pull the sheet too.
      globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      pull(parts.popup.props, 200);
      tree = again(draw);
      assert.equal(partsOf(tree).root.props.open, true, "a desk's list is never pulled");
      const kept = [];
      parts.popup.props.onTouchStart({ stopPropagation: () => kept.push(1) });
      assert.deepEqual(kept, [1], "kept its own");
      globalThis.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
      pull(partsOf(tree).popup.props, 200);
      tree = again(draw);
      assert.equal(partsOf(tree).root.props.open, false, "let go past a third, on a phone's width, the list goes");
    } finally {
      globalThis.matchMedia = media;
    }
  });
}
