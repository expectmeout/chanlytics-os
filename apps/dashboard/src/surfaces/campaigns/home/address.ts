/**
 * Campaigns' addresses (`campaigns/<param>`) beside Sequences' own (contracts sequence-address.ts): the sheets Campaigns opens
 * over Sequences (home/sheets.tsx), and the home's addresses, which went with it in decision 0060's S6 and are read here so a
 * link kept from before still says what it named (surfaces/addresses.ts) as it lands on Sequences (contracts
 * sequenceLandingOf).
 *
 *   campaigns                        the home: lands on Sequences
 *   campaigns/in:<group>             the ledger narrowed to one group (`before`, `lists`, `reach_out`, `sent_once`): the same
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer: lands on its sequence
 *   campaigns/moment:<id>:people     a reach-out open at who is in it (00426): lands on its sequence's People
 *   campaigns/message:<name>         a message open in a drawer of its own, by its name (the call's text; a playbook's message)
 *   campaigns/new                    the composer, on Send once
 *   campaigns/new:to:<audience>      the same, on the list or audience it was asked for (every old `broadcasts/<audience>` lands here)
 *   campaigns/new:leads              the composer, on Write to leads: where a reach-out starts (00426)
 *
 * The composer's Every time (`new:every`, `new:moment:<trigger>`, `new:edit:<id>`) went (the closed-loop audit of 17 Oct
 * 2026, G): those addresses land on New sequence, on that moment, or on the sequence (contracts sequenceLandingOf).
 *
 * A message's drawer and the composer are the address's, as the Inbox's thread is: opened by the page, pushed so Back closes
 * it; arrived at by a link, replaced with Sequences when closed. A composer opened over a drawer is pushed over it, so Back,
 * and Cancel, return to the drawer it came from. A word the page does not know is the home, so it lands on Sequences (a link
 * must never land on nothing).
 */

/** What the address asks of the page: the group its ledger shows, a moment open, and the composer. */
export interface HomeAddress {
  /** The group the ledger shows alone, or null for every group. */
  group: string | null;
  /** The playbook or reach-out open in the drawer. */
  moment: string | null;
  /** The part of the drawer the address opens at: a reach-out's People (`moment:<id>:people`); absent at its top. */
  part?: "people";
  /** A message open in a drawer of its own, by its name: read and changed there, over the home (Ruben, 11 Oct 2026). */
  message: string | null;
  /** The composer: Send once (on the audience asked for, or the one it opens on), or Write to leads. */
  compose: null | { mode: "once"; to: string | null } | { mode: "leads" };
}

/** Campaigns' own route, which every address here is spelled under. */
const HOME_ROUTE = "campaigns";

const NONE: HomeAddress = { group: null, moment: null, message: null, compose: null };

/** A group's id as an address writes it: word-free, lower case, words joined by underscores (`before`, `reach_out`). */
const GROUP_ID = /^[a-z]+(?:_[a-z]+)*$/;

/** The composer an address names, or undefined where it names none. */
function composeOf(param: string): HomeAddress["compose"] | undefined {
  if (param === "new") return { mode: "once", to: null };
  if (param.startsWith("new:to:")) {
    const to = param.slice("new:to:".length);
    return { mode: "once", to: to || null };
  }
  if (param === "new:leads") return { mode: "leads" };
  return undefined;
}

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
  const compose = composeOf(param);
  return compose ? { ...NONE, compose } : NONE;
}

/** The route a composer is spelled as: the shell's, `campaigns/new…`. */
function composerRoute(c: NonNullable<HomeAddress["compose"]>): string {
  if (c.mode === "once") return c.to ? `${HOME_ROUTE}/new:to:${c.to}` : `${HOME_ROUTE}/new`;
  return `${HOME_ROUTE}/new:leads`;
}

/** The composer on a mode: Send once (on an audience a send is for), or Write to leads. */
export const composeRoute = (mode: "once" | "leads", on: { to?: string | null } = {}): string =>
  composerRoute(mode === "once" ? { mode, to: on.to ?? null } : { mode });
