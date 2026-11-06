/** `work` over `items`, `atOnce` at a time, each taking the next as it finishes; none begun once `goOn` says no. */
export async function eachAtOnce<T>(
  items: readonly T[],
  atOnce: number,
  goOn: () => boolean,
  work: (item: T) => Promise<void>,
): Promise<void> {
  const left = items.values();
  const worker = async () => {
    for (let n = left.next(); !n.done && goOn(); n = left.next()) await work(n.value);
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, items.length) }, worker));
}
