/**
 * What Campaigns opens over Sequences (decision 0060, S6): the home's own page went, its ledger, rail and tiles with it,
 * and the sheets it opened stay, each at its own address (address.ts): the composer (`campaigns/new…`: Send once and Write
 * to leads) and a message in a drawer of its own (`campaigns/message:<name>`). Each is the address's as it was: a press
 * pushes it, so Back and Cancel close it onto the page it was opened from; a link that arrived at it is replaced by
 * Sequences when it closes. Every sequence is changed on its record (the closed-loop audit of 17 Oct 2026, G; the
 * lead-to-sequence canvas, 18 Oct 2026: a sequence to leads too), so a change's address lands there.
 *
 * The sheets themselves are a chunk of their own (open-sheets.tsx, campaigns-code.tsx), fetched as one is opened or a door
 * to one is reached for, so Campaigns' page carries none of Sent's send screen or the Library's pane. The toast host stays
 * here, on the route's mount: what a send says outlives the sheet that closed over it.
 */
import { useLegacyToast } from "../../legacy-verbs";
import { parseHome } from "./address";
import type { HomeAddress } from "./address";
import { useOpenSheets } from "./campaigns-code";

/** Whether the address names a sheet: the composer or a message. */
const namesSheet = (a: HomeAddress) => a.compose !== null || a.message !== null;

/** Campaigns' sheets over Sequences: nothing while the address names none. */
export function CampaignsSheets({ param }: { param: string | null }) {
  const address = parseHome(param);
  const [toastNode, flash] = useLegacyToast();
  const named = namesSheet(address);
  // The sheet slides in once its chunk is in: nothing stands in its place before it, as nothing did before a press.
  const OpenSheets = useOpenSheets(named);
  return (
    <>
      {named && OpenSheets ? <OpenSheets address={address} flash={flash} /> : null}
      {toastNode}
    </>
  );
}
