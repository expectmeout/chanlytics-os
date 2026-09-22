/**
 * The standalone mockup as a signed-in workspace's Settings › Business.
 *
 * The shell's globals and the tab's, as the bridge publishes them (legacy-bridge/business-tab.ts installBusinessTab,
 * zone.ts installClock, identity.ts, seed-globals.ts and inbox-verbs.ts' own), and window.__SETTINGS / window.__FACTS
 * built from the scenario the way legacy-bridge/surface-data.ts's settings apply builds them -- through the same
 * contracts functions, from this worktree's SOURCE. The server bundles this with the scenario's own object as a
 * banner (window.__HX_SCENARIO) and puts it FIRST in the document's head, before data/bridge-stubs.jsx, which writes
 * only what is missing. The server answers the spec's reads from that same object, so the page and the spec see one
 * record.
 *
 * The preview beside the config is composed here rather than imported: apps/dashboard/src/server/prompt-preview.ts
 * opens with `import "server-only"` and pulls in @chanlytics/db, neither of which belongs in a browser bundle. The
 * three lines it is are written out below, from the same contracts functions the server calls.
 *
 * Nothing here saves. __saveSettings and __workspace.setTimezone refuse, so a spec that ever pressed a Save would see
 * the refusal on the page instead of quietly writing to a scenario.
 */
import * as C from "@chanlytics/contracts";
import { installClock } from "@/legacy-bridge/zone";
import { installBusinessTab } from "@/legacy-bridge/business-tab";

interface Scenario {
  name: string;
  zone: string;
  brain: C.BrainConfig;
  calendar: { ical_url: string } | null;
  known: C.KnownFacts;
  version: number;
  role: string;
}

const w = window as unknown as Record<string, any>;
const S = w.__HX_SCENARIO as Scenario;
const WORKSPACE = w.__HX_WORKSPACE as { id: string; slug: string; name: string };
const zone = S.zone;

/* ---- the shell ---- */
w.__DEMO_MODE = false;
w.__WORKSPACES = [{ id: WORKSPACE.id, slug: WORKSPACE.slug, name: WORKSPACE.name, status: "active", timezone: zone }];
w.__ACTIVE_WORKSPACE = WORKSPACE.id;
w.__ME = {
  id: "u-e2e-owner",
  display_name: "E2E Owner",
  name: "E2E Owner",
  email: "e2e-owner@example.com",
  role: "owner",
  platform_admin: false,
};
installClock();
w.__chrome = {
  themes: C.THEME_OPTIONS,
  shortcuts: C.SHORTCUTS,
  shortcutGroups: C.shortcutGroups,
  statusLine: C.shellStatusLine,
  liveBar: C.liveBar,
  liveStillUp: C.liveStillUp,
  fmtClock: C.fmtClock,
  title: C.pageTitle,
  workspaceHotkey: C.workspaceHotkey,
  toast: C.toastShape,
  state: C.stateOf,
  typing: (t: EventTarget | null) => C.isTypingTarget(t as Element),
};

/* ---- the tab's own helpers (legacy-bridge/business-tab.ts): __businessTab, __hoursLines, __configLimits ---- */
installBusinessTab();

/* ---- identity.ts, seed-globals.ts and inbox-verbs.ts, as the unit harness publishes them ---- */
w.__identity = { words: C.identityWords, member: C.memberWords, initials: C.personInitials };
w.__tz = { words: C.timezoneWords, city: C.timezoneCity, known: C.knownTimezones, device: C.usableDeviceTimezone };
w.DEFAULT_TIMEZONE = C.DEFAULT_TIMEZONE;
w.__phoneDisplay = C.formatPhoneDisplay;
w.__whyNotAPhone = C.whyNotAPhone;
w.__whyNotAHandoff = C.whyNotAHandoff;
w.__samePhone = C.samePhone;
w.__handoffE = C.handoffE164;
w.__roleGate = C.roleGate;
w.__receptionistDefaults = C.newReceptionistDefaults;
w.__instructionsDraft = C.instructionsDraft;
w.__instructionsMax = C.INSTRUCTIONS_MAX;
w.__fallbackMessages = C.fallbackMessages;
w.__fallbackDefaults = C.FALLBACK_DEFAULTS;
w.__unknownDetails = C.unknownDetails;
w.__lastChanged = () => "Last changed by E2E Owner";
// The workspace's zone is saved through PATCH workspaces, never the settings saver. Refused here.
w.__workspace = { setTimezone: async () => ({ ok: false, tz: "", message: "The harness never saves." }) };
w.__saveSettings = () => Promise.resolve({ ok: false, code: "refused", message: "The harness never saves." });

/* ---- the settings read (legacy-bridge/surface-data.ts) ---- */
// composePromptPreview's own three lines (apps/dashboard/src/server/prompt-preview.ts), which cannot be imported here.
const preview = (brain: C.BrainConfig) => ({
  whatsapp: C.resolveSystemPrompt(brain, "whatsapp", zone, new Date(), {}, S.known),
  voice: C.resolveSystemPrompt(brain, "voice", zone, new Date(), {}, S.known),
  now: C.describeNow(zone, new Date(), brain.profile?.closures),
  tz: zone,
  inputs: { policy: {}, known: S.known },
});
w.__SETTINGS = {
  config: { brain: S.brain, ...(S.calendar ? { calendar: S.calendar } : {}) },
  version: S.version,
  role: S.role,
  broken: null,
  prompt: preview(S.brain),
  updatedBy: "E2E Owner",
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
};
const resolved = C.resolveFacts(S.brain, S.known);
w.__FACTS = { facts: resolved, conflicts: C.factConflicts(resolved) };
w.__POLICIES = null;
w.__CHANNELS = (S.known.channels ?? []).map((c) => ({ ...c }));

// The app's fonts and the class that turns on its touch floor, which the mockup's document lacks.
const fonts = () => {
  const s = document.createElement("style");
  s.textContent = ':root{--font-geist:"Geist";--font-geist-mono:"Geist Mono"}';
  document.head.appendChild(s);
  document.documentElement.classList.add("legacy-on");
};
if (document.head) fonts();
else document.addEventListener("DOMContentLoaded", fonts);
