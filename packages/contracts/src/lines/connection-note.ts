/**
 * One line a Connections row says beside its sentence: what Meta will ask before Connect, what WhatsApp costs, what Meta holds
 * about a connected number, the codes sent to the line. Plain words and, where there is somewhere to go, one link after them
 * (Meta's prices, Meta's page for adding a payment method): an external address, which the page opens in a new tab.
 */
export interface ConnectionNote {
  text: string;
  link?: { label: string; href: string };
}
