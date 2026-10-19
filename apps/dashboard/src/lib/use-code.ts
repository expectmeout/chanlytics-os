/**
 * A chunk's module as a component draws it (code-once.ts): null until it is in, then the module, the component drawn
 * again as it lands. Nothing is fetched while `wanted` is false (a sheet not asked for yet); a module already in is drawn
 * all the same. A fetch that failed says so (`failed`), and `retry` asks for it again: a page draws the shell's failed
 * read with its Retry where the chunk is the thing that could not be read.
 */
import { useCallback, useEffect, useState } from "react";
import type { CodeOnce } from "./code-once";

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
