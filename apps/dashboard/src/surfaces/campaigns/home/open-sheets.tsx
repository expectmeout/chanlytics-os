/**
 * The sheets Campaigns opens over Sequences (sheets.tsx), drawn while the address names one: a message in its drawer and
 * the composer, and a change that lands on its sequence's record. A chunk of its own (campaigns-code.tsx): the composer is
 * made of Sent's send screen and the drawer of the Library's pane, and a landing on Sequences draws neither, so neither
 * waits at its press. What the sheets draw is read only while one of them stands: Sequences reads its own.
 */
import { useEffect } from "react";
import { chainOfMoment, sequenceRoute } from "@chanlytics/contracts";
import { replaceRoute } from "../../legacy-verbs";
import type { useLegacyToast } from "../../legacy-verbs";
import { composeRoute } from "./address";
import type { HomeAddress } from "./address";
import { MessageDrawer } from "./message-drawer";
import { NewMessage } from "./new-message";
import { useChains, useComposerData, useHomeNav } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** A change the address names: the sequence, on its own record (a reach-out's by its root). */
function LandsOnItsSequence({ id }: { id: string }) {
  useEffect(() => replaceRoute(sequenceRoute(id)), [id]);
  return null;
}

/** The sheets: the message's drawer and the composer; a change lands on its sequence's record. */
export function OpenSheets({ address, flash }: { address: HomeAddress; flash: Flash }) {
  const { broadcasts } = useComposerData(address.compose !== null);
  const chains = useChains();
  const nav = useHomeNav(address);
  // A change lands on its sequence's record, a reach-out's by its root from any of its steps (contracts chainOfMoment),
  // once the reach-outs are read; where they could not be, on the id as named, never a page left blank.
  const changing = address.compose?.mode === "change" ? address.compose.root : null;
  const chain = changing && Array.isArray(chains) ? chainOfMoment(chains, changing) : null;
  const landOn = changing === null || chains === undefined ? null : (chain?.root_id ?? changing);
  return (
    <>
      <MessageDrawer name={address.message} flash={flash} onClose={nav.close} />
      {landOn ? <LandsOnItsSequence id={landOn} /> : null}
      <NewMessage
        compose={changing !== null ? null : address.compose}
        broadcasts={broadcasts}
        chains={chains}
        flash={flash}
        onClose={nav.close}
        onYes={nav.swap}
        onKind={(mode) => nav.swap(composeRoute(mode))}
      />
    </>
  );
}
