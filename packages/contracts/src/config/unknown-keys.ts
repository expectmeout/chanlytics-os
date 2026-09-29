import type { z } from "zod";

/**
 * The keys a read of the tenant config left out, and the save's refusal of them.
 *
 * The read schema is `.strip()` at every level (config.ts), so a key the running code has never heard of is dropped
 * wherever it sits. What was stored, compared with what came out, finds each one: the read names them, and the save
 * refuses the ones inside a section.
 */

const isJsonObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** An array whose elements are read as what they are, unknown: Array.isArray alone narrows to any[]. */
const isList = (v: unknown): v is unknown[] => Array.isArray(v);

/** Where `raw` holds a key the parse left out, each as the path to it. A key whose value is undefined carries nothing. */
export function keysLeftOut(
  raw: unknown,
  kept: unknown,
  at: Array<string | number> = [],
): Array<Array<string | number>> {
  if (Array.isArray(raw) && Array.isArray(kept)) {
    return raw.flatMap((v, i) => (i < kept.length ? keysLeftOut(v, kept[i], [...at, i]) : []));
  }
  if (!isJsonObject(raw) || !isJsonObject(kept)) return [];
  return Object.entries(raw).flatMap(([k, v]) => {
    if (v === undefined) return [];
    return Object.hasOwn(kept, k) ? keysLeftOut(v, kept[k], [...at, k]) : [[...at, k]];
  });
}

/** Two JSON values the same, whatever order an object's keys were written in. */
function sameJson(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (isJsonObject(a) && isJsonObject(b)) {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
  }
  return Object.is(a, b);
}

/**
 * `sent` with every key the read left out of `raw` put back where it was, at any depth: what a newer build stored and
 * this one cannot see survives this one's save. `kept` is what the read made of `raw`. A key the read kept is the
 * page's to change or drop, so only a key it left out comes back, and only under an object the page sent (a section
 * the page removed stays removed). An array's element keeps its keys when the page sent it back as the read showed
 * it, wherever it now sits; an element the page changed is the page's, since which stored element it was is a guess.
 */
export function withKeysLeftOut(sent: unknown, raw: unknown, kept: unknown): unknown {
  if (isList(sent) && isList(raw) && isList(kept)) {
    const taken = new Set<number>();
    return sent.map((el) => {
      const i = kept.findIndex((k, n) => !taken.has(n) && n < raw.length && sameJson(k, el));
      if (i < 0) return el;
      taken.add(i);
      return withKeysLeftOut(el, raw[i], kept[i]);
    });
  }
  if (!isJsonObject(sent) || !isJsonObject(raw) || !isJsonObject(kept)) return sent;
  const out: Record<string, unknown> = { ...sent };
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined) continue;
    if (!Object.hasOwn(kept, k)) {
      if (!Object.hasOwn(sent, k)) out[k] = v;
    } else if (Object.hasOwn(sent, k)) {
      out[k] = withKeysLeftOut(sent[k], v, kept[k]);
    }
  }
  return out;
}

/**
 * Refuse each key `read` would leave out below the top level, as zod's own strict objects did: one
 * `unrecognized_keys` issue on the object holding them, so a caller that places an issue by its path places it as
 * before. A top-level key is let go, since the save drops a section it has never heard of, as it always did. A value
 * the read refuses outright kept nothing to compare with, and the rules after this say what is wrong with it.
 */
export function refuseUnknownFields(read: z.ZodType, raw: unknown, ctx: z.RefinementCtx): void {
  const parsed = read.safeParse(raw);
  if (!parsed.success) return;
  const byObject = new Map<string, { path: Array<string | number>; keys: string[] }>();
  for (const where of keysLeftOut(raw, parsed.data)) {
    if (where.length < 2) continue;
    const path = where.slice(0, -1);
    const id = JSON.stringify(path);
    const held = byObject.get(id) ?? { path, keys: [] };
    held.keys.push(String(where[where.length - 1]));
    byObject.set(id, held);
  }
  for (const { path, keys } of byObject.values()) ctx.addIssue({ code: "unrecognized_keys", keys, path });
}
