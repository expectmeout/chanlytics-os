/**
 * How many surfaces boot at once.
 *
 * Every surface used to boot in one Promise.all. On the salon's workspace that
 * is 23 requests fired in the same millisecond, and the last of them answered
 * 7.8 SECONDS after the page loaded -- `settings` alone took 7,450ms. The
 * endpoints are not slow: measured one at a time on the same tab the same
 * minute, `settings` answers in 488ms and five together finish in 568ms. The
 * whole of that 7.8s was twenty-three cold functions competing.
 *
 * Four lanes is enough to keep the connection busy and few enough that nothing
 * starves. Everything still boots, and no surface is dropped or deferred to a
 * later trip -- they queue instead of stampeding.
 */
export const BOOT_LANES = 4;

/** Run `work` over `queue`, at most `lanes` at a time, in its order as it stands when each lane comes free. */
export async function runInLanes<T>(queue: T[], lanes: number, work: (item: T) => Promise<void>): Promise<void> {
  const lane = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (next === undefined) return;
      await work(next);
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, queue.length) }, lane));
}
