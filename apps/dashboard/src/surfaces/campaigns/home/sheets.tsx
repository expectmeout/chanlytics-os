/**
 * What Campaigns opens over Sequences (decision 0060, S6): the home's own page went, its ledger, rail and tiles with it,
 * and the sheet it opened stays at its own address (address.ts): a message in a drawer of its own
 * (`campaigns/message:<name>`). It is the address's as it was: a press pushes it, so Back and Cancel close it onto the page
 * it was opened from; a link that arrived at it is replaced by Sequences when it closes. The composer that stood here too
 * went into the one New (the Campaigns wiring review's lane 6: home/new-message.tsx), and every sequence is changed on its
 * record, so their addresses land there (contracts retiredRouteOf).
 *
 * The drawer is a chunk of its own (open-sheets.tsx, campaigns-code.tsx), fetched as it is opened or a door to it is
 * reached for, so Campaigns' page carries none of the Library's pane. Its toast is the route's (route-toast.ts).
 */
import type { useLegacyToast } from "../../legacy-verbs";
import { parseHome } from "./address";
import { useOpenSheets } from "./campaigns-code";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** Campaigns' sheet over Sequences: nothing while the address names none. */
export function CampaignsSheets({ param, flash }: { param: string | null; flash: Flash }) {
  const address = parseHome(param);
  const named = address.message !== null;
  // The sheet slides in once its chunk is in: nothing stands in its place before it, as nothing did before a press.
  const OpenSheets = useOpenSheets(named);
  return named && OpenSheets ? <OpenSheets address={address} flash={flash} /> : null;
}
