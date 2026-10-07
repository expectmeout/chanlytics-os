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
 */
import { useEffect, useRef, useState } from "react";
import { recFolds } from "./registry";
import type { FoldId } from "./registry";

/** A boolean, or a function that says it when asked. */
type Flag = boolean | (() => unknown);
interface Seen {
  open: boolean;
  asking: { holding: FoldId; wants: FoldId } | null;
}
/** The hook's one pair of tests, for its life, reading the page's latest `dirty` and `saving`. */
interface Mine {
  dirty: Flag;
  saving: Flag;
  holds: () => boolean;
  saves: () => boolean;
}

const recSameAsk = (a: Seen["asking"], b: Seen["asking"]) =>
  (a ? a.holding : null) === (b ? b.holding : null) && (a ? a.wants : null) === (b ? b.wants : null);

export function useRecordFold(id: FoldId, { dirty = false, saving = false }: { dirty?: Flag; saving?: Flag } = {}) {
  const read = (): Seen => {
    const ask = recFolds.asking();
    return { open: recFolds.open() === id, asking: ask && ask.holding === id ? ask : null };
  };
  const [seen, setSeen] = useState(read);
  // ONE test for the hook's life, reading the page's latest `dirty`: what it binds and what its request hands over
  // are the same function, because the registry lets go of a test by its identity (bind's unbind). A new one each
  // render was a test the registry never let go of: a request made after a redraw held one the unbind did not know,
  // and a page gone from the screen still answered the Settings rail with its last "holds changes".
  const mine = useRef<Mine | null>(null);
  if (!mine.current) {
    const box: Mine = {
      dirty,
      saving,
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
    return () => {
      unhear();
      unbind();
    };
    // bound to the fold's id: the tests are the hook's own for its life (`mine`), and `read` reads the registry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return {
    open: seen.open,
    asking: seen.asking,
    request: () => recFolds.request(id, { dirty: holds }),
    close: () => recFolds.close(id),
    discard: () => recFolds.discard(),
    stay: () => recFolds.stay(),
  };
}
