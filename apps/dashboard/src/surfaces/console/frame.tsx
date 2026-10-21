/**
 * The Console (decision 0066): the platform's own place, at /console. Its rail (Chanlytics, Console; Find; the screens
 * in their groups; who you are, your role and your second factor), and the screen its address names.
 *
 * Nothing here decides who may look. The frame asks who is looking (GET platform/me): everybody but the platform's staff
 * is told there is no such page, as any unknown address is; staff who have not shown their second factor this session
 * are sent to the second step by the client (legacy-bridge/api.ts), which brings them back here. Each screen reads its
 * own rows on demand, and each act asks why before it runs.
 */
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  CONSOLE_PATH,
  CONSOLE_SCREENS,
  CONSOLE_SCREEN_WORDS,
  CONSOLE_WORDS,
  STAFF_ROLE_WORDS,
  consoleAddressOf,
  consolePathOf,
  staffSeesScreen,
  type ConsoleAddress,
  type ConsoleScreen,
} from "@chanlytics/contracts";
import { Icon } from "../kit/icon/icon";
import { LinkButton } from "../kit/link-button/link-button";
import { useLegacyToast } from "../legacy-verbs";
import { FindSheet } from "./find";
import { HealthScreen } from "./health/health";
import { HomeScreen } from "./home";
import { LogScreen } from "./log";
import { PartnersScreen } from "./partners";
import { RequestsScreen } from "./requests";
import { ScreenFailed, ScreenReading, useConsoleRead, type Flash, type Go } from "./parts";
import { SupportScreen } from "./support";
import { consoleVerbs, type ConsoleMe } from "./verbs";
import { WorkspaceScreen } from "./workspace";
import { WorkspacesScreen } from "./workspaces";

/** The rail's groups, in the screens' order. */
const GROUPS = CONSOLE_SCREENS.reduce<{ name: string; screens: ConsoleScreen[] }[]>((acc, s) => {
  const name = CONSOLE_SCREEN_WORDS[s].group;
  const last = acc[acc.length - 1];
  if (last && last.name === name) last.screens.push(s);
  else acc.push({ name, screens: [s] });
  return acc;
}, []);

/** A move inside the Console: a pushed entry, which the page's address follows. */
const go: Go = (path) => {
  if (window.location.pathname !== path) window.history.pushState(null, "", path);
};

/** The rail draws Find, and the screens the role sees. */
function ConsoleRail({ screen, me, onFind }: { screen: ConsoleScreen; me: ConsoleMe; onFind: () => void }) {
  const groups = GROUPS.map((g) => ({ ...g, screens: g.screens.filter((s) => staffSeesScreen(me.role, s)) })).filter(
    (g) => g.screens.length > 0,
  );
  return (
    <aside className="set-nav cs-rail" aria-label={CONSOLE_WORDS.badge}>
      <div className="cs-brand">
        <span className="cs-brand-name">{CONSOLE_WORDS.brand}</span>
        <span className="cs-brand-kind">{CONSOLE_WORDS.badge}</span>
      </div>
      <LinkButton className="fl-agent set-nav-row cs-find" onClick={onFind} data-testid="console-find-open">
        <Icon name="search" size={14} />
        <span className="set-nav-label">{CONSOLE_WORDS.find}</span>
        <kbd className="cs-key">⌘K</kbd>
      </LinkButton>
      {groups.map((g) => (
        <Fragment key={g.name}>
          <div className="set-nav-group">{g.name}</div>
          {g.screens.map((s) => (
            <LinkButton
              key={s}
              className={`fl-agent set-nav-row ${screen === s ? "active" : ""}`}
              aria-current={screen === s ? "page" : undefined}
              onClick={() => go(consolePathOf(s))}
              data-testid={`console-nav-${s}`}
            >
              <Icon name={CONSOLE_SCREEN_WORDS[s].icon} size={14} />
              <span className="set-nav-label">{CONSOLE_SCREEN_WORDS[s].label}</span>
            </LinkButton>
          ))}
        </Fragment>
      ))}
      <div className="cs-me" data-testid="console-me">
        <span className="cs-me-name">{me.name}</span>
        <span className="cs-me-role">
          {STAFF_ROLE_WORDS[me.role]} · {CONSOLE_WORDS.secondFactorOn}
        </span>
        <LinkButton onClick={() => window.location.assign("/")} data-testid="console-open-app">
          {CONSOLE_WORDS.openApp}
        </LinkButton>
      </div>
    </aside>
  );
}

/** The screen an address names; Health reads its part from the rest of the address. */
function Screen({
  address,
  pathname,
  me,
  flash,
}: {
  address: ConsoleAddress;
  pathname: string;
  me: ConsoleMe;
  flash: Flash;
}) {
  switch (address.screen) {
    case "home":
      return <HomeScreen me={me} go={go} flash={flash} />;
    case "workspaces":
      return address.slug ? (
        <WorkspaceScreen slug={address.slug} tab={address.tab} me={me} go={go} flash={flash} />
      ) : (
        <WorkspacesScreen go={go} flash={flash} />
      );
    case "support":
      return <SupportScreen me={me} go={go} flash={flash} />;
    case "requests":
      return <RequestsScreen me={me} go={go} flash={flash} />;
    case "partners":
      return <PartnersScreen me={me} flash={flash} />;
    case "health":
      return <HealthScreen me={me} go={go} flash={flash} pathname={pathname} />;
    case "log":
      return <LogScreen me={me} go={go} />;
  }
}

/** /console and every address under it: the frame, once who is looking is known. */
export function ConsoleRoute({ pathname }: { pathname: string }) {
  const address = consoleAddressOf(pathname || CONSOLE_PATH);
  const me = useConsoleRead(consoleVerbs.me, "me");
  const [finding, setFinding] = useState(false);
  const [toastNode, flash] = useLegacyToast();
  const openFind = useCallback(() => setFinding(true), []);
  // ⌘K (Ctrl+K off a Mac) opens Find from anywhere in the Console, as the rail's row says.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFinding(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!me.data) {
    if (me.missing)
      return (
        <main className="cs-nothing" data-testid="console-no-such-page">
          <h1>No such page</h1>
          <LinkButton onClick={() => window.location.assign("/")}>{CONSOLE_WORDS.openApp}</LinkButton>
        </main>
      );
    return (
      <main className="cs-nothing">
        {me.problem ? (
          <ScreenFailed what="the Console" why={me.problem} busy={me.busy} again={me.again} testid="console-failed" />
        ) : (
          <ScreenReading />
        )}
      </main>
    );
  }
  // A screen the role does not see opens Home, as a mistyped address does: its rail has no row for it.
  const shown = staffSeesScreen(me.data.role, address.screen) ? address : consoleAddressOf(CONSOLE_PATH);
  return (
    <div className="settings cs-frame" data-testid="console">
      <ConsoleRail screen={shown.screen} me={me.data} onFind={openFind} />
      <main className="set-pane cs-pane" key={`${shown.screen}/${shown.slug ?? ""}`}>
        <Screen address={shown} pathname={pathname} me={me.data} flash={flash} />
      </main>
      <FindSheet open={finding} onClose={() => setFinding(false)} go={go} />
      {toastNode}
    </div>
  );
}
