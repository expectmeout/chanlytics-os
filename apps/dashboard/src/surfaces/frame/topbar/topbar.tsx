/**
 * The top bar (moved from legacy/components/topbar.jsx, the one-system plan's step 7d): the menu, the crumbs, Ask's
 * button, the bell with its notes (notif-popover.tsx) and the theme. The bell reads the workspace's own rows through the
 * bridge (bridge/notifications.ts): who needs you, a draft waiting, a missed call, an open invitation; read state is
 * this device's. The demo's seeded notes and its presence control went with demo mode (16 Nov 2026). The frame's JSX
 * draws it by its old name (`Topbar`, frame-globals.ts) until the frame itself is TypeScript (step 7e). Drawn as the JSX
 * drew it, raw buttons and all, until the frame's kit step.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { askCalls, type FrameFlash } from "../../frame-verbs";
import { BAR_LINE_WORDS, BELL_READ_WORDS } from "@chanlytics/contracts";
import { askAbout, openAsk } from "../../frame-doors";
import { Button } from "../../kit/button/button";
import { AskFace } from "../../kit/face/ask-face";
import { usePageSearchSaid, type PageSearch } from "../../kit/head/page-search";
import { frameBell, frameChrome, frameGlyph, frameToastHook } from "../frame-window";
import { NotifPopover, type BellNote } from "./notif-popover";

type Flash = (p: FrameFlash) => void;
type Bell = NonNullable<Window["__notifs"]>;

// What Ask said it would come back to, come due (bridge/ask/follow-ups.ts): how many, heard as they are read. The
// capsule draws the kit's dot after its words while there is one, as the kit marks something new there to the reader.
const tbDueNow = () => askCalls()?.followUpsDue?.().length ?? 0;
function TbAskDue() {
  const [due, setDue] = useState(tbDueNow);
  useEffect(() => {
    const hear = () => setDue(tbDueNow());
    hear();
    window.addEventListener("ask:follow-ups", hear);
    return () => window.removeEventListener("ask:follow-ups", hear);
  }, []);
  return due ? (
    <span className="subtab-dot" role="img" aria-label="AI has something ready for you" data-testid="tb-ask-due" />
  ) : null;
}

// The capsule's words: the page's words for Ask where it is about someone (a person's page: "Ask about Emily",
// route-table.tsx drawRoute's `ask`), else Ask's own; then the dot, while a follow-up of Ask's is due. No key beside them
// in either look: the ? sheet is the one place a key is drawn (Ruben, 23 Sep and again 1 Oct 2026).
const tbAskLabel = (label: string | null | undefined) => (
  <>
    <span className="tb-ask-label">{label || BAR_LINE_WORDS.ask}</span>
    <TbAskDue />
  </>
);

/** Ask's face, the three (kit/face/ask-face.tsx): what leads the line, as it led the capsule. */
const tbFace = () => <AskFace className="tb-ask-face" testId="tb-ask-face" />;

/**
 * The page's search as the line (page-search.ts): its words are the page's, so the list narrows as they are typed; Enter,
 * or the line's Ask, asks Ask about them in a conversation of its own, which Ask scopes to the page as ⌘K's would be (a
 * page's own search, ask/line/turns.tsx `fresh`), and empties the line; Esc empties it too, and the page keeps that press only
 * when there was nothing in it to empty (its own Esc: a selection let go).
 */
function TbSearchLine({ search }: { search: PageSearch }) {
  const asked = search.value.trim();
  // The words go to Ask and leave the line, so the list stands whole behind Ask, never narrowed to a question's words.
  const ask = () => {
    if (!asked) return openAsk();
    askAbout({ prompt: asked, fresh: true });
    search.onValue("");
  };
  return (
    <div className="tb-ask tb-line" role="search">
      {tbFace()}
      <input
        ref={search.inputRef}
        className="tb-line-words"
        value={search.value}
        placeholder={search.label}
        aria-label={search.label}
        onChange={(e) => search.onValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            ask();
          } else if (e.key === "Escape" && search.value) {
            e.preventDefault();
            search.onValue("");
          }
        }}
        data-testid={search.testid || "tb-line"}
      />
      {asked ? (
        <Button size="sm" onClick={ask} data-testid="tb-line-ask">
          {BAR_LINE_WORDS.send}
        </Button>
      ) : (
        <TbAskDue />
      )}
    </div>
  );
}

/**
 * Ask in the bar (the page heads canvas, H2, 31 Oct 2026: "one line to search or ask"): on a desk, the line in the bar's
 * middle, where the page's own search stood a row lower in its pane while the middle stood empty; a phone's bar has none,
 * since Ask is the tab bar's circle there (mobile.css). Where the page said a search, the line is it (TbSearchLine); where it
 * said none, the line is Ask's capsule, and a press opens Ask's Line over the page as ⌘K does, where its suggestions and
 * what it holds are.
 */
function TbLine({ onAsk, askLabel }: { onAsk: () => void; askLabel: string | null | undefined }) {
  const search = usePageSearchSaid();
  if (search) return <TbSearchLine search={search} />;
  return (
    <button className="tb-ask" onClick={onAsk} title={BAR_LINE_WORDS.ask} data-testid="tb-ask">
      {tbFace()}
      {tbAskLabel(askLabel)}
    </button>
  );
}

/** The unread rows the real bell does not list (S6-10): its badge counts them, as the bell's number everywhere else does. */
const tbOlderOf = (real: Bell | null) => (real && real.older ? real.older() : 0);

/**
 * The notes that wear a dot, and the older unread ones the bell does not list: what is still unread after a look. A note
 * about what Need you counts wears its dot in the list and is no part of this: the closed bell is for news, and the one
 * count says the rest on the Inbox's badge (decision 0136).
 */
const tbDotsOf = (real: Bell | null, shown: readonly BellNote[]) =>
  shown.filter((n) => n.unread && !n.in_need_you).length + tbOlderOf(real);

/**
 * The bell's number: what is new since the member last looked (the bridge's own count, decision 0124). A bell that says
 * no number of its own is counted by its rows' dots, as it was.
 */
const tbNewOf = (real: Bell | null, shown: readonly BellNote[]) =>
  real && real.unread ? real.unread() : tbDotsOf(real, shown);

/** The workspace's own rows, read again as the bridge's bell changes. */
function useRealBell(real: Bell | null) {
  const [realRows, setRealRows] = useState<BellNote[]>(() => (real ? real.feed() : []));
  useEffect(() => {
    if (!real) return undefined;
    const refresh = () => setRealRows(real.feed());
    refresh();
    return real.onChange(refresh);
  }, [real]);
  return { realRows };
}

const PING_MS = 1200;

/** The bell swings when its number rises: news came in. What needs you raises the one count, on the Inbox's badge. */
function useBellPing(unread: number, real: Bell | null) {
  const [ping, setPing] = useState(false);
  const prevUnread = useRef(unread);
  useEffect(() => {
    if (!real) return undefined;
    if (unread > prevUnread.current) {
      setPing(true);
      const t = setTimeout(() => setPing(false), PING_MS);
      prevUnread.current = unread;
      return () => clearTimeout(t);
    }
    prevUnread.current = unread;
    return undefined;
  }, [unread, real]);
  return ping;
}

interface BellActsAt {
  real: Bell | null;
  realRows: BellNote[];
  flash: Flash;
  closeBell: () => void;
}

/**
 * Mark all read on the workspace's bell: the dots go at once and the toast says how many, beside Undo. A save the server
 * did not take, the read's or the Undo's, is said in the toast's place in a failure's own tone (told from "marked read"
 * across the room, and it stays longer); the dots are back by then.
 */
function readAllOnBell(real: Bell, flash: Flash) {
  const { read, saved, undo } = real.readAll();
  const say = (words: string) => (ok: boolean) => {
    if (!ok) flash({ msg: <>{words}</>, tone: "danger" });
  };
  flash({
    msg: <>{BELL_READ_WORDS.done(read)}</>,
    undo: () => void undo().then(say(BELL_READ_WORDS.undoFailed)),
  });
  void saved.then(say(BELL_READ_WORDS.readFailed));
}

/** A group's notes read by one press: one write where the bridge has it; a stand-in bell reads each. */
const tbReadManyOf =
  (real: Bell | null, read: (id: string) => void) =>
  (ids: readonly string[]): void =>
    real?.readMany ? real.readMany(ids) : ids.forEach(read);

/** What a press in the bell does, on the bridge's rows; with no bell from the bridge there is nothing to press on. */
function bellActs({ real, realRows, flash, closeBell }: BellActsAt) {
  // A note marked read where it stands (its check, or a thumb slid it right).
  const read = (id: string) => {
    real?.read(id);
  };
  const readMany = tbReadManyOf(real, read);
  const act = (id: string, to: string | null) => {
    read(id);
    closeBell();
    if (to) window.CHANLY?.nav?.(to);
  };
  // The foot's door: what reaches you, this browser's alerts among it, is chosen on its page (decision 0136).
  const settings = () => {
    closeBell();
    window.CHANLY?.nav?.("admin/notifications");
  };
  const readAll = () => {
    if (real) readAllOnBell(real, flash);
  };
  const dismiss = (id: string) => {
    if (!real) return;
    const item = realRows.find((n) => n.id === id);
    real.dismiss(id);
    flash({
      msg: (
        <>
          Dismissed <b>“{item ? item.title : "notification"}”</b>
        </>
      ),
      undo: () => real.restore(id),
    });
  };
  return { act, settings, readAll, read, readMany, dismiss };
}

type Crumb = string | { label: string; to?: string; go?: () => void };

/** The crumbs; a crumb may carry the page's own way there (`go`): a person's People is their page's Back. */
const tbCrumbs = (crumbs: readonly Crumb[]) => (
  <div className="crumbs">
    {crumbs.map((c, i) => {
      const label = typeof c === "string" ? c : c.label;
      const to = typeof c === "string" ? null : c.to;
      const last = i === crumbs.length - 1;
      return (
        <Fragment key={i}>
          {i > 0 && <span className="crumb-sep">/</span>}
          {to && !last ? (
            <button
              className="crumb-link"
              onClick={() => (typeof c !== "string" && c.go ? c.go() : window.CHANLY?.nav?.(to))}
              aria-label={typeof c !== "string" && c.go ? `Back to ${label}` : undefined}
            >
              {label}
            </button>
          ) : (
            <span className={last ? "crumb-active" : ""}>{label}</span>
          )}
        </Fragment>
      );
    })}
  </div>
);

/**
 * The bell's words for a pointer: what is new on a workspace, or what is still unread once it has been looked at
 * (contracts BELL_READ_WORDS); before the bridge's bell is in, the quiet words. Nothing where nothing is new or unread: a press of Later
 * handed the keys back to it, and "Nothing needs you right now" popped up over the greeting (9 Nov 2026).
 */
const bellTip = (real: Bell | null, unread: number, dots: number) =>
  real
    ? BELL_READ_WORDS.tip(unread, dots)
    : unread > 0
      ? `${unread} unread · what AI did while you were away`
      : "What AI did while you were away";

// The theme button steps through the preference, System included, and says which is on and what a press makes it (N19).
// The shell's words decide; the standalone mockup, without them, keeps its light and dark flip.
const themeOf = (theme: string, themePref: string) => {
  const chromeWords = frameChrome();
  const next =
    chromeWords && chromeWords.nextTheme ? chromeWords.nextTheme(themePref) : theme === "light" ? "dark" : "light";
  const said =
    chromeWords && chromeWords.themeButton
      ? chromeWords.themeButton(themePref)
      : { icon: theme === "light" ? "moon" : "sun", label: theme === "light" ? "Switch to dark" : "Switch to light" };
  return { next, said };
};

interface TopbarProps {
  crumbs?: readonly Crumb[];
  theme?: string;
  themePref?: string;
  onTheme?: (pref: string) => void;
  onAsk?: () => void;
  askLabel?: string | null;
  onMenu?: () => void;
  right?: ReactNode;
}

/** The bell's state: the server's rows, its unread count, its ping, and what a press in it does. */
function useBell(flash: Flash) {
  const bell = frameBell();
  const real = bell ? bell : null;
  const { realRows } = useRealBell(real);
  const [openNotifs, setOpenNotifs] = useState(false);
  // No bell from the bridge yet: no count, rather than a badge promising things that don't exist.
  const shown: BellNote[] = real ? realRows : [];
  const unread = tbNewOf(real, shown);
  // What still wears a dot: with nothing new, the closed bell says it quietly (decision 0124).
  const dots = tbDotsOf(real, shown);
  const ping = useBellPing(unread, real);
  // The bell's press is the member looking (Today in three zones, 2 Nov 2026): once it closes, what it held is seen,
  // so its number starts again. No note is read by it (decision 0124): a dot goes when its note is opened or by Mark
  // all read. Never on a look at Today alone.
  const closeBell = useCallback(() => {
    setOpenNotifs(false);
    real?.seenAll();
  }, [real]);
  const acts = bellActs({ real, realRows, flash, closeBell });
  return { real, shown, unread, dots, ping, openNotifs, setOpenNotifs, closeBell, acts };
}

type BellState = ReturnType<typeof useBell>;

/** The bell's button, its notes when open, and the theme beside it. */
const tbBell = (b: BellState) => {
  const Glyph = frameGlyph();
  return (
    <>
      <button
        className={`btn btn-ghost btn-icon btn-sm tb-bell ${b.ping ? "ping" : ""}`}
        data-tip={bellTip(b.real, b.unread, b.dots)}
        data-tip-side="bottom"
        // A workspace's bell says what is new, then what is unread.
        aria-label={BELL_READ_WORDS.name(b.real ? b.unread : 0, b.dots)}
        aria-haspopup="dialog"
        aria-expanded={b.openNotifs}
        onClick={() => (b.openNotifs ? b.closeBell() : b.setOpenNotifs(true))}
      >
        <Glyph name="bell" />
        {b.unread > 0 && <span className="tb-bell-badge tally tally-icon">{b.unread}</span>}
        {b.unread === 0 && b.dots > 0 && <span className="tb-bell-unread" aria-hidden="true" />}
      </button>
      {b.openNotifs && (
        <NotifPopover
          items={b.shown}
          onAction={b.acts.act}
          onReadAll={b.acts.readAll}
          onDismiss={b.acts.dismiss}
          onRead={b.acts.read}
          onReadMany={b.acts.readMany}
          onClose={b.closeBell}
          onSettings={b.real ? b.acts.settings : null}
        />
      )}
    </>
  );
};

export function Topbar({
  crumbs = [],
  theme = "light",
  themePref = theme,
  onTheme = () => {},
  onAsk = () => {},
  askLabel,
  onMenu = () => {},
  right = null,
}: TopbarProps) {
  const Glyph = frameGlyph();
  const [toastNode, flash] = (frameToastHook() as NonNullable<Window["usePPToast"]>)();
  const bell = useBell(flash);
  const { next: themeNext, said: themeSaid } = themeOf(theme, themePref);
  return (
    <header className="topbar">
      <button className="btn btn-ghost btn-icon btn-sm tb-menu" title="Menu" aria-label="Menu" onClick={onMenu}>
        <Glyph name="menu" />
      </button>
      {tbCrumbs(crumbs)}

      <div className="topbar-spacer" />

      {/* Ask reads the workspace as the signed-in person (surfaces/ask/). Its icon is
          the three (kit/face/ask-face.tsx), Ask's face: ink at rest, coral and moving while Ask listens, reads or answers, on every
          page. On a desk it stands in the bar's middle, the page's search where the page has one (TbLine). */}
      <TbLine onAsk={onAsk} askLabel={askLabel} />

      {right}

      <div className="tbn-wrap">
        {tbBell(bell)}
        <button
          className="btn btn-ghost btn-icon btn-sm tb-theme"
          title={themeSaid.label}
          aria-label={themeSaid.label}
          onClick={() => onTheme(themeNext)}
        >
          <Glyph name={themeSaid.icon} />
        </button>
      </div>

      {toastNode}
    </header>
  );
}
