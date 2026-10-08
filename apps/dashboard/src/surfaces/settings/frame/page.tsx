/**
 * Settings, the page (moved from legacy/pages/settings.jsx, decision 0015 step 11): its rail, the phone's strip, the
 * leave guard, and the pane the route names. Every pane is a module of this surface, imported (settings/<pane>/), and AI
 * memory is a pane that says it is not built.
 */
import { Fragment, useState, type RefCallback } from "react";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { useSlide } from "../../kit/motion/use-slide";
import { viewDeck } from "../../kit/motion/view-deck";
import { recFolds } from "../../kit/record/registry";
import { ViewTabs } from "../../kit/view-tabs/view-tabs";
import { activity } from "@/legacy-bridge/activity";
import { backOffice } from "@/legacy-bridge/platform";
import { hrefOfRoute } from "@/legacy-bridge/workspace";
import { useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { PaneActivity } from "../activity/pane";
import { PaneAutonomyReal } from "../autonomy/pane";
import { PaneBillingReal } from "../billing/pane";
import { PaneIntegrationsReal } from "../connections/pane";
import { PaneNotificationsReal } from "../notifications/pane";
import { PanePartner } from "../partner/pane";
import { PaneTeam } from "../partner/team-card";
import { PanePlatform } from "../platform/pane";
import { PaneProfile } from "../profile/pane";
import { SET_TAB, SET_TABS, SET_TABS_PLATFORM, isPlatformAdmin, settingsRowOf, type SetTab } from "./tabs";
import { PaneWorkspace } from "./workspace";

type Flash = (f: LegacyFlash) => void;

/**
 * A pane whose read is worth starting when the pointer or the keyboard reaches its tab: by the time the click lands,
 * its rows are in hand. The reads share one request with the pane's own (client/api.ts) and no-op once the answer is
 * cached, so this costs nothing a visit was not going to spend.
 */
const WARM: Partial<Record<string, () => void>> = {
  activity: () => activity.warm({}),
  platform: () => backOffice.verbs.warmList?.(),
};

// ---------- Not built yet: AI memory, said in the pane ----------
// Outside a demo this tab used to fall through the shell's gate, which replaced the WHOLE settings page with a bare
// card and a "Back to Today" button — the owner lost the settings nav for clicking a tab. It is a pane like the others
// now: it says what is true, keeps the nav, and points at the pane that holds what exists instead.
const SET_SOON = {
  memory: {
    title: "AI memory",
    chip: "Not built yet",
    body: "The receptionist does not learn rules on its own yet. Everything it knows comes from Business: who you are, when you're open, what you offer, the things it should know and what you tell it in your own words.",
    action: { label: "Open Business", tab: "workspace", icon: "home" },
  },
};

function PaneSoon({ which, onTab }: { which: keyof typeof SET_SOON; onTab: (tab: string) => void }) {
  const m = SET_SOON[which];
  return (
    <section className="fl-card set-card" data-testid={`soon-${which}`}>
      <div className="fl-card-head">
        <h2 className="fl-card-title">{m.title}</h2>
        <span className="fl-card-sub">{m.chip}</span>
      </div>
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint">{m.body}</span>
        </div>
        <button className="btn btn-sm" onClick={() => onTab(m.action.tab)}>
          <Icon name={m.action.icon} size={12} /> {m.action.label}
        </button>
      </div>
    </section>
  );
}

// The open section's row, brought into view in the rail. A callback ref, not an effect: it runs when a row becomes
// the open one and at no other time. (On a phone the sections are the kit's strip, which keeps its own picked tab in view.)
const setTabIntoView: RefCallback<HTMLButtonElement> = (el) => {
  if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest", inline: "center" });
};

/** The rail's groups, derived rather than written twice: the rail can only ever offer what the tabs hold, in order. */
const groupsOf = (listed: readonly SetTab[]) =>
  listed.reduce<{ name: string | undefined; tabs: SetTab[] }[]>((acc, t) => {
    const g = acc[acc.length - 1];
    if (g && g.name === t.group) g.tabs.push(t);
    else acc.push({ name: t.group, tabs: [t] });
    return acc;
  }, []);

/** The pane the route names, and for Business the row it names after it (tabs.ts settingsRowOf). */
function SetPane({
  id,
  row,
  flash,
  onTab,
}: {
  id: string;
  row: string | null;
  flash: Flash;
  onTab: (tab: string) => void;
}) {
  return (
    <>
      {id === "profile" && <PaneProfile flash={flash} />}
      {id === "partner" && <PanePartner flash={flash} />}
      {id === "team" && <PaneTeam flash={flash} />}
      {id === "workspace" && <PaneWorkspace flash={flash} row={row} />}
      {id === "autonomy" && <PaneAutonomyReal flash={flash} />}
      {id === "integrations" && <PaneIntegrationsReal />}
      {id === "memory" && <PaneSoon which="memory" onTab={onTab} />}
      {id === "notifications" && <PaneNotificationsReal flash={flash} />}
      {id === "billing" && <PaneBillingReal flash={flash} />}
      {id === "platform" && <PanePlatform />}
      {id === "activity" && <PaneActivity />}
    </>
  );
}

/** The leave guard: asked before a pane, and the changes in it, are replaced. */
function LeaveAsk({
  leaving,
  onYes,
  onNo,
}: {
  leaving: { id: string; saving: boolean };
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <Confirm
      question={leaving.saving ? "Leave while this saves?" : "Leave without saving?"}
      detail={
        leaving.saving
          ? "Your change is on its way and carries on without this page. If it does not go through you are told, and what you typed is not kept."
          : "Nothing you changed on this tab has been saved."
      }
      yes="Yes, leave"
      no="Stay"
      discard={!leaving.saving}
      onYes={onYes}
      onNo={onNo}
      testid="set-leave"
    />
  );
}

export function SettingsPage({ tab = "workspace", onTab = () => {} }: { tab?: string; onTab?: (tab: string) => void }) {
  const active = SET_TAB(tab);
  const [toastNode, flash] = useLegacyToast();
  // The tab asked for while a pane holds unsaved changes (the fold registry answers: the record kit's open fold, whatever
  // pane drew it): the rail asks before the pane, and the changes with it, are replaced (S22). And while a fold's save is
  // out it asks in other words, kept from the moment it asked: "Leave without saving?" is untrue of a change on its way
  // to the server, and a yes never stopped the save.
  const [leaving, setLeaving] = useState<{ id: string; saving: boolean } | null>(null);
  const go = (id: string) => {
    if (id !== active.id && (recFolds.dirty() || recFolds.saving())) {
      setLeaving({ id, saving: recFolds.saving() });
      return;
    }
    onTab(id);
  };
  const listed = [...SET_TABS, ...(isPlatformAdmin() ? SET_TABS_PLATFORM : [])];
  const groups = groupsOf(listed);
  // A section is a view of this page: its pane is replaced as the section changes (keyed by it), registers with the
  // deck every change of view moves by (kit/motion/view-deck.ts) and says which side it arrives from, by where the two
  // sections stand in the rail. The frame's own view never changes here: every section is one mount of this page.
  const slide = useSlide(
    listed.map((t) => t.id),
    active.id,
  );
  return (
    <div className="settings">
      {/* On a phone the sections are every page's strip, the kit's: a section has an address, so a tab is a link, a press
          starts the pane leaving, and a swipe across the pane walks them (the shell's stripSwipe). A pane holding unsaved
          work is not left until the page has asked. The desk keeps its rail. */}
      <ViewTabs
        name="settings"
        label="Settings sections"
        picked={active.id}
        tabs={listed.map((t) => ({ id: t.id, label: t.label, href: hrefOfRoute(`admin/${t.id}`), warm: WARM[t.id] }))}
        onPick={go}
        mayLeave={() => !(recFolds.dirty() || recFolds.saving())}
      />
      <aside className="set-nav">
        <div className="fl-roster-head">
          <span className="fl-roster-label">Settings</span>
        </div>
        {groups.map((g) => (
          <Fragment key={g.name}>
            <div className="set-nav-group">{g.name}</div>
            {g.tabs.map((t) => (
              <button
                key={t.id}
                ref={active.id === t.id ? setTabIntoView : undefined}
                className={`fl-agent set-nav-row ${active.id === t.id ? "active" : ""}`}
                aria-current={active.id === t.id ? "page" : undefined}
                onPointerEnter={WARM[t.id]}
                onFocus={WARM[t.id]}
                onClick={() => go(t.id)}
              >
                <Icon name={t.icon} size={14} />
                <span className="set-nav-label">{t.label}</span>
              </button>
            ))}
          </Fragment>
        ))}
      </aside>
      <div className="set-pane" key={active.id} ref={viewDeck.view("settings")} data-slide={slide}>
        {leaving && (
          <LeaveAsk
            leaving={leaving}
            onYes={() => {
              const to = leaving.id;
              setLeaving(null);
              onTab(to);
            }}
            onNo={() => setLeaving(null)}
          />
        )}
        <SetPane id={active.id} row={settingsRowOf(tab)} flash={flash} onTab={onTab} />
      </div>

      {toastNode}
    </div>
  );
}
