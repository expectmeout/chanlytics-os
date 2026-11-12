/**
 * The pictures a New ad can show (MOCKUP for the ad, real for the pictures): what Ask made, then the business's kept Files, each
 * newest first, read as the photo section is drawn and a few at a time. Two shelves, since Kept is what the business brought and
 * what Ask made stands on its own (contracts FILE_SHELVES). Its own reads and not the Library's surface, which holds the shelf a
 * person left it on and opens on the Inbox: what waits there is not yet the business's to run. Nothing is written.
 */
import { useEffect, useState } from "react";
import type { FileDto, FilesPageDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";

/** How many one read brings: two rows at a desk, four on a phone. */
const KEPT_AT_ONCE = 12;

/** Where each list's next few start: what Ask made, and what the business keeps; null at the last of it. */
interface Next {
  made: string | null;
  kept: string | null;
}

interface Held {
  /** What Ask made, then what is kept: the section draws each under its own heading, by where it came from. */
  files: FileDto[];
  next: Next;
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

type Shelf = "all" | "made";

const pageOf = (shelf: Shelf, before: string | null) =>
  read("GET files", { query: { shelf, limit: KEPT_AT_ONCE, ...(before ? { before } : {}) } });

/** A shelf's page as asked, or none: a read of a shelf that holds nothing answers where the library opens, which is not it. */
const asAsked = (shelf: Shelf, dto: FilesPageDto | null): Pick<FilesPageDto, "files" | "next"> =>
  dto && dto.shelf === shelf ? dto : { files: [], next: null };

export function useKeptFiles(): KeptFiles {
  const [held, setHeld] = useState<Held | null | undefined>(undefined);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    let live = true;
    Promise.all([pageOf("all", null), pageOf("made", null)]).then(
      ([kept, made]) => {
        const ask = asAsked("made", made);
        const own = asAsked("all", kept);
        if (live)
          setHeld({
            files: [...ask.files, ...own.files],
            next: { made: ask.next, kept: own.next },
            waiting: kept.tally.waiting,
          });
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
    if (!next || (next.made === null && next.kept === null)) return;
    void Promise.all([
      next.made === null ? null : pageOf("made", next.made),
      next.kept === null ? null : pageOf("all", next.kept),
    ]).then(([made, kept]) => {
      const ask = asAsked("made", made);
      const own = asAsked("all", kept);
      setHeld((now) =>
        now?.next === next
          ? { ...now, files: [...now.files, ...ask.files, ...own.files], next: { made: ask.next, kept: own.next } }
          : now,
      );
    });
  };
  const again = () => {
    setHeld(undefined);
    setAsked((n) => n + 1);
  };
  return { held, more: next && (next.made !== null || next.kept !== null) ? more : null, again };
}
