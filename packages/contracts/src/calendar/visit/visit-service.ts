/**
 * What a message may say of an appointment: the service, without any person's name, and the saved name a match by name
 * may rest on.
 *
 * An event's title names the person it is for ("Balayage · Maria Lopez", "Haircut with Maria Lopez"), and the calendar
 * matches an event to a person by phone, address or a name (calendar-people.ts). The receptionist says "Matched by name
 * only -- make sure it is them" and a person weighs it; a message that is sent on its own cannot, so a visit playbook
 * enrols a visit found by name alone only on a full saved name no one else holds (playbook-reach.ts), and says the service
 * alone (playbooks.ts visitFactsFor).
 */
import { isIdentifierName } from "../../conversations/thread-contact";
import { escapeRe } from "../calendar-people";

/**
 * A saved name that a match BY NAME may rest on when a message is going to be sent: two words or more, the first and
 * the last of two letters at least ("Maria Lopez", never "Maria" or "Maria L."), written the one way (lower case, single
 * spaces) so two people who hold the same name are seen to. Null for any other name, and for a phone or an address made
 * words.
 */
export function fullNameKey(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n || isIdentifierName(n)) return null;
  const words = n.split(/\s+/);
  const first = words.at(0);
  const last = words.at(-1);
  const letters = (w: string): number => (w.match(/\p{L}/gu) ?? []).length;
  if (words.length < 2 || !first || !last || letters(first) < 2 || letters(last) < 2) return null;
  return words.join(" ").toLowerCase();
}

/** What ends a service's words once a name has come out of them: separators, an opened bracket, and a joining word ("with", "for"). */
const SERVICE_TAIL = /(?:^|[^\p{L}])(?:with|for|and|w\/)\s*$|[\s·•|:,/&+\-–—([{]+$/iu;
const SERVICE_HEAD = /^[\s·•|:,./&+\-–—)\]}]+/u;

/** The words either side of a name that came out, joined as one title again: the joining words and separators at the seam go. */
function seamed(before: string, after: string): string {
  let left = before;
  for (let prev = ""; prev !== left;) {
    prev = left;
    left = left.replace(SERVICE_TAIL, "");
  }
  const right = after.replace(SERVICE_HEAD, "");
  return left && right ? `${left} · ${right}` : left || right;
}

/**
 * The service an appointment is for, as the title says it, WITHOUT the person's own name: "Balayage · Maria Lopez",
 * "Maria Lopez - Balayage" and "Haircut with Maria Lopez (2h)" are each the service alone, and a title that is the name
 * and nothing else is no service words at all (an empty string, which the message says as "your appointment"). `names` are
 * the names the person is saved under; each comes out wherever it stands on word edges, in any case, at three letters or
 * more (a name of two is as likely a word of the service's).
 *
 * The message a visit playbook sends carries this and never the raw title: a message that says "your Balayage · Maria
 * Lopez" about a visit that is another Maria's is the worst way to be wrong. A page that says the name beside the title
 * reads visitTitleWithout below, the same cut with the whole title kept where the name was all it said.
 */
export function visitServiceOf(title: string, names: readonly (string | null | undefined)[]): string {
  let service = title.trim();
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (name.length < 3 || isIdentifierName(name)) continue;
    // Like the calendar's own name match, with an apostrophe a letter's own: "Al" is not in "Al's Cuts".
    const edge = "[^\\p{L}\\p{N}'’]";
    const re = new RegExp(`(?<=^|${edge})${escapeRe(name)}(?=$|${edge})`, "iu");
    for (let m = re.exec(service); m; m = re.exec(service)) {
      service = seamed(service.slice(0, m.index), service.slice(m.index + m[0].length));
    }
  }
  return service;
}

/**
 * The title a page that says the person's name beside it draws (the board's block and agenda row, People's row, the
 * person's History and Coming up, Today's day): the service alone (visitServiceOf), or the whole title where taking the
 * name out leaves no words, so an event titled only with the name still says something. One rule for every page: the
 * calendar's `serviceOf` and People's `visitTitleFor` were two more, each cutting the name only at an end of the title.
 */
export function visitTitleWithout(title: string, names: readonly (string | null | undefined)[]): string {
  const whole = title.trim();
  const service = visitServiceOf(whole, names);
  return /[\p{L}\p{N}]/u.test(service) ? service : whole;
}
