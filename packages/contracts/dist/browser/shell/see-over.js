import { messageRoute, parseSequencesRoute, runRoute } from "../sequences/sequence-address.js";
export const SEE_PARAM = "see";
const WORD = /^[A-Za-z0-9_-]+$/;
export function seeValueOf(ref) {
  if (ref.kind === "message") return `message:${ref.name}`;
  return ref.sequenceId && ref.sequenceId !== ref.id ? `run:${ref.id}:${ref.sequenceId}` : `run:${ref.id}`;
}
export function seeRefOf(value) {
  if (!value) return null;
  const [kind, id, sequenceId, ...rest] = value.split(":");
  if (rest.length > 0 || !id || !WORD.test(id)) return null;
  if (kind === "message") return sequenceId === void 0 ? { kind: "message", name: id } : null;
  if (kind !== "run") return null;
  if (sequenceId !== void 0 && !WORD.test(sequenceId)) return null;
  return { kind: "run", id, sequenceId: sequenceId ?? null };
}
export function seeRefOfRoute(route) {
  const [path = ""] = route.split("?");
  const place = parseSequencesRoute(path);
  if (place?.view === "record" && place.run && WORD.test(place.run))
    return { kind: "run", id: place.run, sequenceId: place.id === place.run ? null : place.id };
  const message = /^campaigns\/message:([A-Za-z0-9_-]+)$/.exec(path);
  return message?.[1] ? { kind: "message", name: message[1] } : null;
}
export function seeHomeOf(ref) {
  return ref.kind === "message" ? messageRoute(ref.name) : runRoute(ref.id, ref.sequenceId);
}
export const SEE_WORDS = {
  /** The door from the sheet to the thing's home. */
  home: "Open in Campaigns",
  /** Its kicker, where it was opened over. */
  run: "A run",
  message: "A message"
};
