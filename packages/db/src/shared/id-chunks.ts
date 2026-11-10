/** How many ids one `in` list carries: two hundred keep a request line under the gateway's 8 KiB (414). */
const IDS_IN_CHUNK = 200;

/** The ids, each once, in lists short enough for one request line each. */
export const idChunksOf = (ids: readonly string[]): string[][] => {
  const unique = [...new Set(ids)];
  return Array.from({ length: Math.ceil(unique.length / IDS_IN_CHUNK) }, (_, i) =>
    unique.slice(i * IDS_IN_CHUNK, (i + 1) * IDS_IN_CHUNK),
  );
};
