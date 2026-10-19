/**
 * The sheet Campaigns opens over Sequences (sheets.tsx), drawn while the address names it: a message in its drawer. A
 * chunk of its own (campaigns-code.tsx): the drawer is made of the Library's pane, and a landing on Sequences draws none
 * of it, so none of it waits at its press. The composer and a change to a reach-out stood here too: the one New draws the
 * composer's parts (the Campaigns wiring review's lane 6), and a change lands on its sequence's record (contracts
 * retiredRouteOf).
 */
import type { useLegacyToast } from "../../legacy-verbs";
import type { HomeAddress } from "./address";
import { MessageDrawer } from "./message-drawer";
import { useHomeNav } from "./use-home";

type Flash = ReturnType<typeof useLegacyToast>[1];

/** The message's drawer. */
export function OpenSheets({ address, flash }: { address: HomeAddress; flash: Flash }) {
  const nav = useHomeNav(address);
  return <MessageDrawer name={address.message} flash={flash} onClose={nav.close} />;
}
