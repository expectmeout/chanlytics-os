/**
 * Who a broadcast is for: the audience kinds, who on it may receive, and the preview before sending. Moved whole from
 * broadcasts.ts (Reach out Part 2.5), which re-exports it.
 */
import { type AskedPurpose, mayMessageFor, PURPOSE_REFUSALS } from "./consent";
import { PEOPLE_LISTS } from "./lists";
import { mayReceive, type PersonRowVM, saidYesTo } from "./people";
import type { RunReach } from "./playbooks";
import { firstNameOf } from "./templates";

export type AudienceKind = "everyone" | "list" | "saved" | "playbook";

/** The kinds a person may pick; "playbook" is the sweep's own. */
export const AUDIENCE_KINDS: readonly AudienceKind[] = ["everyone", "list", "saved"];

export interface Audience {
  kind: AudienceKind;
  /** A People list id (kind "list") or a saved list id (kind "saved"). */
  id: string | null;
  label: string;
  /**
   * A playbook's run: who its moment named and why each of the rest was left
   * out (contracts playbookRunReach), kept by the run as it was drawn. Absent
   * on a broadcast a person sent, and on a run made before runs kept it.
   */
  reach?: RunReach;
  /**
   * The list it went to, as it was counted (decision 0009, "sends remember"): its token, and its rule then -- null for
   * a list kept by hand, whose people are the recipients -- so a rule edited later never changes what a send meant.
   * Absent on everyone, and on a send made before sends kept it.
   */
  list?: { token: string; rule: unknown; counted_at: string };
}

/**
 * The audience of everyone in People, named for its pool as every other audience is ("Regulars", "Lapsed"); its
 * count is who the message reaches, and the lines under it say who said yes. It was "Everyone who said yes", which
 * beside a reach of 0 claimed nobody had, over "1 person on it said yes to offers, with no number to send to". A run
 * keeps the label it was sent under.
 */
export const EVERYONE_LABEL = "Everyone";

/**
 * The people a broadcast may reach: the audience crossed with mayReceive.
 * The route enrols exactly these; the page shows exactly these counts.
 *
 * The purpose is required here for the same reason it is required above -- and
 * because this is the function every caller actually reaches for.
 */
export function eligibleFor(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  /** What kind of message this audience is for. From the template's category, never assumed. */
  purpose: AskedPurpose,
): PersonRowVM[] {
  return audienceMembers(rows, kind, id, savedIds).filter((r) => mayReceive(r, purpose));
}

/**
 * Everyone an audience names, before anyone is left out: a list's members, a
 * saved list's people, or everyone. `eligibleFor` is these, crossed with who
 * may receive -- and a run that says who it left out counts from here.
 */
export function audienceMembers(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
): PersonRowVM[] {
  if (kind === "list") {
    const l = PEOPLE_LISTS.find((x) => x.id === id);
    return l ? rows.filter(l.test) : [];
  }
  if (kind === "saved") return savedIds ? rows.filter((r) => savedIds.has(r.id)) : [];
  return rows;
}

/**
 * A few of the people an audience really means, for a preview to walk through.
 *
 * An audience chip showed a count and nothing else, so the last thing an owner
 * saw before an irreversible send was a number: no way to see who the twenty-
 * three are, and no way to find out that three of them have no first name on
 * file and will be greeted "Hi there" (resolveParams, templates.ts). The rows
 * are already in hand -- the count is a length of exactly this list -- so this
 * takes the same pool and names a handful of it.
 *
 * The order is not the list's: an ordinary person first, then the first person
 * with no name on file if there is one, because that is the case nobody has
 * ever been shown and the one worth seeing. Anyone held back comes last, with
 * the reason in the operator's own words.
 */
export interface PreviewPerson {
  id: string;
  /** What the operator calls them: their name, or the number on file. */
  label: string;
  /** The words the wire puts in a first-name slot, or null when nothing is on file. */
  firstName: string | null;
  /** Why nothing is sent to them, in the operator's words; null when it is. */
  refusal: string | null;
}

export interface AudiencePreview {
  people: PreviewPerson[];
  /** How many the send really reaches, and how many in the list it does not. */
  sending: number;
  held: number;
  /**
   * How many in the list said yes to what this message needs, a number to send it to or not: `sending` is those
   * with one. When nobody can be sent it, this tells the two causes apart -- nobody said yes (get their yes), or the
   * ones who did have no number, whom a door to "get their yes" would ask for an answer they gave (#663's rule).
   */
  saidYes: number;
  /**
   * How many of those it reaches heard from a playbook or a broadcast within the week (the touches a playbook's run
   * waits a week after, PLAYBOOK_BREATH_MS): a send by hand is not held back by them, and the owner is told before it
   * goes, not after.
   */
  heard: number;
}

/** The composer's note when some of an audience heard from a run this week; null when none did. */
export function heardWords(n: number): string | null {
  if (n <= 0) return null;
  return `${n === 1 ? "One" : n} of them heard from a playbook or a broadcast this week.`;
}

function previewPerson(r: PersonRowVM, refusal: string | null): PreviewPerson {
  return { id: r.id, label: r.name, firstName: firstNameOf(r.givenName, r.waName), refusal };
}

/** Nobody touched: an audience read with no touches in hand. */
const NO_ONE: ReadonlySet<string> = new Set();

export function audiencePreview(
  rows: PersonRowVM[],
  kind: AudienceKind,
  id: string | null | undefined,
  savedIds: ReadonlySet<string> | null,
  purpose: AskedPurpose,
  limit = 5,
  /** Who a run of any kind reached within the week (packages/db touchesSince); none when not read. */
  touched: ReadonlySet<string> = NO_ONE,
): AudiencePreview {
  const pool = audienceMembers(rows, kind, id, savedIds);
  const sending = pool.filter((r) => mayReceive(r, purpose));
  const held = pool.filter((r) => !mayReceive(r, purpose));
  const named = sending.filter((r) => firstNameOf(r.givenName, r.waName) !== null);
  const unnamed = sending.filter((r) => firstNameOf(r.givenName, r.waName) === null);
  // One ordinary person, then the one nobody has seen, then the rest in order.
  const order = [...named.slice(0, 1), ...unnamed.slice(0, 1), ...named.slice(1), ...unnamed.slice(1)];
  const people = order.slice(0, limit).map((r) => previewPerson(r, null));
  // Why a person in the list is not in the send, from the one place that answers
  // it: no number at all, else the consent the purpose asks for.
  for (const r of held.slice(0, 2)) {
    const why = !r.phone
      ? "No phone number on file, so nothing can be sent."
      : (PURPOSE_REFUSALS[
          mayMessageFor(
            { consent: r.consent.state, dnc: r.consent.dnc, marketing_consent: r.consent.marketing },
            purpose,
            { proactive: true },
          ).reason ?? ""
        ] ?? "Held back.");
    people.push(previewPerson(r, why));
  }
  return {
    people,
    sending: sending.length,
    held: held.length,
    saidYes: pool.filter((r) => saidYesTo(r, purpose)).length,
    heard: sending.filter((r) => touched.has(r.id)).length,
  };
}
