/**
 * The rule that only one fold is open (moved whole from legacy/components/record-fold.jsx, decision 0015).
 *
 * `recFolds` is what the pages read as `window.__recordFolds` (seed-globals and the mockup's bundle publish it from
 * kit-globals.ts), and it is what the Settings rail asks before it replaces a pane. A page asks it to open a fold with
 * request(id), or request(id, { dirty }), where `dirty` says whether that fold holds unsaved changes once it is open.
 * Without one, the fold's own is used: useRecordFold binds each fold's dirty test to its id as the fold mounts, so a fold
 * opened from anywhere by its id alone (the Business tab's gap line opens a row it names) is guarded exactly as its own
 * act would have guarded it.
 *
 * The registry keeps ONE dirty test per fold id: the one bound by the last useRecordFold hook to mount with that id. So a
 * fold id belongs to one hook on the page. Two hooks drawing the same id would leave that id unguarded once the later of
 * them unmounted, its test let go and the earlier's already replaced. The rebind this replaced let the last hook win the
 * same way; it is a stated limit, not handled, because nothing draws a fold id twice. A clean fold gives way at once; a
 * dirty one stays open and the registry records { holding, wants } until one of three answers: discard() (throw its
 * changes away and open the one asked for), stay() (keep editing it), or close(id) from the holding fold itself (saved
 * or cancelled; the one asked for then opens). If the fold asked for leaves the page first, the ask goes with it, and
 * the holding fold stays open with its changes. close(id) from a fold that is not the open one does nothing.
 * subscribe(fn) hears every change. A page reaches all of this through useRecordFold rather than by hand.
 *
 * A save in progress is not an open, unsaved editor. While the open fold's save is out (`saving`, the second test its
 * hook binds), its fields are read-only (the page hands each of the kit's controls `readOnly`), what is asked of it
 * waits, and nothing asks whether to discard what is on its way to the server: the box once stayed editable under
 * "Saving…" and what was typed then went without a word when the save landed, and another row's "Discard your
 * changes?" still asked, its yes stopping nothing. So a fold that is saving never gives way at once, whatever its
 * dirty test says (a fold judged against the saver's base reads clean the moment its save goes out); the ask is
 * recorded, the fold draws no question while it saves, and the save's answer is the answer: taken, the fold closes and
 * the one asked for opens; refused, the question is drawn, and is true again. saving() says so to the Settings rail,
 * which asks in other words (`__settingsSaving`), and the browser is asked to ask while a save is out too, since a tab
 * closed over it may take the request with it.
 *
 * Three are not for pages: drawn(id) is RecordFold's own (it counts the folds with each id on the page, and when the
 * last one with the open id goes, the registry lets go); bind(id, check, saves) is useRecordFold's (a fold's dirty test
 * and its save-is-out test, by its id, for as long as the fold is on the page; a page drawn again hands over its own; one
 * hook binds one of each for its life, so the test it binds is the test it hands its requests); and reset() is for tests
 * (it forgets what is open and asked).
 */
import { listen, logError, unlisten } from "./shell-verbs";

/** A fold's id: the page's word for it (a number or an empty string is one too). */
export type FoldId = string | number;
/** A test the registry asks: whether a fold holds changes, or whether its save is out. */
type Check = () => unknown;
interface Ask {
  holding: FoldId;
  wants: FoldId;
  check: Check | undefined;
}

// A check that throws is taken as holding changes: asking once too often loses nothing.
const holding = (check: Check) => {
  try {
    return !!check();
  } catch {
    return true;
  }
};

/**
 * What it keeps. "Nothing open" is null, never merely falsy: a fold may be called 0 or "". `live` counts the folds with each id on the page, by id and not held by each fold, because the fold a
 * person sees can be a new instance of the one that opened: StrictMode's check in development, a key change or a new parent
 * unmounts one and mounts the next in the same commit. `bound` is each fold's own dirty test, by its id, from the moment
 * its hook mounts until it goes (bind); a request that brings none uses it, since without it a fold opened by its id alone
 * held no test, and the rail, another fold's act and the browser would each have thrown its changes away without asking
 * (one test per id, the last hook's to mount: the header says why a fold id belongs to one hook). `busy` is each fold's
 * "my save is out" test, bound and let go of with its dirty test. `holds` are a composer's unsaved tests, each held while
 * it is drawn, so the tab asks before closing over it and the rail before replacing it; a hold never stands between two
 * folds: request() asks the open fold alone. The open fold's test is the one its request brought, else the one its hook
 * bound. The browser asks before the tab closes over a dirty fold, over one whose save is out (the tab may take the request
 * with it), or over a composer's words: the listener is on only while a fold is open or a composer holds -- the form the
 * record replaced hung its own on only while it held changes -- and it asks at the moment the tab closes.
 *
 * The three that are not a page's. hold(id, check) is useUnsavedWork's own: a composer with this id is drawn, and `check`
 * says whether it holds words; call what it returns when it goes, and a hold that comes back under the same id replaces
 * the last. reset() is for tests: forget what is open, what is asked and what a composer held; the folds counted on the
 * page stay counted, and their bound dirty tests stay bound, since they are the page's. bind(id, check, saves) is
 * useRecordFold's own: the fold `id` is on the page, and this is its dirty test, whether the fold is open, waiting behind
 * an ask to open, or closed until something asks for it by its id; a page drawn again as a new instance hands over its own
 * the same way, and nothing else moves, the ask included, and nobody is told, since nothing anyone sees has changed. Call
 * what it returns as the fold's page goes: its test is let go of wherever the registry still holds it, a test bound since,
 * by a new instance, is left in place, and an ask for the fold goes unless a new instance has bound by the end of the
 * commit; it is asked a moment later, as drawn() asks, so one that comes straight back as a new instance (binding its own
 * test in the same commit) keeps the ask, while a fold gone for good takes the ask with it (answered "discard", it would
 * have thrown the holding fold's changes away to open a fold nothing draws: the holding fold stays open with its changes,
 * and is told, so its question goes too). drawn(id) is RecordFold's own: a fold with this id is on the page; call what it
 * returns when it goes, and when the last fold with the open id goes the registry lets go of it, asked a moment later so a
 * fold that comes straight back, or comes back as a new instance, is counted again first.
 */
function createRecFolds() {
  let openId: FoldId | null = null;
  let openDirty: Check | null = null;
  let asked: Ask | null = null;
  const subs = new Set<() => void>();
  const live = new Map<FoldId, number>();
  const bound = new Map<FoldId, Check>();
  const busy = new Map<FoldId, Check>();
  const holds = new Map<string, Check>();
  const foldDirty = () => {
    if (openId == null) return false;
    const check = typeof openDirty === "function" ? openDirty : bound.get(openId);
    return typeof check === "function" && holding(check);
  };
  const dirty = () => foldDirty() || [...holds.values()].some(holding);
  // Whether the open fold's save is out. A test that throws is taken as not saving: the dirty test still speaks.
  const saving = () => {
    if (openId == null) return false;
    const check = busy.get(openId);
    if (typeof check !== "function") return false;
    try {
      return !!check();
    } catch {
      return false;
    }
  };
  const hold = (e: BeforeUnloadEvent) => {
    if (!dirty() && !saving()) return;
    e.preventDefault();
    // Chrome asks only when the event's returnValue is set
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    e.returnValue = "";
  };
  // Each listener hears every change, whatever another does: one that throws is reported and the rest still hear.
  const tell = () => {
    unlisten("beforeunload", hold);
    if (openId != null || holds.size > 0) listen("beforeunload", hold);
    for (const fn of [...subs]) {
      try {
        fn();
      } catch (err) {
        logError(err);
      }
    }
  };
  const become = (id: FoldId | null, check?: unknown) => {
    openId = id == null ? null : id;
    openDirty = typeof check === "function" ? (check as Check) : null;
    asked = null;
    tell();
  };
  return {
    open: (): FoldId | null => openId,
    dirty,
    saving,
    asking: (): { holding: FoldId; wants: FoldId } | null =>
      asked ? { holding: asked.holding, wants: asked.wants } : null,
    request(id: FoldId, { dirty: given }: { dirty?: unknown } = {}): boolean {
      const check = typeof given === "function" ? (given as Check) : bound.get(id);
      if (id === openId) {
        if (typeof check === "function") openDirty = check;
        asked = null;
        tell();
        return true;
      }
      // A fold whose save is out never gives way at once: the ask waits for the save's answer (the header says why).
      // A composer's hold does not stand between two folds: only the open fold is asked.
      if (openId == null || (!foldDirty() && !saving())) {
        become(id, check);
        return true;
      }
      asked = { holding: openId, wants: id, check };
      tell();
      return false;
    },
    // useUnsavedWork's own: a composer with this id is drawn (see "The three that are not a page's" above).
    hold(id: string, check: Check | boolean): () => void {
      const test: Check = typeof check === "function" ? check : () => !!check;
      holds.set(id, test);
      tell();
      return () => {
        if (holds.get(id) === test) {
          holds.delete(id);
          tell();
        }
      };
    },
    discard() {
      if (asked) become(asked.wants, asked.check);
      else become(null);
    },
    stay() {
      if (!asked) return;
      asked = null;
      tell();
    },
    close(id?: FoldId | null) {
      if (id != null && id !== openId) return;
      if (asked) become(asked.wants, asked.check);
      else become(null);
    },
    // For tests (see above).
    reset() {
      holds.clear();
      become(null);
    },
    subscribe(fn: () => void): () => void {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    // useRecordFold's own (see above).
    bind(id: FoldId, check: unknown, saves?: unknown): () => void {
      if (typeof check !== "function") return () => {};
      const test = check as Check;
      bound.set(id, test);
      if (typeof saves === "function") busy.set(id, saves as Check);
      if (openId != null && id === openId) openDirty = test;
      if (asked && asked.wants === id) asked.check = test;
      return () => {
        if (bound.get(id) === test) bound.delete(id);
        if (busy.get(id) === saves) busy.delete(id);
        if (openDirty === test) openDirty = null;
        if (asked && asked.check === test) asked.check = undefined;
        // The fold an ask wants is going: asked a moment later, as drawn() asks (see above).
        queueMicrotask(() => {
          if (asked && asked.wants === id && !bound.has(id)) {
            asked = null;
            tell();
          }
        });
      };
    },
    // RecordFold's own (see above).
    drawn(id: FoldId): () => void {
      live.set(id, (live.get(id) || 0) + 1);
      return () => {
        const left = (live.get(id) || 1) - 1;
        if (left > 0) live.set(id, left);
        else live.delete(id);
        queueMicrotask(() => {
          if (!live.has(id) && openId === id) become(null);
        });
      };
    },
  };
}

/** The one registry of open folds. */
export const recFolds = createRecFolds();
