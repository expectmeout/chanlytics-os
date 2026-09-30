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
  whyNotAnEmail,
  linkHost,
  normalizeLink,
  proposalMessage,
  proposalLinkOf,
  whyNotAHandoff,
  handoffE164,
  formatPhoneDisplay,
  BROKEN_CONFIG_WORDS,
  hardLimitsWords,
  csvCell,
  parseCsv,
  matchColumns,
  importRowsOf,
  importCounts,
  LEAD_WORDS,
} from "@chanlytics/contracts";
import { KIT_GLOBALS } from "../surfaces/kit/kit-globals";
import { surfaceHook, type SurfaceNames } from "./surface-status";
import { routeSurfaces } from "./surface-registry";
import { pipelineHelpers, type PipelineHelpers } from "./pipeline-helpers";
import {
  LEAD_COUNT_CHOICES,
  planArea,
  planMinutes,
  planSaid,
  planSentence,
  planVersionOf,
  planWhere,
  planWho,
  planWords,
  leadPlanAsk,
  leadPlanFacts,
  leadPlanLikely,
  leadEndingLine,
  LEAD_QUESTION_WAIT_LINE,
  leadNearWhere,
  leadsFirstDayWays,
  leadUndoable,
  planCeiling,
  leadReviewGroups,
  leadBand,
  leadReviewCosts,
  leadPeekMenu,
  leadCheckAgainCents,
  leadAskedFor,
  LEAD_REVIEW_ACT_WORDS,
  LEAD_REVIEW_GROUP_WHY,
  leadMapPlot,
  leadMapAcross,
  leadMapNote,
  leadMapLegend,
  leadPinTone,
} from "@chanlytics/contracts";

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
    __whyNotAnEmail: typeof whyNotAnEmail;
    __linkHost: typeof linkHost;
    __normalizeLink: typeof normalizeLink;
    __proposalMessage: typeof proposalMessage;
    __proposalLinkOf: typeof proposalLinkOf;
    __pipeline: PipelineHelpers;
    __whyNotAHandoff: typeof whyNotAHandoff;
    __handoffE164: typeof handoffE164;
    __phoneDisplay: typeof formatPhoneDisplay;
    __brokenConfigWords: typeof BROKEN_CONFIG_WORDS;
    __hardLimits: typeof hardLimitsWords;
    __csvCell: typeof csvCell;
    __csvImport: {
      parseCsv: typeof parseCsv;
      matchColumns: typeof matchColumns;
      importRowsOf: typeof importRowsOf;
      importCounts: typeof importCounts;
    };
    __LEAD_WORDS: typeof LEAD_WORDS;
    __leadWays: typeof leadsFirstDayWays;
    __LEAD_VM: {
      planWords: typeof planWords;
      planSaid: typeof planSaid;
      planSentence: typeof planSentence;
      planWho: typeof planWho;
      planWhere: typeof planWhere;
      planArea: typeof planArea;
      planMinutes: typeof planMinutes;
      planVersionOf: typeof planVersionOf;
      LEAD_COUNT_CHOICES: typeof LEAD_COUNT_CHOICES;
      leadPlanLikely: typeof leadPlanLikely;
      leadPlanFacts: typeof leadPlanFacts;
      leadPlanAsk: typeof leadPlanAsk;
      leadEndingLine: typeof leadEndingLine;
      LEAD_QUESTION_WAIT_LINE: typeof LEAD_QUESTION_WAIT_LINE;
      leadNearWhere: typeof leadNearWhere;
      planCeiling: typeof planCeiling;
      leadUndoable: typeof leadUndoable;
      leadReviewGroups: typeof leadReviewGroups;
      leadBand: typeof leadBand;
      leadReviewCosts: typeof leadReviewCosts;
      leadPeekMenu: typeof leadPeekMenu;
      leadCheckAgainCents: typeof leadCheckAgainCents;
      leadAskedFor: typeof leadAskedFor;
      leadMapPlot: typeof leadMapPlot;
      leadMapAcross: typeof leadMapAcross;
      leadMapNote: typeof leadMapNote;
      leadMapLegend: typeof leadMapLegend;
      leadPinTone: typeof leadPinTone;
      LEAD_REVIEW_ACT_WORDS: typeof LEAD_REVIEW_ACT_WORDS;
      LEAD_REVIEW_GROUP_WHY: typeof LEAD_REVIEW_GROUP_WHY;
    };
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
  });
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
  // The same for an address typed on a person's page: said under the field, before a round trip.
  window.__whyNotAnEmail = whyNotAnEmail;
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
  // A broken configuration in the words Setup's row says (S8), and Autonomy's
  // hard limits in words that say a default is a default (S6).
  window.__brokenConfigWords = BROKEN_CONFIG_WORDS;
  window.__hardLimits = hardLimitsWords;
  // One CSV cell, as the route's export spells it: the page's export of a selection quoted and nothing more, so a
  // WhatsApp name of "=HYPERLINK(...)" ran in whoever opened that file while the whole-workspace export was safe.
  window.__csvCell = csvCell;
  // The People import sheet reads a spreadsheet in the browser with these: parsed into rows, matched to a name, a
  // number and an address column, and normalised into what the import door (window.__importPeople) takes.
  window.__csvImport = { parseCsv, matchColumns, importRowsOf, importCounts };
  // Every word the Leads scope says, from contracts. The legacy pages are
  // classic scripts and cannot import; without this each page would spell the
  // stage, the email state and the questions again, and a word spelled twice is
  // a word that drifts (contracts leads.ts LEAD_WORDS; Task 19 adds the facts'
  // own words to the same record, Task 17 the ways beside it).
  window.__LEAD_WORDS = LEAD_WORDS;
  // The first day's three ways (Task 17). Beside the words rather than inside
  // __LEAD_VM: it takes facts the page reads from two surfaces and answers what
  // may be said about each way, so a way never claims a line nobody looked at.
  window.__leadWays = leadsFirstDayWays;
  // One derivation per fact: __LEAD_WORDS holds the words, __LEAD_VM holds what
  // derives them, and the pages spell neither. Task 10 adds `leadStrip` to this
  // object; `leadEndingLine` is here, so the strip never spells an ending itself.
  window.__LEAD_VM = {
    planWords,
    planSaid,
    planSentence,
    planWho,
    planWhere,
    planArea,
    planMinutes,
    planCeiling,
    planVersionOf,
    LEAD_COUNT_CHOICES,
    leadPlanLikely,
    leadPlanFacts,
    leadPlanAsk,
    leadEndingLine,
    // The question's one line under its sentence (the email says the same).
    LEAD_QUESTION_WAIT_LINE,
    leadNearWhere,
    leadUndoable,
    leadReviewGroups,
    leadBand,
    leadReviewCosts,
    // Who the peek's ⋯ offers Erase to (PR 9): the owner, by contracts' rule, never the page's.
    leadPeekMenu,
    leadCheckAgainCents,
    leadAskedFor,
    LEAD_REVIEW_ACT_WORDS,
    LEAD_REVIEW_GROUP_WHY,
    leadMapPlot,
    leadMapAcross,
    leadMapNote,
    leadMapLegend,
    leadPinTone,
  };
}

export {};
