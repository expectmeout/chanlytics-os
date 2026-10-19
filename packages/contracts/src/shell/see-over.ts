/**
 * Open in place (the Campaigns wiring review's rule C, lane 3, 19 Oct 2026): a press on a mention of a thing opens the
 * thing as a sheet over the page it was pressed on -- `?see=<kind>:<id>` on that page's own address, one entry of the
 * history, so Back closes it -- and the sheet holds the door to the thing's home. The page under it stays as it was left:
 * the Inbox's row, Today's queue, the person's campaigns. Campaigns first (Ruben's call 2): a run, and a message of the
 * Library. A sequence is a place, its record with its tabs and their sheets, and opens at its home.
 *
 * Pure: the grammar of the param and which homes open in place. The frame reads it in the browser (the frame is one
 * prerender for every address), as it reads the lead sheet's `?lead=<id>`.
 */
import { messageOfRoute, messageRoute, parseSequencesRoute, runRoute } from "../sequences/sequence-address";

/** The query param a thing open over the page rides on. */
export const SEE_PARAM = "see";

/** A thing that opens over the page: a run (with the sequence it is a day of, where the writer knew it), or a message. */
export type SeeRef = { kind: "run"; id: string; sequenceId: string | null } | { kind: "message"; name: string };

/** A word of the param: an id, a uuid's shape or a name's (a message's snake_case), never a colon, slash or space. */
const WORD = /^[A-Za-z0-9_-]+$/;

/** The param's value for a thing: `run:<id>`, `run:<id>:<sequence>`, `message:<name>`. */
export function seeValueOf(ref: SeeRef): string {
  if (ref.kind === "message") return `message:${ref.name}`;
  return ref.sequenceId && ref.sequenceId !== ref.id ? `run:${ref.id}:${ref.sequenceId}` : `run:${ref.id}`;
}

/** The thing a param's value names, or null for a value that names none (a word out of shape, a kind not opened so). */
export function seeRefOf(value: string | null | undefined): SeeRef | null {
  if (!value) return null;
  const [kind, id, sequenceId, ...rest] = value.split(":");
  if (rest.length > 0 || !id || !WORD.test(id)) return null;
  if (kind === "message") return sequenceId === undefined ? { kind: "message", name: id } : null;
  if (kind !== "run") return null;
  if (sequenceId !== undefined && !WORD.test(sequenceId)) return null;
  return { kind: "run", id, sequenceId: sequenceId ?? null };
}

/**
 * The thing a home's route names, which a mention of it opens in place: a run's home (runRoute), or a message's, the
 * Library open on it (messageRoute); null for any other route, which a press goes to. The route as the shell names it, a
 * retired one moved first (canonicalRoute): a bell row kept as `broadcasts/run:<id>` is the run, one kept as
 * `campaigns/message:<name>` the message.
 */
export function seeRefOfRoute(route: string): SeeRef | null {
  const [path = ""] = route.split("?");
  const place = parseSequencesRoute(path);
  if (place?.view === "record" && place.run && WORD.test(place.run))
    return { kind: "run", id: place.run, sequenceId: place.id === place.run ? null : place.id };
  const message = messageOfRoute(path);
  return message && WORD.test(message) ? { kind: "message", name: message } : null;
}

/** The thing's home: where its sheet's door goes, and where it opens when it is pressed on its own page. */
export function seeHomeOf(ref: SeeRef): string {
  return ref.kind === "message" ? messageRoute(ref.name) : runRoute(ref.id, ref.sequenceId);
}

/** The words of the sheet a thing opens in over the page. */
export const SEE_WORDS = {
  /** The door from the sheet to the thing's home. */
  home: "Open in Campaigns",
  /** Its kicker, where it was opened over. */
  run: "A run",
  message: "A message",
} as const;
