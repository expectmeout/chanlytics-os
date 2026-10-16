/**
 * What Campaigns opens over Sequences (decision 0060, S6): the home's own page went, its ledger, rail and tiles with it,
 * and the sheets it opened stay, each at its own address (address.ts): the composer (`campaigns/new…`: Send once, Every
 * time a moment comes, Write to leads, a change to a playbook), a message in a drawer of its own
 * (`campaigns/message:<name>`), and a reach-out's sheet (a chain's change; Write to leads once its search is chosen). Each
 * is the address's as it was: a press pushes it, so Back and Cancel close it onto the page it was opened from; a link that
 * arrived at it is replaced by Sequences when it closes. A campaign made or changed opens its sequence, where its steps,
 * people and history now are.
 *
 * The campaigns' surfaces are read only while one of these stands: Sequences reads its own.
 */
import { useState } from "react";
import { LIFECYCLE_TOAST, sequenceRoute } from "@chanlytics/contracts";
import { replaceRoute, useLegacyToast } from "../../legacy-verbs";
import { ReachOutSheet } from "../reach-out/sheet";
import type { ReachOutStart } from "../reach-out/sources";
import { composeRoute, parseHome } from "./address";
import type { HomeAddress } from "./address";
import { MessageDrawer } from "./message-drawer";
import { NewMessage } from "./new-message";
import { SentenceParts } from "./sentence";
import { useHomeData, useHomeNav } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** Whether the address names a sheet: the composer or a message. A chain's change is the composer's address. */
const namesSheet = (a: HomeAddress) => a.compose !== null || a.message !== null;

/** The sheets, once the campaigns' surfaces they are made of are read. */
function OpenSheets({
  address,
  starting,
  setStarting,
  flash,
  nowMs,
}: {
  address: HomeAddress;
  starting: ReachOutStart | null;
  setStarting: (start: ReachOutStart | null) => void;
  flash: Flash;
  nowMs?: number;
}) {
  const { playbooks, broadcasts, reachOuts, home } = useHomeData(nowMs);
  const nav = useHomeNav(address);
  if (!playbooks) return null;
  // A reach-out's change is its own sheet (the record sheet), so the address that names one opens that sheet in the
  // composer's place.
  const changing = address.compose && address.compose.mode === "every" ? address.compose.edit : null;
  const chain = changing && Array.isArray(reachOuts) ? (reachOuts.find((c) => c.root_id === changing) ?? null) : null;
  return (
    <>
      <MessageDrawer name={address.message} flash={flash} onClose={nav.close} />
      {chain && chain.search ? (
        <ReachOutSheet key={chain.root_id} search={chain.search} chain={chain} onClose={nav.close} onGo={nav.swap} />
      ) : null}
      {starting && address.compose === null ? (
        <ReachOutSheet
          key={starting.search.id}
          search={starting.search}
          includeUnconfirmed={starting.includeUnconfirmed}
          onClose={() => setStarting(null)}
        />
      ) : null}
      <NewMessage
        compose={chain ? null : address.compose}
        home={home}
        playbooks={playbooks}
        broadcasts={broadcasts}
        reachOuts={reachOuts}
        flash={flash}
        onClose={nav.close}
        onYes={nav.swap}
        onKind={(mode) => nav.swap(composeRoute(mode))}
        onSaved={(d, changed) => {
          const name = d.name ?? LIFECYCLE_TOAST.nameless;
          flash({
            msg: <SentenceParts parts={changed ? LIFECYCLE_TOAST.changed(name) : LIFECYCLE_TOAST.running(name)} />,
          });
          // The campaign is a sequence (its first step's id is the sequence's): its record, in the composer's place.
          if (d.id) replaceRoute(sequenceRoute(d.id));
          else nav.close();
        }}
        onWrite={(start) => {
          setStarting(start);
          nav.close();
        }}
      />
    </>
  );
}

/**
 * Campaigns' sheets over Sequences: nothing while the address names none and no reach-out is being started. `nowMs` is the
 * clock its campaigns are read at, for a test; the moment it draws otherwise.
 */
export function CampaignsSheets({ param, nowMs }: { param: string | null; nowMs?: number }) {
  const address = parseHome(param);
  const [toastNode, flash] = useLegacyToast();
  // A reach-out started from Write to leads: its search, handed over as the composer closes, and its sheet drawn here once
  // the address no longer names the composer.
  const [starting, setStarting] = useState<ReachOutStart | null>(null);
  return (
    <>
      {namesSheet(address) || starting ? (
        <OpenSheets address={address} starting={starting} setStarting={setStarting} flash={flash} nowMs={nowMs} />
      ) : null}
      {toastNode}
    </>
  );
}
