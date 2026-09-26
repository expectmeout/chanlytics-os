/**
 * The three on a phone take a page in as it arrives, stay lit while something needs you, and notice what comes for
 * you. The ✦ sat grey all day: nobody saw the AI's colours unless they opened Ask (Ruben, 25 Sep: "so users get to
 * see the colour states, like it is turned on, reading the site with me; it must be very subtle and sophisticated,
 * not performative; scope to mobile", then "stay in the idle state but with colour, one or some of the blocks turning
 * like at rest; and if something on the page needs attention, stay in colour instead of going back to grey"). So, on
 * a phone:
 * - A page arriving (the first face, or the address changing to another page) is read: the three, where they stand,
 *   take the AI's colour and turn once or twice (the mood's `glow`) for READ_MS, or as long as the boot takes up to
 *   READ_MAX_MS. The same page again within AGAIN_MS is not read again, and a walk within a page (a lead's peek, a
 *   view's flags after a colon) is the same page.
 * - While something waits on you (Ask's own standing: people, runs or searches waiting; `standing`), the three stay
 *   lit at rest; the ink comes back when nothing does and no read is on.
 * - What comes for you is noticed: the needs-you count rising makes the three hop once.
 * Never while Ask is open (the Line owns the mood; the light goes as it opens and comes back as it closes), never a
 * read over a mood already busy, never on a desk.
 * Pure: the address, the phone, Ask's door, the boot and the clock are handed in (../arrival.ts wires them).
 */
import type { Mood } from "./mood";

/** how long a page is read, at least */
export const READ_MS = 2200;
/** and at most, should the boot take longer */
export const READ_MAX_MS = 4000;
/** the same page again within this is not read again */
export const AGAIN_MS = 20_000;

export interface ArrivalOptions {
  mood: Mood;
  /** the address on screen (`#/inbox/th-1`) */
  route: () => string;
  /** whether a phone is looking: the ✦ is a phone's */
  phone: () => boolean;
  /** whether Ask is open: the Line owns the mood then */
  askOpen: () => boolean;
  /** settled once the boot's reads are in; settled at once when nothing is booting */
  afterBoot: () => Promise<void>;
  now?: () => number;
  later?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

export interface Arrival {
  /** a page arrived: the first face, or the address changed */
  arrived(): void;
  /** whether something waits on you, as Ask's standing says it each time the surfaces it reads land */
  standing(waiting: boolean): void;
  /** Ask opened or closed: the light follows */
  askChanged(): void;
  /** the needs-you count, as the inbox says it each time it lands */
  noticed(needs: number): void;
  stop(): void;
}

/** The page an address names: `inbox/th-1`, `clients/leads`; what a walk within it adds after a colon is not a page. */
export const pageOf = (route: string): string => {
  const raw = (route || "").replace(/^#\/?/, "");
  const [page, param = ""] = raw.split("/");
  const head = param.split(":")[0];
  return head ? `${page || "today"}/${head}` : page || "today";
};

export function watchArrival(o: ArrivalOptions): Arrival {
  const now = o.now ?? (() => Date.now());
  const later = o.later ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = o.cancel ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  const readAt = new Map<string, number>();
  // the read on, by number: an older read's end leaves a newer one alone
  let reading = 0;
  let pending: unknown = null;
  let waiting = false;
  let needs: number | null = null;
  // lit while a read is on or something waits, on a phone, with Ask closed; the ink otherwise
  const settle = () => o.mood.glow((reading > 0 || waiting) && o.phone() && !o.askOpen());
  const may = () => o.phone() && !o.askOpen() && o.mood.state === "idle";
  const rest = (seq: number) => {
    if (seq !== reading) return;
    reading = 0;
    pending = null;
    settle();
  };
  return {
    arrived() {
      if (!may()) return;
      const page = pageOf(o.route());
      const t = now();
      const last = readAt.get(page);
      if (last !== undefined && t - last < AGAIN_MS) return;
      readAt.set(page, t);
      const seq = ++reading;
      settle();
      let bootIn = false;
      let pastRead = false;
      o.afterBoot().then(
        () => {
          bootIn = true;
          if (pastRead && seq === reading) {
            cancel(pending);
            rest(seq);
          }
        },
        () => {
          bootIn = true;
        },
      );
      pending = later(() => {
        pastRead = true;
        if (bootIn) rest(seq);
        else pending = later(() => rest(seq), READ_MAX_MS - READ_MS);
      }, READ_MS);
    },
    standing(on) {
      waiting = !!on;
      settle();
    },
    askChanged() {
      settle();
    },
    noticed(n) {
      const v = Number.isFinite(n) ? n : null;
      const was = needs;
      needs = v;
      if (v === null || was === null || v <= was) return;
      if (!may()) return;
      o.mood.react("hop");
    },
    stop() {
      if (pending !== null) cancel(pending);
      pending = null;
      reading = 0;
      waiting = false;
      o.mood.glow(false);
    },
  };
}
