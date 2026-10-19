/**
 * Campaigns' retired home addresses (`campaigns/<param>`), beside Sequences' own (contracts sequence-address.ts): the home
 * went in decision 0060's S6, and its addresses are read here so a link kept from before still says what it named as it
 * lands (contracts retiredRouteOf, the one table of retired addresses).
 *
 *   campaigns                        the home: lands on Sequences
 *   campaigns/in:<group>             the ledger narrowed to one group (`before`, `lists`, `reach_out`, `sent_once`): the same
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer: lands on its sequence
 *   campaigns/moment:<id>:people     a reach-out open at who is in it (00426): lands on its sequence's People
 *   campaigns/message:<name>         a message's drawer over Sequences: lands on its home, the Library open on it
 *                                    (`campaigns/messages/<name>`, contracts messageRoute)
 *
 * The composer (`campaigns/new`, `new:to:<audience>`, `new:leads`) went into the one New (the Campaigns wiring review's
 * lane 6), and a reach-out's change (`new:edit:<root>`) is its sequence's record; its Every time (`new:every`,
 * `new:moment:<trigger>`) went before (the closed-loop audit of 17 Oct 2026, G). Each lands on New, for whom or on the
 * moment it named, or on the record (contracts retiredRouteOf). A word the page does not know is the home, so it lands on
 * Sequences (a link must never land on nothing).
 */

/** What a retired address named: the group its ledger showed, a moment open, a message's drawer. */
interface HomeAddress {
  /** The group the ledger shows alone, or null for every group. */
  group: string | null;
  /** The playbook or reach-out open in the drawer. */
  moment: string | null;
  /** The part of the drawer the address opens at: a reach-out's People (`moment:<id>:people`); absent at its top. */
  part?: "people";
  /** A message open in the drawer over Sequences that went, by its name: the message, read as its home. */
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
