/**
 * A chunk's module as a component draws it (code-once.ts): null until it is in, then the module, the component drawn
 * again as it lands. Nothing is fetched while `wanted` is false (a sheet not asked for yet); a module already in is drawn
 * all the same. A fetch that failed says so (`failed`), and `retry` asks for it again: a page draws the shell's failed
 * read with its Retry where the chunk is the thing that could not be read.
 */
import { lazy, useCallback, useEffect, useState, type ComponentType, type LazyExoticComponent } from "react";
import type { CodeOnce } from "./code-once";

/**
 * A part held in a chunk, as a mount draws it: the part itself where the chunk is in, which draws at once and never
 * suspends, else a lazy part, which says it is reading until the chunk lands. Asked once per mount (the caller's state), so
 * a mount never swaps one for the other and loses what it holds. A load that opens on the part fetches it beside the
 * frame's own code and holds its first draw for it (surfaces/campaigns/home/opening.ts), so the first draw is the part.
 */
export function partNow<M, P extends object>(
  code: CodeOnce<M>,
  pick: (m: M) => ComponentType<P>,
): () => ComponentType<P> | LazyExoticComponent<ComponentType<P>> {
  const WhenRead = lazy(() => code().then((m) => ({ default: pick(m) })));
  return () => {
    const m = code.now();
    return m ? pick(m) : WhenRead;
  };
}

interface CodeDrawn<T> {
  loaded: T | null;
  failed: boolean;
  retry: () => void;
}

export function useCode<T>(code: CodeOnce<T>, wanted: boolean): CodeDrawn<T> {
  const [held, setHeld] = useState<T | null>(code.now);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (held || !wanted) return undefined;
    let live = true;
    code().then(
      (m) => {
        if (live) setHeld(() => m);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, [code, held, wanted, tries]);
  const retry = useCallback(() => {
    setFailed(false);
    setTries((n) => n + 1);
  }, []);
  return { loaded: held ?? code.now(), failed, retry };
}
