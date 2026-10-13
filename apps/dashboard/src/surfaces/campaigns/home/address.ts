/**
 * Campaigns' home addresses (`campaigns/<param>`): the page, the group its ledger shows, a moment open beside it, and the
 * composer.
 *
 *   campaigns                        the home, every group
 *   campaigns/in:<group>             the ledger narrowed to one group: a journey stage's word-free id (`before`), `lists`,
 *                                    `reach_out` or `sent_once` (decision 46); a card's press or a phone's chip replaces it
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer, the address every old `outbound/<id>` lands on
 *   campaigns/moment:<id>:people     a reach-out open at who is in it (00426): where Today, the bell and Leads link
 *   campaigns/message:<name>         a message open in a drawer of its own, by its name (the call's text; a playbook's message)
 *   campaigns/new                    the composer, on Send once
 *   campaigns/new:to:<audience>      the same, on the list or audience it was asked for (every old `broadcasts/<audience>` lands here)
 *   campaigns/new:every              the composer, on Every time a moment comes
 *   campaigns/new:leads              the composer, on Write to leads: where a reach-out starts (00426)
 *   campaigns/new:moment:<trigger>   the same, on the moment a Turn on was pressed for
 *   campaigns/new:edit:<id>          the same, changing the playbook the drawer showed; a reach-out's id opens its own sheet
 *
 * The drawer and the composer are the address's, as the Inbox's thread is: opened by the page, pushed so Back closes it;
 * arrived at by a link, replaced when closed. A composer opened over a drawer is pushed over it, so Back, and Cancel, return to
 * the detail it came from. The group is replaced, never pushed (decision 11), and one param holds either it or a sheet, so
 * while a sheet stands the page keeps the group it had (use-home.ts useKeptGroup). A word the page does not know is the
 * home (a link must never land on nothing).
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
  /**
   * The composer: Send once (on the audience asked for, or the one it opens on), or Every time a moment comes, on a moment,
   * or changing one.
   */
  compose:
    | null
    | { mode: "once"; to: string | null }
    | { mode: "every"; moment: string | null; edit: string | null }
    | { mode: "leads" };
}

/** The home itself. Read here alone: use-home.ts closes to `groupRoute(null)`, so an export would be a dead one. */
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
  if (param === "new:every") return { mode: "every", moment: null, edit: null };
  if (param === "new:leads") return { mode: "leads" };
  if (param.startsWith("new:moment:")) {
    const moment = param.slice("new:moment:".length);
    return { mode: "every", moment: moment || null, edit: null };
  }
  if (param.startsWith("new:edit:")) {
    const edit = param.slice("new:edit:".length);
    return edit ? { mode: "every", moment: null, edit } : undefined;
  }
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

/** The route an address is spelled as: the shell's, `campaigns/moment:<id>`. */
function homeRoute(a: HomeAddress): string {
  if (a.moment) return `${HOME_ROUTE}/moment:${a.moment}${a.part ? `:${a.part}` : ""}`;
  if (a.message) return `${HOME_ROUTE}/message:${a.message}`;
  const c = a.compose;
  if (!c) return a.group ? `${HOME_ROUTE}/in:${a.group}` : HOME_ROUTE;
  if (c.mode === "once") return c.to ? `${HOME_ROUTE}/new:to:${c.to}` : `${HOME_ROUTE}/new`;
  if (c.mode === "leads") return `${HOME_ROUTE}/new:leads`;
  if (c.edit) return `${HOME_ROUTE}/new:edit:${c.edit}`;
  return c.moment ? `${HOME_ROUTE}/new:moment:${c.moment}` : `${HOME_ROUTE}/new:every`;
}

/** A moment open in the drawer. */
export const momentRoute = (id: string): string => homeRoute({ ...NONE, moment: id });

/** A message open in its own drawer, by its name. */
export const messageRoute = (name: string): string => homeRoute({ ...NONE, message: name });

/** The ledger narrowed to one group, or every group for null: what a card's press and a phone's chip replace the address with. */
export const groupRoute = (group: string | null): string => homeRoute({ ...NONE, group });

/** What the composer is opened on: the audience a send is for, the moment a Turn on was pressed for, the playbook being changed. */
interface ComposeOn {
  to?: string | null;
  moment?: string | null;
  edit?: string | null;
}

/**
 * The composer on a mode: Send once (on an audience), Every time a moment comes (on a moment, or changing one), or Write
 * to leads.
 */
export const composeRoute = (mode: "once" | "every" | "leads", on: ComposeOn = {}): string =>
  homeRoute({
    ...NONE,
    compose:
      mode === "once"
        ? { mode, to: on.to ?? null }
        : mode === "leads"
          ? { mode }
          : { mode, moment: on.moment ?? null, edit: on.edit ?? null },
  });
