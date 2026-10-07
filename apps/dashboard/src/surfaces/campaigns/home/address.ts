/**
 * Campaigns' home addresses (`campaigns/<param>`): the page, a moment open beside it, and the composer.
 *
 *   campaigns                        the home
 *   campaigns/moment:<id>            a playbook (or a reach-out) open in the drawer, the address every old `outbound/<id>` lands on
 *   campaigns/new                    the composer, on Send once
 *   campaigns/new:to:<audience>      the same, on the list or audience it was asked for (every old `broadcasts/<audience>` lands here)
 *   campaigns/new:every              the composer, on Every time a moment comes
 *   campaigns/new:moment:<trigger>   the same, on the moment a Turn on was pressed for
 *   campaigns/new:edit:<id>          the same, changing the playbook the drawer showed; a reach-out's id opens its own sheet
 *
 * The drawer and the composer are the address's, as the Inbox's thread is: opened by the page, pushed so Back closes it;
 * arrived at by a link, replaced when closed. A composer opened over a drawer is pushed over it, so Back, and Cancel, return to
 * the detail it came from. A word the page does not know is the home (a link must never land on nothing).
 */

/** What the address asks of the page: a moment open, and the composer. */
export interface HomeAddress {
  /** The playbook or reach-out open in the drawer. */
  moment: string | null;
  /**
   * The composer: Send once (on the audience asked for, or the one it opens on), or Every time a moment comes, on a moment,
   * or changing one.
   */
  compose: null | { mode: "once"; to: string | null } | { mode: "every"; moment: string | null; edit: string | null };
}

/** The home itself. */
export const HOME_ROUTE = "campaigns";

const NONE: HomeAddress = { moment: null, compose: null };

/** What an address's param says (`campaigns/<param>`, the part after the slash, or null for the home). */
export function parseHome(param: string | null): HomeAddress {
  if (!param) return NONE;
  if (param.startsWith("moment:")) {
    const id = param.slice("moment:".length);
    return id ? { moment: id, compose: null } : NONE;
  }
  if (param === "new") return { moment: null, compose: { mode: "once", to: null } };
  if (param.startsWith("new:to:")) {
    const to = param.slice("new:to:".length);
    return { moment: null, compose: { mode: "once", to: to || null } };
  }
  if (param === "new:every") return { moment: null, compose: { mode: "every", moment: null, edit: null } };
  if (param.startsWith("new:moment:")) {
    const moment = param.slice("new:moment:".length);
    return { moment: null, compose: { mode: "every", moment: moment || null, edit: null } };
  }
  if (param.startsWith("new:edit:")) {
    const edit = param.slice("new:edit:".length);
    return edit ? { moment: null, compose: { mode: "every", moment: null, edit } } : NONE;
  }
  return NONE;
}

/** The route an address is spelled as: the shell's, `campaigns/moment:<id>`. */
function homeRoute(a: HomeAddress): string {
  if (a.moment) return `${HOME_ROUTE}/moment:${a.moment}`;
  const c = a.compose;
  if (!c) return HOME_ROUTE;
  if (c.mode === "once") return c.to ? `${HOME_ROUTE}/new:to:${c.to}` : `${HOME_ROUTE}/new`;
  if (c.edit) return `${HOME_ROUTE}/new:edit:${c.edit}`;
  return c.moment ? `${HOME_ROUTE}/new:moment:${c.moment}` : `${HOME_ROUTE}/new:every`;
}

/** A moment open in the drawer. */
export const momentRoute = (id: string): string => homeRoute({ moment: id, compose: null });

/** What the composer is opened on: the audience a send is for, the moment a Turn on was pressed for, the playbook being changed. */
interface ComposeOn {
  to?: string | null;
  moment?: string | null;
  edit?: string | null;
}

/** The composer on a mode: Send once (on an audience), or Every time a moment comes, on a moment or changing one. */
export const composeRoute = (mode: "once" | "every", on: ComposeOn = {}): string =>
  homeRoute({
    moment: null,
    compose: mode === "once" ? { mode, to: on.to ?? null } : { mode, moment: on.moment ?? null, edit: on.edit ?? null },
  });
