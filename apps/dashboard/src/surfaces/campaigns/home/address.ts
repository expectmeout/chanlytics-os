/**
 * Campaigns' addresses (`campaigns/<param>`) beside Sequences' own (contracts sequence-address.ts): the sheets Campaigns opens
 * over Sequences (home/sheets.tsx), and the home's addresses, which went with it in decision 0060's S6 and are read here so a
 * link kept from before still says what it named as it lands on Sequences (contracts retiredRouteOf, the one table of
 * retired addresses).
 *
 *   campaigns                        the home: lands on Sequences
 *   campaigns/in:<group>             the ledger narrowed to one group (`before`, `lists`, `reach_out`, `sent_once`): the same
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer: lands on its sequence
 *   campaigns/moment:<id>:people     a reach-out open at who is in it (00426): lands on its sequence's People
 *   campaigns/message:<name>         a message open in a drawer of its own, by its name (the call's text; a playbook's message)
 *
 * The composer (`campaigns/new`, `new:to:<audience>`, `new:leads`) went into the one New (the Campaigns wiring review's
 * lane 6), and a reach-out's change (`new:edit:<root>`) is its sequence's record; its Every time (`new:every`,
 * `new:moment:<trigger>`) went before (the closed-loop audit of 17 Oct 2026, G). Each lands on New, for whom or on the
 * moment it named, or on the record (contracts retiredRouteOf).
 *
 * A message's drawer is the address's, as the Inbox's thread is: opened by the page, pushed so Back closes it; arrived at by
 * a link, replaced with Sequences when closed. A word the page does not know is the home, so it lands on Sequences (a link
 * must never land on nothing).
 */

/** What the address asks of the page: the group its ledger shows, a moment open, and a message's drawer. */
export interface HomeAddress {
  /** The group the ledger shows alone, or null for every group. */
  group: string | null;
  /** The playbook or reach-out open in the drawer. */
  moment: string | null;
  /** The part of the drawer the address opens at: a reach-out's People (`moment:<id>:people`); absent at its top. */
  part?: "people";
  /** A message open in a drawer of its own, by its name: read and changed there, over the home (Ruben, 11 Oct 2026). */
  message: string | null;
}

const NONE: HomeAddress = { group: null, moment: null, message: null };

/** A group's id as an address writes it: word-free, lower case, words joined by underscores (`before`, `reach_out`). */
const GROUP_ID = /^[a-z]+(?:_[a-z]+)*$/;

/** What an address's param says (`campaigns/<param>`, the part after the slash, or null for the home). */
export function parseHome(param: string | null): HomeAddress {
  if (!param) return NONE;
  if (param.startsWith("in:")) {
    const group = param.slice("in:".length);
    return GROUP_ID.test(group) ? { ...NONE, group } : NONE;
  }
  if (param.startsWith("moment:")) {
    const [id = "", part] = param.slice("moment:".length).split(":");
    if (!id) return NONE;
    return part === "people" ? { ...NONE, moment: id, part } : { ...NONE, moment: id };
  }
  if (param.startsWith("message:")) {
    const name = param.slice("message:".length);
    return name ? { ...NONE, message: name } : NONE;
  }
  return NONE;
}
