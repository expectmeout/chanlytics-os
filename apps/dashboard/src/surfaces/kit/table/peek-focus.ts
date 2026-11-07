/**
 * A peek's focus rule, run as the peek opens or closes and never otherwise. People, Leads and the Pipeline each move focus
 * into their peek as it opens and back to the cursor's row as it closes, so Tab carries on from where the member was. Each
 * scope is kept under React's Activity while another is on screen, and React runs a kept scope's effects again as it is
 * shown: the rule ran as if the peek had just closed, the row last opened took focus, and an iPhone drew the keyboard's
 * ring round it after every swipe back to the scope (Ruben, 7 Nov 2026). So the rule answers a peek it has not answered
 * yet, the way the cursor answers only a cursor that moved (people/hooks/use-place.ts useCursor).
 */
import { useEffect, useRef } from "react";

export function usePeekFocus(peekId: string | null, move: (peekId: string | null) => void): void {
  const answered = useRef<string | null>(null);
  useEffect(() => {
    if (answered.current === peekId) return;
    answered.current = peekId;
    move(peekId);
  }, [peekId]); // eslint-disable-line react-hooks/exhaustive-deps -- the peek opening or closing is the only reason
}
