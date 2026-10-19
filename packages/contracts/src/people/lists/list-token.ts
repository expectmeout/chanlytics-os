/**
 * A list's reference and its token (decision 0009): how the address, a saved view, a pin and a playbook name a list, read
 * without the lists themselves (lists.ts), which every page that names one would otherwise carry.
 */
export type ListRef = { kind: "builtin"; id: string } | { kind: "saved"; id: string };

const SAVED_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN_ID = /^[a-z_]{1,40}$/;

/**
 * A list's token, as the address writes it after `clients/`: `seg:<built-in id>` or `list:<saved list id>`. `state:`
 * (People's old standing tabs) reads as `seg:`, since Needs you and You have it are lists.
 */
export function listToken(ref: ListRef): string {
  return ref.kind === "builtin" ? `seg:${ref.id}` : `list:${ref.id}`;
}

/** A token back to its reference, or null for anything else. */
export function parseListToken(token: string | null | undefined): ListRef | null {
  if (typeof token !== "string") return null;
  const at = token.indexOf(":");
  const kind = token.slice(0, at);
  const id = token.slice(at + 1);
  if ((kind === "seg" || kind === "state") && BUILTIN_ID.test(id)) return { kind: "builtin", id };
  if (kind === "list" && SAVED_ID.test(id)) return { kind: "saved", id: id.toLowerCase() };
  return null;
}
