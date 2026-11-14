/**
 * How far a member has read their bell, as a tab holds it and writes it (decision 0124, amended 12 Nov 2026).
 *
 * The moment is the server's (GET notifications' `read_through_at`), the same on every device. Mark all read moves it up
 * to the newest note this tab holds and no further, so a note that arrives after the press keeps its dot, and its Undo
 * hands back the moment the door answered. A press is held here while its write is on its way, so the dots answer at
 * once. A write the server did not take is tried once more; one that fails twice lets the held press go, so the dots are
 * the server's again at once and the bell can say so. bridge/notifications.ts wires it to the bell.
 */
import {
  SECOND_MS,
  bellReadThroughMs,
  unreadCount,
  type NotificationRow,
  type NotificationsDto,
} from "@chanlytics/contracts";
import type { ApiResult, Input, Output } from "../../client/api";

/** What the bell's marks are written with, and what the server answers one. */
export type MarkBody = Input<"PUT notifications">;
type MarkAnswer = ApiResult<Output<"PUT notifications">>;
/** One write of a mark as it ended: the server's answer, and how many tries it took. */
type MarkAttempt = (body: MarkBody) => Promise<{ answer: MarkAnswer; tries: number }>;

/** How long a mark the server did not take waits for its one more try. */
export const MARK_RETRY_MS = 2 * SECOND_MS;

/** What Mark all read answers (BellApi.readAll). */
export interface BellReadAll {
  read: number;
  saved: Promise<boolean>;
  undo: () => Promise<boolean>;
}

/**
 * A mark's write, tried once more where the server did not take it (a dropped connection, a function waking). `send`
 * answers a refusal and never throws (the typed client), so the second answer is the write's.
 */
export const markAttempt =
  (send: (body: MarkBody) => Promise<MarkAnswer>, retryMs: number): MarkAttempt =>
  async (body) => {
    const first = await send(body);
    if (first.ok) return { answer: first, tries: 1 };
    await new Promise((again) => setTimeout(again, retryMs));
    return { answer: await send(body), tries: 2 };
  };

/** The window a tab's read-through is held on: the bell's kept rows, and the event that says they were read again. */
type BellWindow = Pick<Window, "addEventListener"> & { __NOTIFICATIONS?: { dto: NotificationsDto } | null };

/** No kept rows read yet: what a press made before the bell's first read rides on. */
const NO_KEPT_ROWS: NotificationsDto = { notifications: [], seen_at: null };

/**
 * How far the member has read, as this tab holds it. It is the server's, and a Mark all read, or its Undo, that this tab
 * just made is held here while its write and the re-read behind it are on their way, so the dots answer the press at
 * once and do not blink back if the write lands before the read. The held moment is let go when the bell's rows are read
 * again after the write landed (the server's moment is then the same), or at once where the write failed (`drop`).
 */
export function readThroughOf(win: BellWindow) {
  let pressed: { at: number; landed: boolean } | null = null;
  win.addEventListener("surface:notifications", () => {
    if (pressed?.landed) pressed = null;
  });
  return {
    /** Whether a press is held: the bell's moment is this tab's for now, whatever the server last said. */
    held: (): boolean => pressed !== null,
    /** The kept rows as the server holds them, read through the press this tab just made where one is on its way. */
    kept: (): NotificationsDto | null | undefined => {
      const dto = win.__NOTIFICATIONS?.dto;
      if (!pressed) return dto;
      return { ...(dto ?? NO_KEPT_ROWS), read_through_at: new Date(pressed.at).toISOString() };
    },
    /** Hold `at` as the moment read through while `write` is on its way. */
    press: (at: number, write: Promise<unknown>): void => {
      const mine = { at, landed: false };
      pressed = mine;
      const land = () => {
        mine.landed = true;
      };
      void write.then(land, land);
    },
    /** Let the held press go at once: its write failed, so the server's own moment is the bell's again. */
    drop: (): void => {
      pressed = null;
    },
  };
}

/** Where the member stood before a read, as the door answered it (`was`); null from any other answer. */
function wasOf(answer: MarkAnswer): string | null {
  if (!answer.ok || !("was" in answer.data)) return null;
  return typeof answer.data.was === "string" ? answer.data.was : null;
}

/**
 * The newest moment this tab holds a note of, epoch ms: of the rows the bell lists and of every kept row it has read, a
 * dismissed one among them. What Mark all read reads up to (00622); null where the tab holds no note.
 */
function newestHeld(list: readonly NotificationRow[], dto: NotificationsDto | null | undefined): number | null {
  const moments = [...list.map((r) => r.at), ...(dto?.notifications ?? []).map((n) => Date.parse(n.created_at))];
  const known = moments.filter((m) => Number.isFinite(m));
  return known.length ? Math.max(...known) : null;
}

/** What Mark all read reads of the bell it is pressed in, as the bell stands at the press. */
interface ReadAllAt {
  /** The rows the bell lists, and how many unread kept rows it does not. */
  rows: readonly NotificationRow[];
  older: number;
  /** The kept rows as the tab has read them, or none yet. */
  dto: NotificationsDto | null | undefined;
  /** This device's last look: where the dots stand before the bell's rows are read. */
  lookedAt: number;
  through: ReturnType<typeof readThroughOf>;
  attempt: MarkAttempt;
  /** The press is a look too: this device's number starts again at once. */
  look: () => void;
  /** With no note held the press is a look alone, written as closing the bell writes it. */
  seenAll: () => void;
  /** The bell changed: it is drawn again. */
  emit: () => void;
}

/**
 * The way back from a read: the dots at once where this tab held them (`stood`), then, once the read has been answered,
 * the door's own moment sent back (`was`), which is right after another device read too and before the bell's rows were
 * here. A read that took two tries may have landed on the first, and the door then answers where that try left it: the
 * earlier of the two moments is where the member stood. Answers whether the server took it; a read that never saved has
 * nothing to put back.
 */
const undoOf = (at: ReadAllAt, reading: ReturnType<MarkAttempt>, stood: number) => async (): Promise<boolean> => {
  at.through.press(stood, reading);
  at.emit();
  const { answer, tries } = await reading;
  if (!answer.ok) return true;
  const was = Date.parse(wasOf(answer) ?? "");
  const to = tries > 1 ? Math.min(was, stood) : was;
  const undoing = Number.isFinite(to) ? at.attempt({ read_through: new Date(to).toISOString() }) : null;
  if (undoing) at.through.press(to, undoing);
  const undone = undoing ? (await undoing).answer.ok : false;
  // Not taken: the dots are the server's again at once.
  if (!undone) at.through.drop();
  at.emit();
  return undone;
};

/**
 * Mark all read: every dot on the notes this tab holds goes at once, and the server reads up to the newest of them, a
 * millisecond past it (the database keeps a row's moment finer than the browser reads it), so a note that arrives after
 * the press keeps its dot. Answers how many it read, whether the server took it (the dots are back by the time it says
 * no), and the way back.
 */
export function readAllOf(at: ReadAllAt): BellReadAll {
  const newest = newestHeld(at.rows, at.dto);
  // No note here to read: the press is a look, and reads nothing the tab never showed.
  if (newest === null) {
    at.seenAll();
    return { read: 0, saved: Promise.resolve(true), undo: () => Promise.resolve(true) };
  }
  // Where the dots stand before the press, as this tab holds it: the server's moment, or this device's last look
  // before the bell's rows are read.
  const stood = at.dto || at.through.held() ? bellReadThroughMs(at.through.kept()) : at.lookedAt;
  const upTo = newest + 1;
  const reading = at.attempt({ read_all: true, read_through: new Date(upTo).toISOString() });
  at.through.press(upTo, reading);
  at.look();
  const saved = reading.then(({ answer }) => {
    if (!answer.ok) at.through.drop();
    at.emit();
    return answer.ok;
  });
  return { read: unreadCount(at.rows) + at.older, saved, undo: undoOf(at, reading, stood) };
}
