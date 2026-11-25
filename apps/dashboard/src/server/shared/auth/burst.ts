/**
 * What a burst of one session's reads asks once (25 Nov 2026).
 *
 * Every request to /api/v1 asked the database who was asking before it did anything else: one read of the memberships,
 * for each of the fourteen to twenty-seven requests a page load sends in the same second. On the night of 24 Nov 2026 one
 * sign-in made 6,337 requests and 6,337 of its 53,256 database calls were that one question, asked again a few
 * milliseconds after the last answer (Supabase's gateway log).
 *
 * A read (GET, HEAD) now shares the answer another read of the same session asked for inside the burst, on this instance:
 * the one out now, or one that began less than BURST_MS ago. It is the window the browser's own client shares identical
 * reads in (client/api.ts INFLIGHT_MS), and for the same reason: reads sent together are one look at the world.
 *
 *  - Never a write. A write reads who is asking for itself, and forgets what the session's reads held, as it begins and as
 *    it lands, so a read that follows a change on this instance sees it.
 *  - Never a refusal or a failure: only an answer is shared, and only while it is this young.
 *  - By session, not by person: another sign-in of the same person, or the same one before and after its second factor,
 *    asks for itself.
 *
 * An instance's memory, so two instances each ask once. Nothing here outlives its two seconds: it is no cache of who may
 * see what, which stays the database's to say on every burst.
 */
import { SECOND_MS } from "@chanlytics/contracts";

/** How long a burst is: reads of one session begun within it share one answer. */
const BURST_MS = 2 * SECOND_MS;

/** Past this many sessions held the expired are swept: an instance must not grow with everyone who ever asked. */
const SWEEP_AT = 2_000;

interface Shared<A> {
  answer: Promise<A>;
  began: number;
}

/** What one burst store holds and does. */
interface Bursts<A> {
  /**
   * The session's answer: the one its burst already has, else `ask`'s, which the burst then holds. `session` absent (a
   * write, a test's context) asks every time and holds nothing.
   */
  shared(person: string, session: string | undefined, ask: () => Promise<A>): Promise<A>;
  /** Let go of everything held for a person, every session of theirs: a write of theirs may have changed it. */
  forget(person: string): void;
}

/** A store of one question's answers, shared across each session's bursts. */
export function burstsOf<A>(now: () => number = () => Date.now()): Bursts<A> {
  const held = new Map<string, Map<string, Shared<A>>>();
  let sessions = 0;
  const sweep = () => {
    const at = now();
    for (const [person, mine] of held) {
      for (const [session, one] of mine) if (at - one.began >= BURST_MS) mine.delete(session);
      if (!mine.size) held.delete(person);
    }
    sessions = [...held.values()].reduce((sum, mine) => sum + mine.size, 0);
  };
  return {
    shared(person, session, ask) {
      if (session === undefined) return ask();
      const mine = held.get(person);
      const had = mine?.get(session);
      if (had && now() - had.began < BURST_MS) return had.answer;
      const one: Shared<A> = { answer: ask(), began: now() };
      const into = mine ?? new Map<string, Shared<A>>();
      if (!mine) held.set(person, into);
      if (!had) sessions += 1;
      into.set(session, one);
      // A refusal is nobody else's answer: the next read asks for itself, as its own request would.
      one.answer.catch(() => {
        if (into.get(session) === one) into.delete(session);
      });
      if (sessions > SWEEP_AT) sweep();
      return one.answer;
    },
    forget(person) {
      const mine = held.get(person);
      if (!mine) return;
      sessions -= mine.size;
      held.delete(person);
    },
  };
}
