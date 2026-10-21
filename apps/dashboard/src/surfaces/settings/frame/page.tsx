/**
 * Settings, the page (moved from legacy/pages/settings.jsx, decision 0015 step 11): its rail, the phone's list of
 * sections, the leave guard, and the pane the route names. Every pane is a module of this surface, imported
 * (settings/<pane>/), and AI memory is a pane that says it is not built.
 */
import { Fragment, useState, useSyncExternalStore, type RefCallback } from "react";
import { CONSOLE_PATH } from "@chanlytics/contracts";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { useSlide } from "../../kit/motion/use-slide";
import { viewDeck } from "../../kit/motion/view-deck";
import { recFolds } from "../../kit/record/registry";
import { RecordRow } from "../../kit/record/row";
import { activity } from "@/legacy-bridge/activity";
import { reachFor } from "@/legacy-bridge/workspace";
import { useLegacyToast, type LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { PaneActivity } from "../activity/pane";
import { PaneAutonomyReal } from "../autonomy/pane";
import { PaneBillingReal } from "../billing/pane";
import { businessGapPane } from "../business/tab";
import { PaneIntegrationsReal } from "../connections/pane";
import { PaneNotificationsReal } from "../notifications/pane";
import { PanePartner } from "../partner/pane";
import { PaneTeam } from "../partner/team-card";
import { PaneProfile } from "../profile/pane";
import { SettingsList } from "./list";
import {
  SETTINGS_PHONE_QUERY,
  SET_TAB,
  SET_TABS,
  SET_TABS_PLATFORM,
  isPlatformAdmin,
  settingsOnPhone,
  settingsRowOf,
  type SetTab,
} from "./tabs";
import { PaneWorkspace, WorkspaceData } from "./workspace";

type Flash = (f: LegacyFlash) => void;

/**
 * A pane whose read is worth starting when the pointer or the keyboard reaches its tab: by the time the click lands,
 * its rows are in hand. The reads share one request with the pane's own (client/api.ts) and no-op once the answer is
 * cached, so this costs nothing a visit was not going to spend.
 */
const WARM: Partial<Record<string, () => void>> = {
  activity: () => activity.warm({}),
  // Connections draws Google's listing, which is read only where it is drawn: reached for, it is read before the press.
  integrations: () => reachFor("admin/integrations"),
};

// ---------- Not built yet: AI memory, said in the pane ----------
// Outside a demo this tab used to fall through the shell's gate, which replaced the WHOLE settings page with a bare
// card and a "Back to Today" button — the owner lost the settings nav for clicking a tab. It is a pane like the others
// now: it says what is true, keeps the nav, and points at the pane that holds what exists instead.
const SET_SOON = {
  memory: {
    title: "AI memory",
    chip: "Not built yet",
    body: "The receptionist does not learn rules on its own yet. Everything it knows comes from your settings: who you are, when you're open, what you offer, the things it should know and what you tell it in your own words.",
    action: { label: "Open How it answers", tab: "receptionist", icon: "chat" },
  },
};

function PaneSoon({ which, onTab }: { which: keyof typeof SET_SOON; onTab: (tab: string) => void }) {
  const m = SET_SOON[which];
  return (
    <section className="rec-card set-card" data-testid={`soon-${which}`}>
      <div className="rec-card-head">
        <h2 className="rec-card-title">{m.title}</h2>
        <span className="rec-card-sub">{m.chip}</span>
      </div>
      <RecordRow
        id={`soon-${which}`}
        label={m.chip}
        value={m.body}
        act={{ label: m.action.label, onClick: () => onTab(m.action.tab) }}
      />
    </section>
  );
}

// The open section's row, brought into view in the rail. A callback ref, not an effect: it runs when a row becomes
// the open one and at no other time.
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

/** The sections this person is offered: Partner only to a partner (or while its page is open), the back office to its few. */
const listedTabs = (partner: boolean, open: string): SetTab[] => [
  ...SET_TABS.filter((t) => !t.partners || partner || open === t.id),
  ...(isPlatformAdmin() ? SET_TABS_PLATFORM : []),
];

/** Kept current as the window changes size: the bare address is the list on a phone and Details on a desk. */
const watchPhone = (fn: () => void): (() => void) => {
  const q = typeof window.matchMedia === "function" ? window.matchMedia(SETTINGS_PHONE_QUERY) : null;
  q?.addEventListener?.("change", fn);
  return () => q?.removeEventListener?.("change", fn);
};
const useSettingsPhone = (): boolean => useSyncExternalStore(watchPhone, settingsOnPhone, () => false);

/** The pane the route names, and the row it names after it: a business page's, Autonomy's, or Activity's part. */
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
      {/* The business, one page per question: Details, Hours & booking and How it answers, over one record. */}
      {(id === "workspace" || id === "hours" || id === "receptionist") && (
        <PaneWorkspace flash={flash} row={row} part={id} />
      )}
      {id === "autonomy" && <PaneAutonomyReal flash={flash} row={row} />}
      {id === "integrations" && <PaneIntegrationsReal />}
      {id === "memory" && <PaneSoon which="memory" onTab={onTab} />}
      {id === "notifications" && <PaneNotificationsReal flash={flash} />}
      {/* The plan, then the workspace's own records: the account itself. */}
      {id === "billing" && (
        <>
          <PaneBillingReal flash={flash} />
          <WorkspaceData />
        </>
      )}
      {id === "platform" && <PaneConsole />}
      {/* Keyed by its row: the rail's Activity after a door to `activity/team` is the whole log again, not the team's. */}
      {id === "activity" && <PaneActivity key={row ?? ""} family={row} />}
    </>
  );
}

/**
 * The back office has its own place now, the Console (decision 0066): one copy, not two. An old address to it here says
 * so and opens it; the rail's row opens it directly.
 */
function PaneConsole() {
  return (
    <section className="rec-card set-card" data-testid="set-console">
      <div className="rec-card-head">
        <h2 className="rec-card-title">The Console</h2>
        <span className="rec-card-sub">Every workspace, support and requests, in their own place</span>
      </div>
      <RecordRow
        id="console"
        label="The Console"
        value="The back office moved to the Console, with Home, Support, Requests and the Admin log beside it."
        act={{ label: "Open the Console", onClick: () => window.location.assign(CONSOLE_PATH) }}
      />
    </section>
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

/** The rail's row for a section: its glyph, its name, and a mark where the business's gap is on its page. */
function SettingsRailRow({ t, on, gap, go }: { t: SetTab; on: boolean; gap: boolean; go: (id: string) => void }) {
  return (
    <LinkButton
      ref={on ? setTabIntoView : undefined}
      className={`fl-agent set-nav-row ${on ? "active" : ""}`}
      aria-current={on ? "page" : undefined}
      onPointerEnter={WARM[t.id]}
      onFocus={WARM[t.id]}
      onClick={() => (t.id === "platform" ? window.location.assign(CONSOLE_PATH) : go(t.id))}
      data-testid={`set-nav-${t.id}`}
    >
      <Icon name={t.icon} size={14} />
      <span className="set-nav-label">{t.label}</span>
      {gap ? <span className="set-nav-gap" role="img" aria-label="Something to add" /> : null}
    </LinkButton>
  );
}

export function SettingsPage({ tab = "", onTab = () => {} }: { tab?: string; onTab?: (tab: string) => void }) {
  // The bare address names no pane: on a desk it is Details, beside the rail; on a phone it is the list of sections.
  const active = SET_TAB(tab || "workspace");
  const phone = useSettingsPhone();
  const listing = phone && !tab;
  // Drawn again as a partner's account and the business's record are read: the rail's Partner and its gap mark.
  const partner = !!useSurface("partner")?.dto;
  useSurface("settings");
  const gapPane = businessGapPane();
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
  const listed = listedTabs(partner, active.id);
  const groups = groupsOf(listed);
  // A section is a view of this page: its pane is replaced as the section changes (keyed by it), registers with the
  // deck every change of view moves by (kit/motion/view-deck.ts) and says which side it arrives from, by where the two
  // sections stand in the rail. The frame's own view never changes here: every section is one mount of this page.
  const slide = useSlide(
    listed.map((t) => t.id),
    active.id,
  );
  // On a phone Settings opens on its sections, grouped as the rail groups them, and each opens as a page of its own
  // whose way back is this list (tabs.ts settingsCrumbs). The strip of nine tabs it replaces ran off the screen, and
  // its way back opened Business again (17 Oct 2026).
  if (listing) {
    return (
      <div className="settings settings-listing">
        <SettingsList groups={groups} gapPane={gapPane} onTab={onTab} warm={WARM} />
        {toastNode}
      </div>
    );
  }
  return (
    <div className="settings">
      <aside className="set-nav">
        <div className="fl-roster-head">
          <span className="fl-roster-label">Settings</span>
        </div>
        {groups.map((g) => (
          <Fragment key={g.name}>
            <div className="set-nav-group">{g.name}</div>
            {g.tabs.map((t) => (
              <SettingsRailRow key={t.id} t={t} on={active.id === t.id} gap={gapPane === t.id} go={go} />
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
