/**
 * What Campaigns opens over Sequences (decision 0060, S6): the home's own page went, its ledger, rail and tiles with it,
 * and the sheets it opened stay, each at its own address (address.ts): the composer (`campaigns/new…`: Send once and Write
 * to leads), a message in a drawer of its own (`campaigns/message:<name>`), and a reach-out's sheet (Write to leads once
 * its search is chosen). Each is the address's as it was: a press pushes it, so Back and Cancel close it onto the page it
 * was opened from; a link that arrived at it is replaced by Sequences when it closes. A moment's sequence is made in New
 * sequence and changed on its record (the closed-loop audit of 17 Oct 2026, G): the composer's Every time went.
 *
 * What the sheets draw is read only while one of them stands: Sequences reads its own.
 */
import { useState } from "react";
import { useLegacyToast } from "../../legacy-verbs";
import { ReachOutSheet } from "../reach-out/sheet";
import type { ReachOutStart } from "../reach-out/sources";
import { composeRoute, parseHome } from "./address";
import type { HomeAddress } from "./address";
import { MessageDrawer } from "./message-drawer";
import { NewMessage } from "./new-message";
import { useComposerData, useHomeNav } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** Whether the address names a sheet: the composer or a message. */
const namesSheet = (a: HomeAddress) => a.compose !== null || a.message !== null;

/** The sheets: the message's drawer, the reach-out a search started, and the composer. */
function OpenSheets({
  address,
  starting,
  setStarting,
  flash,
}: {
  address: HomeAddress;
  starting: ReachOutStart | null;
  setStarting: (start: ReachOutStart | null) => void;
  flash: Flash;
}) {
  const { broadcasts } = useComposerData(address.compose !== null);
  const nav = useHomeNav(address);
  return (
    <>
      <MessageDrawer name={address.message} flash={flash} onClose={nav.close} />
      {starting && address.compose === null ? (
        <ReachOutSheet
          key={starting.search.id}
          search={starting.search}
          includeUnconfirmed={starting.includeUnconfirmed}
          onClose={() => setStarting(null)}
        />
      ) : null}
      <NewMessage
        compose={address.compose}
        broadcasts={broadcasts}
        flash={flash}
        onClose={nav.close}
        onYes={nav.swap}
        onKind={(mode) => nav.swap(composeRoute(mode))}
        onWrite={(start) => {
          setStarting(start);
          nav.close();
        }}
      />
    </>
  );
}

/** Campaigns' sheets over Sequences: nothing while the address names none and no reach-out is being started. */
export function CampaignsSheets({ param }: { param: string | null }) {
  const address = parseHome(param);
  const [toastNode, flash] = useLegacyToast();
  // A reach-out started from Write to leads: its search, handed over as the composer closes, and its sheet drawn here once
  // the address no longer names the composer.
  const [starting, setStarting] = useState<ReachOutStart | null>(null);
  return (
    <>
      {namesSheet(address) || starting ? (
        <OpenSheets address={address} starting={starting} setStarting={setStarting} flash={flash} />
      ) : null}
      {toastNode}
    </>
  );
}
