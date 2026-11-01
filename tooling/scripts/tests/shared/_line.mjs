/**
 * A desk's search as a page test reaches it: the top bar's line (apps/dashboard/src/surfaces/kit/head/page-search.ts;
 * the page heads canvas, H2, 31 Oct 2026), where a list's own box stood in its pane, drawn as that box was: its words, its
 * name, its test id, its ref and its typing. The frame draws the line, and a page test draws the page alone, so this reads what the
 * page said to it. Null where the page said no search: a phone, which draws its own box, or a view with nothing to search.
 */
const { pageSearchSaid } = await import("../../../../apps/dashboard/src/surfaces/kit/head/page-search.ts");

export const lineBox = () => {
  const s = pageSearchSaid();
  if (!s) return null;
  return {
    type: "input",
    props: {
      value: s.value,
      placeholder: s.label,
      "aria-label": s.label,
      "data-testid": s.testid,
      ref: s.inputRef,
      onChange: (e) => s.onValue(e.target.value),
    },
  };
};
