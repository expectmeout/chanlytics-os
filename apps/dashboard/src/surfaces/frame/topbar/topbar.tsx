/**
 * The top bar (moved from legacy/components/topbar.jsx, the one-system plan's step 7d): the menu, the crumbs, Ask's
 * button, the demo's presence, the bell with its notes (notif-popover.tsx) and the theme. Outside a demo the bell reads the
 * workspace's own rows through the bridge (legacy-bridge/notifications.ts): who needs you, a draft waiting, a missed call,
 * an open invitation; read state is this device's. In a demo it draws the seeded notes (bell-demo.tsx). The frame's JSX
 * draws it by its old name (`Topbar`, frame-globals.ts) until the frame itself is TypeScript (step 7e). Drawn as the JSX
 * drew it, raw buttons and all, until the frame's kit step.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { LegacyFlash } from "../../legacy-verbs";
import type { DemoNote } from "./bell-demo";
import { tbOverlay, useDemoBell, useDemoPresence } from "./bell-demo-acts";
import { BAR_LINE_WORDS } from "@chanlytics/contracts";
import { askAbout, openAsk } from "../../frame-doors";
import { Button } from "../../kit/button/button";
import { usePageSearchSaid, type PageSearch } from "../../page-search";
import { frameBell, frameChrome, frameGlyph, frameMoreMenu, frameToastHook, isDemoFrame } from "../frame-window";
import { NotifPopover, type BellAlerts, type BellNote } from "./notif-popover";

type Flash = (p: LegacyFlash) => void;
type Bell = NonNullable<Window["__notifs"]>;

// What Ask said it would come back to, come due (legacy-bridge/ask/follow-ups.ts): how many, heard as they are read. The
// capsule draws the kit's dot after its words while there is one, as the kit marks something new there to the reader.
const tbDueNow = () => (window.__ask && window.__ask.followUpsDue ? window.__ask.followUpsDue().length : 0);
function TbAskDue() {
  const [due, setDue] = useState(tbDueNow);
  useEffect(() => {
    const hear = () => setDue(tbDueNow());
    hear();
    window.addEventListener("ask:follow-ups", hear);
    return () => window.removeEventListener("ask:follow-ups", hear);
  }, []);
  return due ? (
    <span className="subtab-dot" role="img" aria-label="Ask has something ready for you" data-testid="tb-ask-due" />
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

/** Ask's face, the three (ask-face.jsx), or the sparkle where they are not loaded: what leads the line, as it led the capsule. */
const tbFace = () => {
  const TbFace = window.AskFace || null;
  const Glyph = frameGlyph();
  return TbFace ? <TbFace className="tb-ask-face" testId="tb-ask-face" /> : <Glyph name="sparkle" size={13} />;
};

/**
 * The page's search as the line (page-search.ts): its words are the page's, so the list narrows as they are typed; Enter,
 * or the line's Ask, asks Ask about them in a conversation of its own, which Ask scopes to the page as ⌘K's would be (a
 * page's own search, ask-real.jsx `fresh`), and empties the line; Esc empties it too, and the page keeps that press only
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

/** The workspace's own rows and this device's alerts, read again as the bridge's bell changes. */
function useRealBell(real: Bell | null) {
  const [realRows, setRealRows] = useState<BellNote[]>(() => (real ? real.feed() : []));
  const [alertState, setAlertState] = useState<BellAlerts | null>(() => (real ? real.alerts() : null));
  useEffect(() => {
    if (!real) return undefined;
    const refresh = () => {
      setRealRows(real.feed());
      setAlertState(real.alerts());
    };
    refresh();
    return real.onChange(refresh);
  }, [real]);
  return { realRows, alertState, setAlertState };
}

const PING_MS = 1200;

/**
 * The bell swings when something new needs you (the real feed), and once when a session push lands in the demo's (or an
 * item updates in place).
 */
function useBellPing(unread: number, real: Bell | null, notifs: readonly DemoNote[]) {
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
  const pingKey = useRef<string | null>(null);
  useEffect(() => {
    const f = notifs[0] || notifs.find((n) => n.time === "now");
    if (!f || f.time !== "now") return undefined;
    const key = f.id + "|" + f.title;
    if (pingKey.current === key) return undefined;
    pingKey.current = key;
    setPing(true);
    const t = setTimeout(() => setPing(false), PING_MS);
    return () => clearTimeout(t);
  }, [notifs]);
  return ping;
}

interface BellActsAt {
  real: Bell | null;
  notifs: DemoNote[];
  setNotifs: Dispatch<SetStateAction<DemoNote[]>>;
  realRows: BellNote[];
  setAlertState: (a: BellAlerts | null) => void;
  flash: Flash;
  closeBell: () => void;
}

/** A dismissed seeded note, put back where it stood. */
const putBack = (item: DemoNote, idx: number) => (list: DemoNote[]) => {
  const next = [...list];
  next.splice(Math.min(idx, next.length), 0, item);
  return next;
};

/** What a press in the bell does: on the bridge's rows where the workspace has them, else on the seeded notes. */
function bellActs({ real, notifs, setNotifs, realRows, setAlertState, flash, closeBell }: BellActsAt) {
  const markRead = (id: string) => setNotifs((list) => list.map((n) => (n.id === id ? { ...n, unread: false } : n)));
  // A note marked read where it stands (a thumb slid it right): the bridge's mark, or the seeded note's flag.
  const read = (id: string) => (real ? real.read(id) : markRead(id));
  const act = (id: string, to: string | null) => {
    read(id);
    closeBell();
    if (to) window.CHANLY?.nav?.(to);
  };
  const onAlerts = async (on: boolean) => {
    if (!real) return;
    const r = await real.setAlerts(on);
    setAlertState(real.alerts());
    flash({
      msg: r.on ? (
        <>This device will be alerted when something needs you</>
      ) : r.permission === "denied" ? (
        <>Alerts are blocked in your browser settings</>
      ) : (
        <>Alerts off on this device</>
      ),
    });
  };
  const readAll = () => {
    if (real) {
      real.seenAll();
      flash({ msg: <>All caught up</> });
      return;
    }
    const prev = notifs;
    setNotifs((list) => list.map((n) => ({ ...n, unread: false })));
    flash({ msg: <>All notifications marked read</>, undo: () => setNotifs(prev) });
  };
  const dismiss = (id: string) => {
    if (real) {
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
      return;
    }
    const idx = notifs.findIndex((n) => n.id === id);
    const item = notifs[idx];
    if (!item) return;
    setNotifs((list) => list.filter((n) => n.id !== id));
    flash({
      msg: (
        <>
          Dismissed <b>“{item.title.split(" — ")[0]}”</b>
        </>
      ),
      undo: () => setNotifs(putBack(item, idx)),
    });
  };
  return { act, onAlerts, readAll, read, dismiss };
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

/** Presence is the mockup's: a real workspace has no away timer or transfer line yet, so the control would change nothing. */
const tbPresence = () => {
  const Menu = frameMoreMenu();
  const pr = window.PR_STORE;
  if (!pr) return null;
  return (
    <Menu
      btnClass="btn btn-ghost btn-sm tb-presence"
      title="Presence — gates transfers and veto timers"
      label={
        <>
          <span className={`tb-pres-dot ${pr.away ? "away" : pr.transfers ? "" : "off"}`}></span>{" "}
          {pr.away ? "Away" : "Available"}
        </>
      }
      items={[
        {
          header: pr.away
            ? "Away — veto timers paused · holding line"
            : "Available — timers run · transfers " + (pr.transfers ? "on" : "off"),
        },
        { label: "Available", icon: "check", onClick: () => pr.setAway(false), meta: pr.away ? "" : "current" },
        { label: "Away", icon: "pause", onClick: () => pr.setAway(true), meta: pr.away ? "current" : "" },
        { divider: true },
        {
          label: pr.transfers ? "Transfers: on" : "Transfers: off",
          icon: "phone",
          meta: pr.away ? "holding line while Away" : "flip it",
          onClick: () => pr.setTransfers(!pr.transfers),
        },
      ]}
    />
  );
};

/** The bell's words for a pointer: what needs you on a workspace, what agents did in the demo. */
const bellTip = (real: Bell | null, unread: number) =>
  real
    ? unread > 0
      ? `${unread} new — what needs you`
      : "Nothing needs you right now"
    : unread > 0
      ? `${unread} unread — what agents did while you weren't looking`
      : "What agents did while you weren't looking";

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

/** The bell's state: the server's rows or the seeded notes, its unread count, its ping, and what a press in it does. */
function useBell(flash: Flash) {
  const [notifs, setNotifs] = useDemoBell();
  const bell = frameBell();
  const real = !isDemoFrame() && bell ? bell : null;
  const { realRows, alertState, setAlertState } = useRealBell(real);
  const [openNotifs, setOpenNotifs] = useState(false);
  useDemoPresence(flash);
  // The seeded feed is demo theater: outside a demo we show no count rather than a badge promising things that don't exist.
  const shown: BellNote[] = real ? realRows : isDemoFrame() ? notifs.map(tbOverlay) : [];
  const unread = shown.filter((n) => n.unread).length + tbOlderOf(real);
  const ping = useBellPing(unread, real, notifs);
  const closeBell = useCallback(() => setOpenNotifs(false), []);
  const acts = bellActs({ real, notifs, setNotifs, realRows, setAlertState, flash, closeBell });
  return { real, shown, unread, ping, openNotifs, setOpenNotifs, closeBell, alertState, acts };
}

type BellState = ReturnType<typeof useBell>;

/** The bell's button, its notes when open, and the theme beside it. */
const tbBell = (b: BellState) => {
  const Glyph = frameGlyph();
  return (
    <>
      <button
        className={`btn btn-ghost btn-icon btn-sm tb-bell ${b.ping ? "ping" : ""}`}
        data-tip={bellTip(b.real, b.unread)}
        data-tip-side="bottom"
        aria-label={b.unread > 0 ? `Notifications, ${b.unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={b.openNotifs}
        onClick={() => b.setOpenNotifs((v) => !v)}
      >
        <Glyph name="bell" />
        {b.unread > 0 && <span className="tb-bell-badge tally tally-icon">{b.unread}</span>}
      </button>
      {b.openNotifs && (
        <NotifPopover
          items={b.shown}
          onAction={b.acts.act}
          onReadAll={b.acts.readAll}
          onDismiss={b.acts.dismiss}
          onRead={b.acts.read}
          onClose={b.closeBell}
          alerts={b.real ? b.alertState : null}
          onAlerts={b.acts.onAlerts}
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

      {/* Ask reads the workspace as the signed-in person (ask-real.jsx); in a demo it answers the seed world. Its icon is
          the three (ask-face.jsx), Ask's face: ink at rest, coral and moving while Ask listens, reads or answers, on every
          page. On a desk it stands in the bar's middle, the page's search where the page has one (TbLine). */}
      <TbLine onAsk={onAsk} askLabel={askLabel} />

      {right}

      <div className="tbn-wrap">
        {isDemoFrame() && tbPresence()}
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
