/**
 * One line a Connections row says beside its sentence: what Meta will ask before Connect, what WhatsApp costs, what Meta holds
 * about a connected number, the codes sent to the line. Plain words and, where there is somewhere to go, one link after them
 * (Meta's prices, Meta's page for adding a payment method): an external address, which the page opens in a new tab.
 */
export interface ConnectionNote {
  text: string;
  link?: { label: string; href: string };
  /**
   * About something that happened or waits on the owner (a sign-up that could not go on, a code just sent, a name Meta
   * declined): the row says it itself, always. A note without it is explanation (what Meta will ask, what WhatsApp
   * costs), which the row keeps behind the press beside its name.
   */
  live?: true;
}
