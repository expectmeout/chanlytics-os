/**
 * Seed the classic-script globals BEFORE the legacy manifest evaluates.
 * The mockup's 48 files were written for one shared global scope: they
 * destructure `React` at module scope, call ReactDOM.createPortal at runtime,
 * and export via Object.assign(window, {...}). Making our bundle's React THE
 * window.React means legacy components run inside our tree with one hook
 * dispatcher — no second React instance ever loads.
 */
import * as React from "react";
import * as ReactDOM from "react-dom";
import {
  ROLE_PERMS,
  SOURCE_WORDS,
  roleGate,
  samePhone,
  whyNotAPhone,
  linkHost,
  normalizeLink,
  proposalMessage,
  proposalLinkOf,
  whyNotAHandoff,
  handoffE164,
  formatPhoneDisplay,
  BROKEN_CONFIG_WORDS,
} from "@chanlytics/contracts";
import { INBOX_GLOBALS, hearPresence } from "../surfaces/inbox/legacy-globals";
import { threadVerbs } from "../surfaces/inbox/thread/thread-verbs";
import { KIT_GLOBALS } from "../surfaces/kit/kit-globals";
import { PEOPLE_GLOBALS } from "../surfaces/people/people-globals";
import { LEADS_GLOBALS } from "../surfaces/leads/globals";
import { BUSINESS_GLOBALS } from "../surfaces/settings/business/globals";
import { surfaceHook, type SurfaceNames } from "./surface-status";
import { routeSurfaces } from "./surface-registry";
import { pipelineHelpers, type PipelineHelpers } from "@/surfaces/people/pipeline-helpers";
import { installRoleStore } from "./identity";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    useSurface: (names: SurfaceNames) => number;
    __DEMO_MODE: boolean;
    ROLE_PERMS: typeof ROLE_PERMS;
    __roleGate: typeof roleGate;
    __FACT_WORDS: typeof SOURCE_WORDS;
    __samePhone: typeof samePhone;
    __whyNotAPhone: typeof whyNotAPhone;
    __linkHost: typeof linkHost;
    __normalizeLink: typeof normalizeLink;
    __proposalMessage: typeof proposalMessage;
    __proposalLinkOf: typeof proposalLinkOf;
    __pipeline: PipelineHelpers;
    __whyNotAHandoff: typeof whyNotAHandoff;
    __handoffE164: typeof handoffE164;
    __phoneDisplay: typeof formatPhoneDisplay;
    __brokenConfigWords: typeof BROKEN_CONFIG_WORDS;
  }
}

if (typeof window !== "undefined") {
  // React, and the one hook a page redraws on when a surface it draws moves (surface-status.ts): a key, a list, or a
  // route's, as the registry names them. Over this React, before any page loads.
  // And the kit's components the pages that have not moved still draw, under the names they read (kit-globals.ts).
  Object.assign(window, {
    React,
    ReactDOM,
    useSurface: surfaceHook(React, routeSurfaces),
    Icon: KIT_GLOBALS.Icon,
    EmptyState: KIT_GLOBALS.EmptyState,
    FailedRead: KIT_GLOBALS.FailedRead,
    SegmentBar: KIT_GLOBALS.SegmentBar,
    StatePill: KIT_GLOBALS.StatePill,
    Confirm: KIT_GLOBALS.Confirm,
    MoreMenu: KIT_GLOBALS.MoreMenu,
    PolicyChip: KIT_GLOBALS.PolicyChip,
    TlMedia: KIT_GLOBALS.TlMedia,
    AttnRow: KIT_GLOBALS.AttnRow,
    useHoldToTalk: KIT_GLOBALS.useHoldToTalk,
    // The Inbox's and Conversations' names for the pages that have not moved (surfaces/inbox/legacy-globals.ts), and the
    // one thread's verbs, which the deal sheet sends its proposal through (surfaces/inbox/thread/thread-verbs.tsx).
    INBOX_DATA: INBOX_GLOBALS.INBOX_DATA,
    CONVERSATIONS_DATA: INBOX_GLOBALS.CONVERSATIONS_DATA,
    IX_STORE: INBOX_GLOBALS.IX_STORE,
    ixWaitsOnYou: INBOX_GLOBALS.ixWaitsOnYou,
    CV_ROUTE: INBOX_GLOBALS.CV_ROUTE,
    CV_IN_CHANNEL: INBOX_GLOBALS.CV_IN_CHANNEL,
    threadVerbs,
    FieldError: KIT_GLOBALS.FieldError,
    RecordRow: KIT_GLOBALS.RecordRow,
    RecordSourceChip: KIT_GLOBALS.RecordSourceChip,
    RecordDispute: KIT_GLOBALS.RecordDispute,
    RecordChips: KIT_GLOBALS.RecordChips,
    recRowPress: KIT_GLOBALS.recRowPress,
    RecordField: KIT_GLOBALS.RecordField,
    RecordBox: KIT_GLOBALS.RecordBox,
    RecordSwitch: KIT_GLOBALS.RecordSwitch,
    RecordToggleGroup: KIT_GLOBALS.RecordToggleGroup,
    RecordCombobox: KIT_GLOBALS.RecordCombobox,
    RecordTip: KIT_GLOBALS.RecordTip,
    RecordTipCard: KIT_GLOBALS.RecordTipCard,
    recPhoneQuery: KIT_GLOBALS.recPhoneQuery,
    recPortalRoot: KIT_GLOBALS.recPortalRoot,
    RecordFold: KIT_GLOBALS.RecordFold,
    RecordInline: KIT_GLOBALS.RecordInline,
    RecordSays: KIT_GLOBALS.RecordSays,
    RecordFoot: KIT_GLOBALS.RecordFoot,
    useRecordFold: KIT_GLOBALS.useRecordFold,
    useRecFocusHold: KIT_GLOBALS.useRecFocusHold,
    useRecFocusOn: KIT_GLOBALS.useRecFocusOn,
    recKeys: KIT_GLOBALS.recKeys,
    useUnsavedWork: KIT_GLOBALS.useUnsavedWork,
    UnsavedAsk: KIT_GLOBALS.UnsavedAsk,
    tabDraft: KIT_GLOBALS.tabDraft,
    RecordSheet: KIT_GLOBALS.RecordSheet,
    __recordFolds: KIT_GLOBALS.__recordFolds,
    __settingsUnsaved: KIT_GLOBALS.__settingsUnsaved,
    __settingsSaving: KIT_GLOBALS.__settingsSaving,
    AgendaItem: KIT_GLOBALS.AgendaItem,
    AgendaItems: KIT_GLOBALS.AgendaItems,
    AgendaOpen: KIT_GLOBALS.AgendaOpen,
    // Leads' plan card, which Ask's palette draws for a lead_search card until Ask moves (surfaces/leads/globals.ts).
    LeadPlanCard: LEADS_GLOBALS.LeadPlanCard,
    // The Business tab's parts the first run draws and the saver it saves through (settings/business/globals.ts).
    __businessTabSave: BUSINESS_GLOBALS.__businessTabSave,
    btSellsByChoice: BUSINESS_GLOBALS.btSellsByChoice,
    BtAddressRow: BUSINESS_GLOBALS.BtAddressRow,
    BtWebsiteRow: BUSINESS_GLOBALS.BtWebsiteRow,
    BtBookingLinkRow: BUSINESS_GLOBALS.BtBookingLinkRow,
    BtZoneRow: BUSINESS_GLOBALS.BtZoneRow,
    BtHoursRow: BUSINESS_GLOBALS.BtHoursRow,
    BtServicesRow: BUSINESS_GLOBALS.BtServicesRow,
    BtLanguagesRow: BUSINESS_GLOBALS.BtLanguagesRow,
    BtRulesRow: BUSINESS_GLOBALS.BtRulesRow,
    BtCanCard: BUSINESS_GLOBALS.BtCanCard,
    BtServicesSheet: BUSINESS_GLOBALS.BtServicesSheet,
    // And People's parts the shell still draws or calls by name: the strip's scopes (surface-tabs.jsx), the two sheets the
    // frame draws once and their doors (app-shell.jsx), and the demo's Lists page's mark and route (people-globals.ts).
    plScopes: PEOPLE_GLOBALS.plScopes,
    plScopeRoute: PEOPLE_GLOBALS.plScopeRoute,
    PeopleScopeTabs: PEOPLE_GLOBALS.PeopleScopeTabs,
    ChannelGlyph: PEOPLE_GLOBALS.ChannelGlyph,
    __listRoute: PEOPLE_GLOBALS.__listRoute,
    DealSheetHost: PEOPLE_GLOBALS.DealSheetHost,
    StepSheetHost: PEOPLE_GLOBALS.StepSheetHost,
    openDealSheet: PEOPLE_GLOBALS.openDealSheet,
    openStepSheet: PEOPLE_GLOBALS.openStepSheet,
  });
  // Countdowns freeze while the member is Away and thaw when they are back, whichever surface is on screen.
  hearPresence();
  // Scripted demo theater (fake leads, fabricated handoffs, live-call sims,
  // veto auto-sends, canned Ask) stays OFF outside an explicit demo session.
  if (typeof window.__DEMO_MODE === "undefined") window.__DEMO_MODE = false;
  // The role table the SERVER enforces, published for the mockup's gate()
  // chips. settings.jsx carried its own hand-kept copy, and a permission table
  // maintained in two places is one edit away from the client offering a
  // control the server will refuse — or, worse, hiding one it would allow.
  window.ROLE_PERMS = ROLE_PERMS;
  // The gate's sentence, from the same table: a control a role may not press
  // says who may before the press, in the words the server's refusal gives
  // after it (contracts refusal.ts roleGate). data-bits.jsx gate() reads it.
  window.__roleGate = roleGate;
  // How a fact's source is said beside its value. Published here for the same
  // reason ROLE_PERMS is: the words belong to the contracts package, and a
  // second copy in a page is one edit away from the surface claiming a
  // provenance the resolver never gave it.
  window.__FACT_WORDS = SOURCE_WORDS;
  // "(646) 555-0175" and "+16465550175" are one number. The editor compares the
  // typed value against the provisioned line as you type, and a page that
  // rolled its own comparison would accuse a workspace of a conflict for
  // writing its own number in a friendly format.
  window.__samePhone = samePhone;
  // Why a typed number is not one anyone can be reached on, in the owner's
  // words. The published number is now optional, so the only thing standing
  // between a typo and a receptionist reading it aloud is this check.
  window.__whyNotAPhone = whyNotAPhone;
  // Where a stored link lives (its host), for a row or a menu hint; and the words a one-step send of the proposal
  // carries into the composer, once for the page and the thread.
  window.__linkHost = linkHost;
  // THE web-address normalizer (contracts link.ts): the Business tab's website and booking link are stored as it
  // stores them, "harbormoving.example" with its https:// supplied, and refused where it refuses.
  window.__normalizeLink = normalizeLink;
  window.__proposalMessage = proposalMessage;
  // And which link is a person's now (0008): their deal's while it is a proposal out, none for any other deal, their
  // own only with no deal. The thread reads it off People's row, so its send never offers a client a proposal.
  window.__proposalLinkOf = proposalLinkOf;
  // People › Pipeline (0008): the rows People already holds, grouped by where each deal stands, and everything the
  // scope says of them (pipeline-helpers.ts, which the e2e harness publishes too).
  window.__pipeline = pipelineHelpers();
  window.__whyNotAHandoff = whyNotAHandoff;
  window.__handoffE164 = handoffE164;
  // A stored number written the way people write one, "+1 (305) 555-0100", as
  // Setup and Connections already show them: Business showed the E.164.
  window.__phoneDisplay = formatPhoneDisplay;
  // A broken configuration in the words Setup's row says (S8).
  window.__brokenConfigWords = BROKEN_CONFIG_WORDS;
  // The role store every gate asks (identity.ts), made before any page loads, as settings.jsx made it as the
  // manifest loaded: identity.ts completes it once its own install runs.
  installRoleStore();
}

export {};
