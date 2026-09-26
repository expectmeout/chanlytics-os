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
 * The preview beside the config is composed here rather than imported: apps/dashboard/src/server/receptionist/prompt-preview.ts
 * opens with `import "server-only"` and pulls in @chanlytics/db, neither of which belongs in a browser bundle. The
 * three lines it is are written out below, from the same contracts functions the server calls.
 *
 * `installBusinessTab()` below is the tab's helpers FROM SOURCE, and the harness serves `data/business-tab.js` --
 * which the document loads after this and which is built from `packages/contracts/dist` -- as an empty script, so
 * nothing overwrites them (server.mjs says so where it answers that route).
 *
 * Nothing here saves. __saveSettings and __workspace.setTimezone refuse, so a spec that ever pressed a Save would see
 * the refusal on the page instead of quietly writing to a scenario.
 *
 * Nothing typechecks or lints this file: `tooling/` is not a package, so `pnpm -r typecheck` never reaches it and
 * eslint's config matches no `.ts` here. What holds it is e2e-harness.test.mjs, which builds it and runs it.
 */
import * as C from "@chanlytics/contracts";
import { installClock } from "@/legacy-bridge/zone";
import { installBusinessTab } from "@/legacy-bridge/business-tab";
import { startSurfaces } from "@/legacy-bridge/surface-runner";
import { peopleOverride } from "@/legacy-bridge/surface-data";
import { installPeopleCourier } from "@/legacy-bridge/people-detail";
import { installRouteGate, installSurfaceRegistry } from "@/legacy-bridge/surface-registry";
import { setStatus } from "@/legacy-bridge/surface-status";
import { pipelineHelpers } from "@/legacy-bridge/pipeline-helpers";
import { installTabMemory } from "@/legacy-bridge/tab-memory";
import { installNotifications } from "@/legacy-bridge/notifications";

interface Scenario {
  name: string;
  zone: string;
  /** The tenant_config row as the settings read hands it over: the brain, and whatever else it holds. */
  config: { brain: C.BrainConfig; [key: string]: unknown };
  known: C.KnownFacts;
  version: number;
  role: string;
  /** People, where the record has them (the pipeline scenario): people_list's rows. */
  people?: unknown[];
  /** How its customers buy (tenants.sells_by), where the record says: the pipeline's is "proposal". */
  sellsBy?: string;
  /** The bell's kept rows, as GET notifications hands them over (scenarios.mjs bellNotes). */
  notifications?: C.NotificationDto[];
}

const w = window as unknown as Record<string, any>;
const S = w.__HX_SCENARIO as Scenario;
const WORKSPACE = w.__HX_WORKSPACE as { id: string; slug: string; name: string };
/** Who the harness signs in as (scenarios.mjs OWNER). */
const OWNER = w.__HX_OWNER as { id: string; name: string; email: string };
const zone = S.zone;

/* ---- the shell ---- */
w.__DEMO_MODE = false;
w.__WORKSPACES = [
  {
    id: WORKSPACE.id,
    slug: WORKSPACE.slug,
    name: WORKSPACE.name,
    status: "active",
    timezone: zone,
    // Each workspace with its sells_by, as the app's boot lists them (identity.ts), where the record has one.
    ...(S.sellsBy ? { sells_by: S.sellsBy } : {}),
  },
];
w.__ACTIVE_WORKSPACE = WORKSPACE.id;
w.__ME = {
  id: OWNER.id,
  display_name: OWNER.name,
  name: OWNER.name,
  email: OWNER.email,
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
w.__tz = {
  words: C.timezoneWords,
  city: C.timezoneCity,
  known: C.knownTimezones,
  device: C.usableDeviceTimezone,
  also: C.zoneSearchWords,
};
w.DEFAULT_TIMEZONE = C.DEFAULT_TIMEZONE;
w.__phoneDisplay = C.formatPhoneDisplay;
w.__whyNotAPhone = C.whyNotAPhone;
w.__whyNotAHandoff = C.whyNotAHandoff;
w.__samePhone = C.samePhone;
// THE web-address normalizer, which the website and booking link rows store and check by (seed-globals.ts).
w.__normalizeLink = C.normalizeLink;
// The name the page reads (business-tab-save.jsx), which is the bridge's own (seed-globals.ts). Published under
// any other name, the transfer row falls through to the mockup's ported copy in data/bridge-stubs.jsx.
w.__handoffE164 = C.handoffE164;
w.__roleGate = C.roleGate;
w.__receptionistDefaults = C.newReceptionistDefaults;
w.__instructionsDraft = C.instructionsDraft;
w.__instructionsMax = C.INSTRUCTIONS_MAX;
w.__fallbackMessages = C.fallbackMessages;
w.__fallbackDefaults = C.FALLBACK_DEFAULTS;
w.__unknownDetails = C.unknownDetails;
// A broken configuration in Setup's words, and Autonomy's hard limits (seed-globals.ts publishes both).
w.__brokenConfigWords = C.BROKEN_CONFIG_WORDS;
w.__hardLimits = C.hardLimitsWords;
// The workspace's zone is saved through PATCH workspaces, never the settings saver. Refused here.
w.__workspace = { setTimezone: async () => ({ ok: false, tz: "", message: "The harness never saves." }) };
w.__saveSettings = () => Promise.resolve({ ok: false, code: "refused", message: "The harness never saves." });

/* ---- the settings read (legacy-bridge/surface-data.ts) ---- */
// composePromptPreview's own three lines (apps/dashboard/src/server/receptionist/prompt-preview.ts), which cannot be imported here.
const preview = (brain: C.BrainConfig) => ({
  whatsapp: C.resolveSystemPrompt(brain, "whatsapp", zone, new Date(), {}, S.known),
  voice: C.resolveSystemPrompt(brain, "voice", zone, new Date(), {}, S.known),
  now: C.describeNow(zone, new Date(), brain.profile?.closures),
  tz: zone,
  inputs: { policy: {}, known: S.known },
});
w.__SETTINGS = {
  config: S.config,
  version: S.version,
  role: S.role,
  broken: null,
  prompt: preview(S.config.brain),
  updatedBy: OWNER.name,
  updatedAt: new Date(Date.now() - 3_600_000).toISOString(),
};
// What the receptionist is told, as the prompt sheet reads it: inbox-verbs.ts composedPrompt's three lines, written out
// for the reason the preview is (that module brings the surface runner and the API client with it). e2e-harness.test.mjs
// runs both over this window and holds them to one answer.
w.__composedPrompt = (channel: "whatsapp" | "voice" = "whatsapp") => {
  const prompt = w.__SETTINGS && w.__SETTINGS.prompt;
  if (!prompt) return null;
  return { text: prompt[channel], now: prompt.now, tz: prompt.tz };
};
const resolved = C.resolveFacts(S.config.brain, S.known);
w.__FACTS = { facts: resolved, conflicts: C.factConflicts(resolved) };

/* ---- the three surfaces What it can do reads beside the settings read ---- */
// The Setup payload as legacy-bridge/setup.ts publishes it, the Autonomy matrix a provisioned workspace starts with
// (00017_provision_tenant) and the workspace's approved messages. Built from THIS scenario's own channels, brain and
// templates, so the card the page draws is the card the record earns: the nightly has nothing filled in and no
// approved message, the salon answers on both lines and has the booking-link message a call sends the link as.
// Published as null before this, which drew the card's failed read over a record the journey walks at a phone's
// width; and the template list was a constant HERE until the messages moved to the scenario, which handed the seeded
// workspace an approved message its own seed writes no row for.
const profile = (S.config.brain.profile ?? {}) as Record<string, any>;
// The scenario's own approved messages, counted rather than claimed.
const approvedTemplates = (S.templates ?? []).filter((t: any) => t.meta_status === "approved");
const answered = new Date(Date.now() - 3_600_000).toISOString();
const channel = (kind: string) => {
  const c = S.known.channels?.find((x: any) => x.kind === kind) ?? null;
  const active = !!c && c.status === "active";
  return { present: !!c, active, number: c?.number_e164 ?? null, lastInboundAt: active ? answered : null };
};
const setupDto = {
  business: {
    name: S.config.brain.business_name ?? null,
    hours: Object.keys(profile.hours ?? {}).length > 0,
    services: (profile.services ?? []).length,
    bookingLink: !!S.config.brain.booking_link,
    address: !!profile.address,
    handoff: profile.handoff_number ?? null,
    broken: false,
  },
  channels: { whatsapp: { ...channel("whatsapp"), quality: null }, voice: channel("voice") },
  templates: { approved: approvedTemplates.length, pending: 0, startersApproved: approvedTemplates.length },
  calendar: { state: (S.config as any).calendar ? ("ok" as const) : ("none" as const) },
  team: { members: 1, invitesOpen: 0, alertEmails: 0 },
  consent: { yes: 0, offers: 0, offersSaidYes: 0 },
  requests: { line: null },
  // No line row at all, so texting is not sold here (capabilities.ts) and the card keeps its third limit.
  lines: { rows: [], ready: true, provider: "twilio", costs: { local_number_month_usd: 1.15 } },
  activations: (["voice", "whatsapp"] as const)
    .filter((k) => channel(k).active)
    .map((k) => ({ capability: k, activated_at: answered, activated_by: OWNER.id, deactivated_at: null })),
};
w.__SETUP = {
  dto: setupDto,
  role: S.role,
  vm: C.setupSteps({ ...(setupDto as any), later: [] }),
  fetchedAt: Date.now(),
};
w.__POLICIES = {
  rows: [
    { class: "faq", mode: "auto", limits: {} },
    { class: "booking", mode: "auto", limits: {} },
    { class: "reply", mode: "auto", limits: { max_replies_day: 20 } },
    { class: "reengage", mode: "ask", limits: {} },
    { class: "campaign", mode: "ask", limits: {} },
    { class: "money", mode: "never", limits: {} },
  ],
  role: S.role,
};
w.__TEMPLATES_ALL = S.templates ?? [];
// No __CHANNELS. The bridge publishes `toChannelVM(c, now)` (surface-data.ts), and defining the global at all flips
// settings.jsx to PaneIntegrationsReal -- so a hand-built row would draw a pane no spec here opens, out of a shape
// the product does not use. The channels reach the page where the page reads them: in the facts, resolved above.

/* ---- People, real, where the record has people (the pipeline scenario) ----
 * The app's own pieces over the harness's own answers (server.mjs peopleAnswer): the People surface booted by the
 * runner, the profile's courier, the registry that says which surfaces are real, and the route gate LegacyApp.tsx
 * installs, so a route waits for its surface and draws when it lands, never the seeded page first. Who is looking
 * is published above (__ME), so the workspace surface, which carries it in the app, is ready as the page opens. The
 * Pipeline's helpers are the ones seed-globals.ts publishes (pipeline-helpers.ts). A record with no people changes
 * nothing: People stays the seeded page, and the Settings specs see the harness they always did.
 */
// Only in a browser: the harness's own test runs this bundle in a bare context, with no fetch to read People by.
if (S.people && typeof w.fetch === "function" && w.location && w.history) {
  // At the workspace's own address, as a signed-in tab is: every read names its workspace by the slug in the path
  // (workspace.ts getActiveWorkspace). Replaced before the document loads another file, whose paths the server maps.
  if (!w.location.pathname.startsWith(`/w/${WORKSPACE.slug}/`)) {
    w.history.replaceState(w.history.state, "", `/w/${WORKSPACE.slug}/${w.location.search}${w.location.hash}`);
  }
  installTabMemory(w as unknown as Window);
  installSurfaceRegistry();
  installPeopleCourier();
  w.__pipeline = pipelineHelpers();
  // What the People pages call that seed-globals.ts publishes from contracts: a selection's cell in an export, the
  // reader of a client list the import sheet plans by, the words the one-step send of a proposal carries, and why a
  // typed address is not one.
  w.__csvCell = C.csvCell;
  w.__csvImport = {
    parseCsv: C.parseCsv,
    matchColumns: C.matchColumns,
    importRowsOf: C.importRowsOf,
    importCounts: C.importCounts,
  };
  w.__proposalMessage = C.proposalMessage;
  w.__whyNotAnEmail = C.whyNotAnEmail;
  setStatus("workspace", "live");
  // The settings read and Setup are published above, as for every record, so their routes draw. A route whose
  // surface the harness does not serve (Today, the Inbox, Leads) waits under the gate and then says it could not be
  // read, as the app does when a read fails: this record is for People, the Pipeline and a person's page.
  setStatus("settings", "live");
  setStatus("setup", "live");
  installRouteGate();
  // No live feed here: nothing writes, so there is nothing to hear.
  startSurfaces([peopleOverride], () => () => {});
}

/* ---- the bell ----
 * The kept rows as the notifications surface publishes them, and the app's own bell over them (legacy-bridge/
 * notifications.ts), so the top bar draws the real feed. A mark would be a write, which the harness refuses: the bell
 * says nothing of it, as in the app when a mark fails. Only in a browser, as People's are.
 */
if (S.notifications && typeof w.addEventListener === "function") {
  w.__NOTIFICATIONS = { dto: { notifications: S.notifications, seen_at: null } };
  installNotifications(w as unknown as Window & Record<string, unknown>, null);
}

// The app's fonts and the class that turns on its touch floor, which the mockup's document lacks.
const fonts = () => {
  const s = document.createElement("style");
  s.textContent = ':root{--font-geist:"Geist";--font-geist-mono:"Geist Mono"}';
  document.head.appendChild(s);
  document.documentElement.classList.add("legacy-on");
};
if (document.head) fonts();
else document.addEventListener("DOMContentLoaded", fonts);
