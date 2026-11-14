/**
 * One fold's hold on the registry, for the page that draws it, and the one place `open` comes from (moved whole from
 * legacy/components/record-fold.jsx, decision 0015).
 *
 * A fold the page drew open by itself would carry no rail's question and no unload prompt, and nothing would say so. The
 * hook hears the registry, so the page redraws as its fold opens, closes or is asked about.
 *
 *   const hours = useRecordFold("hours", { dirty: changed, saving: busy });
 *   <RecordRow id="hours" act={{ label: "Change", onClick: hours.request }} ... />
 *   <RecordFold id="hours" open={hours.open} onCancel={hours.close} saving={busy} ...
 *               confirm={hours.asking ? <Confirm ... onYes={hours.discard} onNo={hours.stay} /> : null} />
 *
 * The Confirm is the fold's `confirm`, never drawn beside it: inside the fold it sits above Save and Cancel, where the
 * changes it asks about are, focus comes back into the fold when it is answered, and it is not drawn while the fold
 * saves. Every section may draw that Confirm: `asking` is the registry's { holding, wants } only for the fold holding
 * the unsaved changes, where the prompt belongs, and null for every other, the fold asked for included. A section is
 * drawn again only when what it sees changes. `dirty` is the fold's unsaved-changes test, a boolean or a function, read
 * whenever the registry asks; `saving` is whether its save is out, the same way (registry.ts says what the registry does
 * with it). Both are bound to the fold's id as the hook mounts and let go of as it goes, so the registry asks it however
 * the fold was opened, by `request` here or by its id from anywhere else on the page; a page drawn again as a new
 * instance (a key change, a new parent) hands the registry its own, and a pending ask stands.
 *
 * `keep` keeps the fold's change in the tab (kept.ts), as a composer keeps its words: `value` is the change as the page
 * holds it, null for nothing typed, and `restore(value)` puts a kept one back into the page's draft. While the fold is
 * open, `value` is kept as it changes, for as long as `dirty` says it is a change, and forgotten once it is not. A fold
 * whose page comes back with a change kept for it opens again on it, unless another fold is open, so the person finds
 * what they typed where they left it, with Save and Cancel beside it, however the page was left; the registry forgets it
 * as the person closes the fold or throws the change away. A fold opened by anything else with a change kept for it
 * opens on that change too. `value` is kept as JSON: a page keeps there what it needs to judge and save the change (the
 * Business tab's folds keep what they opened with beside the draft, so a colleague's save read back meanwhile is still
 * refused as moved).
 */
import { useEffect, useRef, useState } from "react";
import { dropChange, keepChange, keptChange } from "./kept";
import { recFolds } from "./registry";
import type { FoldId } from "./registry";

/** A boolean, or a function that says it when asked. */
type Flag = boolean | (() => unknown);
interface Seen {
  open: boolean;
  asking: { holding: FoldId; wants: FoldId } | null;
}
/** What a fold keeps in the tab while it holds a change: the change as the page holds it, and how to put it back. */
interface Keep<D> {
  value: D | null;
  restore: (value: D) => void;
}
/** The hook's one pair of tests, for its life, reading the page's latest `dirty`, `saving` and `keep`. */
interface Mine<D> {
  dirty: Flag;
  saving: Flag;
  keep: Keep<D> | null;
  holds: () => boolean;
  saves: () => boolean;
}
/** One opening of a kept fold: whether it has looked for a change kept for it yet, and the change it kept last (JSON). */
interface Opening {
  looked: boolean;
  wrote: string | null;
}

const recSameAsk = (a: Seen["asking"], b: Seen["asking"]) =>
  (a ? a.holding : null) === (b ? b.holding : null) && (a ? a.wants : null) === (b ? b.wants : null);

/**
 * A kept fold's change, after each draw: only while it is open (closed, the registry forgets it as the person closes it,
 * and a fold whose page goes keeps it). As it opens, it opens on a change kept for it, if there is one; from then on,
 * what the page holds is kept as it changes, never on a timer, while it is a change, and forgotten once it is not.
 */
function keepWhatIsTyped<D>(id: FoldId, open: boolean, box: Mine<D>, opening: Opening): void {
  const keep = box.keep;
  if (!keep) return;
  if (!open) {
    opening.looked = false;
    opening.wrote = null;
    return;
  }
  if (!opening.looked) {
    opening.looked = true;
    const was = keptChange<D>(id);
    if (was != null) {
      opening.wrote = JSON.stringify(was);
      keep.restore(was);
      return;
    }
  }
  const now = box.holds() ? JSON.stringify(keep.value ?? null) : null;
  if (now === opening.wrote) return;
  opening.wrote = now;
  if (now == null) dropChange(id);
  else keepChange(id, keep.value);
}

export function useRecordFold<D = unknown>(
  id: FoldId,
  { dirty = false, saving = false, keep = null }: { dirty?: Flag; saving?: Flag; keep?: Keep<D> | null } = {},
) {
  const read = (): Seen => {
    const ask = recFolds.asking();
    return { open: recFolds.open() === id, asking: ask && ask.holding === id ? ask : null };
  };
  const [seen, setSeen] = useState(read);
  // ONE test for the hook's life, reading the page's latest `dirty`: what it binds and what its request hands over
  // are the same function, because the registry lets go of a test by its identity (bind's unbind). A new one each
  // render was a test the registry never let go of: a request made after a redraw held one the unbind did not know,
  // and a page gone from the screen still answered the Settings rail with its last "holds changes".
  const mine = useRef<Mine<D> | null>(null);
  if (!mine.current) {
    const box: Mine<D> = {
      dirty,
      saving,
      keep,
      holds: () => {
        const d = box.dirty;
        return typeof d === "function" ? !!d() : !!d;
      },
      saves: () => {
        const v = box.saving;
        return typeof v === "function" ? !!v() : !!v;
      },
    };
    mine.current = box;
  }
  mine.current.dirty = dirty;
  mine.current.saving = saving;
  mine.current.keep = keep;
  const ours = mine.current;
  const holds = mine.current.holds;
  const saves = mine.current.saves;
  useEffect(() => {
    const unbind = recFolds.bind(id, holds, saves);
    const hear = () =>
      setSeen((was) => {
        const now = read();
        return was.open === now.open && recSameAsk(was.asking, now.asking) ? was : now;
      });
    hear();
    const unhear = recFolds.subscribe(hear);
    // Its page come back with a change kept for it: the fold opens again on it, unless another is open.
    if (mine.current?.keep && recFolds.open() == null && keptChange(id) != null) recFolds.request(id, { dirty: holds });
    return () => {
      unhear();
      unbind();
    };
    // bound to the fold's id: the tests are the hook's own for its life (`mine`), and `read` reads the registry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const opening = useRef<Opening>({ looked: false, wrote: null });
  // After every draw: what is typed is read where the page holds it, and kept only when it moved (keepWhatIsTyped).
  useEffect(() => keepWhatIsTyped(id, seen.open, ours, opening.current));
  return {
    open: seen.open,
    asking: seen.asking,
    request: () => recFolds.request(id, { dirty: holds }),
    close: () => recFolds.close(id),
    discard: () => recFolds.discard(),
    stay: () => recFolds.stay(),
  };
}
