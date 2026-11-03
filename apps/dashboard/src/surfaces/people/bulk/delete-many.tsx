/**
 * Delete… for a selection (3 Nov 2026): the person page's Delete person, for many at a press. A mailbox brought in
 * programs and pitches as people before it judged its senders (decision 0080), and an owner's five erasures an hour made
 * clearing them a day of taps. The owner's alone; fifty at a press, as every act of the bar; the count typed, as the
 * person page types the name. Two acts, as the person page has: Not a person (their address said automated first, by
 * address alone) and Delete. Whoever a press could not delete stays selected, and the toast says why. Drawn in the kit's
 * sheet, a side pane on a desk and from the foot on a phone, as Delete person is: the title, who goes under it, and the
 * question in the foot; no paragraph and no switch (Ruben, 3 Nov 2026: "overly wordy and cluttered"; a switch also
 * brought the kit's Switch into People's graph, and the bundler moved 11.8 KB of shared parts into Settings' first
 * load). The sheet is a chunk of its own (delete-many-sheet.tsx).
 */
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { Icon } from "../../kit/icon/icon";
import { deletePeopleMany, type DeletedMany } from "../people-detail";
import { barMenu } from "./bar-menu";
import { DELETE_MANY_CLOSED, type BulkCtx } from "./bulk-state";

const howManyPeople = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/** Delete…'s words: the bar's menu and its two acts, the sheet, its typed question, and what a press says after. */
export const DELETE_MANY_WORDS = {
  act: "Delete",
  hover: "Delete these people, or say they are not people",
  notAPerson: "Not a person…",
  delete: "Delete…",
  title: (n: number, bot: boolean) => `${bot ? "Not people" : "Delete"}: ${howManyPeople(n)}`,
  who: (names: readonly string[], more: number) => `${names.join(", ")}${more ? ` and ${more} more` : ""}`,
  /** Not a person's one line: what it does beside the delete. */
  mailOut: "Deleted, and their mail stays out from now on.",
  typed: (n: number) => `Can't be undone. Type ${n} to confirm.`,
  yes: (n: number) => `Delete ${n}`,
  busy: "Deleting…",
  cancel: "Cancel",
  failed: "Could not delete these people.",
  /** What a press did: who went, who did not and why, who was gone already, and who is still selected for the next. */
  said: (r: DeletedMany, more: number) =>
    [
      r.erased.length ? `${howManyPeople(r.erased.length)} deleted` : "Nobody deleted",
      r.failed.length ? `${r.failed.length} not deleted — ${r.failed.at(0)?.message ?? ""}` : null,
      r.skipped.length ? `${r.skipped.length} already gone` : null,
      r.left.length + more ? `${r.left.length + more} still selected — press Delete again` : null,
    ]
      .filter(Boolean)
      .join(" · "),
} as const;

/** Whether the selection may be deleted from this bar: an owner's, on a page that keeps the act. */
export const mayDeleteMany = (b: BulkCtx) => b.isOwner && b.keeps("delete");

/** Delete…'s acts: open its question (as Not a person, or as Delete), answer it, and close it. */
export function deleteManyActs(b: BulkCtx) {
  const { st, flash, batch, rest, onKeep, onClear, onSheet } = b;
  const { busy, setBusy, del, setDel } = st;
  const askDelete = (bot: boolean) => {
    if (busy) return;
    onSheet(null);
    setDel({ ...DELETE_MANY_CLOSED, open: true, bot });
  };
  const closeDelete = () => {
    if (!busy) setDel(DELETE_MANY_CLOSED);
  };
  const confirmDelete = async () => {
    if (busy || del.typed.trim() !== String(batch.length)) return;
    setBusy(true);
    setDel((d) => ({ ...d, error: null }));
    const r = await deletePeopleMany(batch, del.bot);
    setBusy(false);
    if (!r.ok) {
      setDel((d) => ({ ...d, error: r.message || DELETE_MANY_WORDS.failed }));
      return;
    }
    setDel(DELETE_MANY_CLOSED);
    flash({ tone: r.failed.length ? "danger" : "ok", msg: <>{DELETE_MANY_WORDS.said(r, rest.length)}</> });
    // Who could not go, and who the press had no time for, stay selected beside the rest of the selection.
    const keep = [...r.failed.map((f) => f.id), ...r.left, ...rest];
    if (keep.length) onKeep(keep);
    else onClear();
  };
  return { askDelete, closeDelete, confirmDelete };
}
export type DeleteManyActs = ReturnType<typeof deleteManyActs>;

/** The desk bar's Delete menu: Not a person…, then Delete…, the destroying act in red. */
export function deleteManyMenu(b: BulkCtx, a: DeleteManyActs) {
  const W = DELETE_MANY_WORDS;
  return barMenu({
    words: W.act,
    hover: W.hover,
    busy: b.st.busy,
    size: "sm",
    testid: "bulk-delete",
    groups: [
      {
        items: [
          { label: W.notAPerson, glyph: <Icon name="ban" size={13} />, onSelect: () => a.askDelete(true) },
          { label: W.delete, glyph: <Icon name="x" size={13} />, tone: "danger", onSelect: () => a.askDelete(false) },
        ],
      },
    ],
  });
}

/**
 * Delete…'s sheet, a chunk of its own: asked for as an owner's selection bar is drawn, so People's first load carries
 * none of it and a press finds it in (bundle-budget.mjs; #2076's first run had the person page's words in it, +41.8 KB).
 * What it reads of the module is named, so the dead-exports check (knip) sees the use.
 */
const sheetCode = codeOnce(() => import("./delete-many-sheet").then(({ DeleteManySheet }) => ({ DeleteManySheet })));

/** Delete…'s question where the bar may ask it: drawn, closed, once its chunk is in. */
export function DeleteManyQuestion({ b, a }: { b: BulkCtx; a: DeleteManyActs }) {
  const Sheet = useCode(sheetCode, true).loaded?.DeleteManySheet;
  return Sheet ? <Sheet b={b} a={a} /> : null;
}
