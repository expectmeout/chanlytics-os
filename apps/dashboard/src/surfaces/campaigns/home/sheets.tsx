/**
 * What Campaigns opens over Sequences (decision 0060, S6): the home's own page went, its ledger, rail and tiles with it,
 * and the sheets it opened stay, each at its own address (address.ts): the composer (`campaigns/new…`: Send once and Write
 * to leads) and a message in a drawer of its own (`campaigns/message:<name>`). Each is the address's as it was: a press
 * pushes it, so Back and Cancel close it onto the page it was opened from; a link that arrived at it is replaced by
 * Sequences when it closes. Every sequence is changed on its record (the closed-loop audit of 17 Oct 2026, G; the
 * lead-to-sequence canvas, 18 Oct 2026: a sequence to leads too), so a change's address lands there.
 *
 * What the sheets draw is read only while one of them stands: Sequences reads its own.
 */
import { useEffect } from "react";
import { chainOfMoment, sequenceRoute } from "@chanlytics/contracts";
import { replaceRoute, useLegacyToast } from "../../legacy-verbs";
import { composeRoute, parseHome } from "./address";
import type { HomeAddress } from "./address";
import { MessageDrawer } from "./message-drawer";
import { NewMessage } from "./new-message";
import { useChains, useComposerData, useHomeNav } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** Whether the address names a sheet: the composer or a message. */
const namesSheet = (a: HomeAddress) => a.compose !== null || a.message !== null;

/** A change the address names: the sequence, on its own record (a reach-out's by its root). */
function LandsOnItsSequence({ id }: { id: string }) {
  useEffect(() => replaceRoute(sequenceRoute(id)), [id]);
  return null;
}

/** The sheets: the message's drawer and the composer; a change lands on its sequence's record. */
function OpenSheets({ address, flash }: { address: HomeAddress; flash: Flash }) {
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

/** Campaigns' sheets over Sequences: nothing while the address names none. */
export function CampaignsSheets({ param }: { param: string | null }) {
  const address = parseHome(param);
  const [toastNode, flash] = useLegacyToast();
  return (
    <>
      {namesSheet(address) ? <OpenSheets address={address} flash={flash} /> : null}
      {toastNode}
    </>
  );
}
