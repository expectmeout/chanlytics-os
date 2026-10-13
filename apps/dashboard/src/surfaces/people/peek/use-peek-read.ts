/**
 * The person People's peek draws (canvas A, PEEK-01): the copy this tab holds of them at once (person/read.ts heldPerson,
 * the page's own pair, so a demo reads its sample), read again behind it, and again when People lands or changes
 * (`surface:clients`: a step set or done, a deal recorded, a teammate's write the live feed tells of). A read that failed
 * with nothing held says so with its Retry; someone who is not here says that.
 */
import { useEffect, useState } from "react";
import type { PersonVM } from "@chanlytics/contracts";
import { hear, saidBy } from "../person-verbs";
import { heldPerson, readPerson } from "../person/read";

interface PeekRead {
  id: string | null;
  person: PersonVM | null;
  failed: string | null;
  missing: boolean;
}

const NO_READ: PeekRead = { id: null, person: null, failed: null, missing: false };

/** The peeked person as read, the copy held until then; `retry` asks again after a failed read. */
export function usePeekRead(id: string | null) {
  const [st, setSt] = useState<PeekRead>(NO_READ);
  const [tries, setTries] = useState(0);
  const mine = st.id === id;
  useEffect(() => {
    if (!id) return undefined;
    let live = true;
    const read = () => {
      readPerson(id).then(
        (p) => {
          if (live)
            setSt((s) => ({ id, person: p ?? (s.id === id ? s.person : null), failed: null, missing: p === null }));
        },
        (e: unknown) => {
          if (live)
            setSt((s) => (s.id === id && s.person ? s : { id, person: null, failed: saidBy(e) || "", missing: false }));
        },
      );
    };
    read();
    const off = hear("surface:clients", read);
    return () => {
      live = false;
      off();
    };
  }, [id, tries]);
  return {
    // Drawn in the draw that opens the peek: the tab's copy where it holds one, so a held person never opens on Reading….
    person: (mine ? st.person : null) ?? (id ? heldPerson(id) : null),
    failed: mine ? st.failed : null,
    missing: mine ? st.missing : false,
    retry: () => setTries((n) => n + 1),
  };
}
