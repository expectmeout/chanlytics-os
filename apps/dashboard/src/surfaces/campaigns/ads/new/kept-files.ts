/**
 * The pictures a New ad can show (MOCKUP for the ad, real for the pictures): the business's kept Files, newest first, a post Ask made
 * among them, read as the photo section is drawn and a few at a time. Its own read and not the Files page's surface, which holds the
 * shelf a person left that page on and opens on the Inbox: what waits there is not yet the business's to run. Nothing is written.
 */
import { useEffect, useState } from "react";
import type { FileDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";

/** How many one read brings: two rows at a desk, four on a phone. */
const KEPT_AT_ONCE = 12;

interface Held {
  files: FileDto[];
  next: string | null;
  /** How many wait in the Inbox: with nothing kept, they are where the photos are. */
  waiting: number;
}

interface KeptFiles {
  /** Undefined until read, null where the read failed. */
  held: Held | null | undefined;
  /** The next few, where there are more. */
  more: (() => void) | null;
  /** Read again, after one that failed. */
  again: () => void;
}

export function useKeptFiles(): KeptFiles {
  const [held, setHeld] = useState<Held | null | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let live = true;
    read("GET files", { query: { shelf: "all", limit: KEPT_AT_ONCE } }).then(
      (dto) => {
        if (live) setHeld({ files: dto.files, next: dto.next, waiting: dto.tally.waiting });
      },
      () => {
        if (live) setHeld(null);
      },
    );
    return () => {
      live = false;
    };
  }, [asked]);
  const next = held?.next ?? null;
  const more = () => {
    if (next === null) return;
    void read("GET files", { query: { shelf: "all", limit: KEPT_AT_ONCE, before: next } }).then((dto) => {
      setHeld((now) => (now?.next === next ? { ...now, files: [...now.files, ...dto.files], next: dto.next } : now));
    });
  };
  const again = () => {
    setHeld(undefined);
    setAsked((n) => n + 1);
  };
  return { held, more: next === null ? null : more, again };
}
