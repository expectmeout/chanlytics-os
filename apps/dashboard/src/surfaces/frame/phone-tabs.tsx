/**
 * The phone's tab bar (moved from legacy/pages/app-shell.jsx, the one-system plan's step 7e). On a phone the drawer hid
 * the four places an owner actually goes behind a menu button: a bar at the thumb instead (the kit's TabBar), with the
 * count that matters on the salon floor, what needs you. Rendered always, shown only under the phone breakpoint (mobile.css
 * .phone-places). A place holds its pages (`holds`): lit on every page it holds, and pressed there again it goes back to
 * its first page, or up to the top of that page when it is on it already, as a phone's tab bar does.
 */
import { useEffect } from "react";
import type { TabBar } from "../kit/tab-bar/tab-bar";
import { frameGlyph, fromGlobal } from "./frame-window";
import { PHONE_MORE, PHONE_TABS } from "./places";
import { pageToTop } from "./shell-hooks";
import { shellAddress } from "./shell-routes";

interface PhoneTabsProps {
  page: string;
  param: string | null;
  inboxNeeds: number;
  onNavigate: (to: string) => void;
  onMenu: () => void;
  onPlace: () => void;
}

/**
 * The tab bar's places, drawn by the kit (TabBar: it lights a place and moves its lozenge as the finger lands, then asks
 * for the place a painted frame on). A place another holds is moved to with the page cut in (`onPlace`); the place on
 * screen pressed again goes to its first page, or to the top.
 */
export function PhoneTabs({ page, param, inboxNeeds, onNavigate, onMenu, onPlace }: PhoneTabsProps) {
  // The four places a thumb goes, kept warm: warmed once the page is idle, again when the tab comes back to the screen or
  // is first pressed after the router let them go, and when a finger reaches one (workspace.ts keepWarm, warmRoute).
  useEffect(() => {
    const a = shellAddress();
    if (a && a.keepWarm) a.keepWarm(PHONE_TABS.map((t) => t.route));
  }, [page]);
  const Glyph = frameGlyph();
  const Bar = fromGlobal<typeof TabBar | null>("TabBar", null);
  const warm = (route: string) => {
    const a = shellAddress();
    if (a && a.warm) a.warm(route);
  };
  const href = (route: string) => {
    const a = shellAddress();
    return a && a.href ? a.href(route) : `#/${route}`;
  };
  const here = PHONE_TABS.find((t) => t.holds.includes(page)) || null;
  const pick = (id: string) => {
    const t = PHONE_TABS.find((x) => x.id === id);
    if (!t) return;
    if (here && here.id === t.id) {
      if (page === t.route && !param) pageToTop();
      else onNavigate(t.route);
      return;
    }
    onPlace();
    onNavigate(t.route);
  };
  if (!Bar) return null;
  return (
    <Bar
      label="Main"
      testid="phone-tabs"
      className="phone-places"
      picked={here ? here.id : null}
      places={PHONE_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        href: href(t.route),
        glyph: <Glyph name={t.icon} size={18} />,
        // Only the Inbox has a count, and it counts people who need you: amber, as the sidebar's is.
        count: t.id === "inbox" && inboxNeeds > 0 ? inboxNeeds : null,
        tone: t.id === "inbox" ? "warn" : undefined,
        warm: () => warm(t.route),
      }))}
      onPick={pick}
      more={{
        label: PHONE_MORE.label,
        word: PHONE_MORE.word,
        glyph: <Glyph name={PHONE_MORE.icon} size={18} />,
        onPress: onMenu,
      }}
    />
  );
}
