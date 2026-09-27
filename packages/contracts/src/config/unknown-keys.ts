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
