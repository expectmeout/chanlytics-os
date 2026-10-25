// Chanlytics — Settings › Business › How it answers › On calls: the number the business keeps, and its forwarding.
//
// Forwarding was set up on Setup's rows alone, Today's card and the first run's phone step, so "The number you already
// have" could never be put off for good: nothing else could set it up (the Skip review, 25 Oct 2026). This row is its
// home after the first run. It is Setup's own row (contracts keptNumberRowOf, over keepRow), so this page and Today's
// card say the same thing, and its act opens Setup's own forwarding card (setup/rows/forwarding.tsx), asked for as the
// row first opens: the card's chunk is Today's and the first run's, and Settings opens on everything else.
//
// The card is drawn after the row, never inside it: a record row is its own press (kit/record/row.tsx), so a click on
// the card's words would have closed it. What the card saves goes through Setup's verbs and re-reads Setup, which this
// row hears through the seam, so a code saved or a test proven is said here as it lands.

import { useState } from "react";
import { keptNumberRowOf } from "@chanlytics/contracts";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";
import { RecordRow } from "../../../kit/record/row";
import type { LegacyFlash } from "../../../legacy-verbs";
import { useSurface } from "../../../use-surface";

/** Setup's forwarding card, fetched the first time the row is opened. */
const forwardingCode = codeOnce(() => import("../../../setup/rows/forwarding"));

/** The number kept and how its calls reach the receptionist; nothing while there is no line to forward to. */
export const BtKeptNumberRow = ({ flash }: { flash: (f: LegacyFlash) => void }) => {
  const S = useSurface("setup");
  const [open, setOpen] = useState(false);
  const card = useCode(forwardingCode, open).loaded;
  const row = S ? keptNumberRowOf(S.vm, S.dto.lines) : null;
  if (!S || !row) return null;
  return (
    <>
      <RecordRow
        id="kept_number"
        label={row.label}
        value={row.value}
        empty={row.empty}
        hint={row.hint}
        act={{ label: open ? row.close : row.act, onClick: () => setOpen((was) => !was) }}
      />
      {open && card ? <card.ForwardingCard S={S} flash={flash} onDone={() => setOpen(false)} /> : null}
    </>
  );
};
