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
  proposalMessage,
  proposalLinkOf,
  pipelineOf,
  pipelineMove,
  pipelinePeekOf,
  pipelineRail,
  pipelineRoute,
  parsePipelineRoute,
  pipelineViewLabel,
  pipelineSorted,
  pipelinePassMany,
  pipelinePassDone,
  pipelinePeekDetail,
  pipelineBoardMore,
  PIPELINE_BOARD_CAP,
  PIPELINE_WORDS,
  whyNotAHandoff,
  handoffE164,
  formatPhoneDisplay,
  BROKEN_CONFIG_WORDS,
  hardLimitsWords,
  csvCell,
  LEAD_WORDS,
} from "@chanlytics/contracts";
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
  leadNearWhere,
  leadsFirstDayWays,
  leadUndoable,
  planCeiling,
  leadReviewGroups,
  leadBand,
  leadReviewCosts,
  leadCheckAgainCents,
  leadAskedFor,
  LEAD_REVIEW_ACT_WORDS,
  LEAD_REVIEW_GROUP_WHY,
  leadMapPlot,
  leadMapAcross,
  leadMapNote,
  leadPinTone,
} from "@chanlytics/contracts";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    __DEMO_MODE: boolean;
    ROLE_PERMS: typeof ROLE_PERMS;
    __roleGate: typeof roleGate;
    __FACT_WORDS: typeof SOURCE_WORDS;
    __samePhone: typeof samePhone;
    __whyNotAPhone: typeof whyNotAPhone;
    __whyNotAnEmail: typeof whyNotAnEmail;
    __linkHost: typeof linkHost;
    __proposalMessage: typeof proposalMessage;
    __proposalLinkOf: typeof proposalLinkOf;
    __pipeline: {
      of: typeof pipelineOf;
      move: typeof pipelineMove;
      peek: typeof pipelinePeekOf;
      rail: typeof pipelineRail;
      route: typeof pipelineRoute;
      parse: typeof parsePipelineRoute;
      viewLabel: typeof pipelineViewLabel;
      sorted: typeof pipelineSorted;
      passMany: typeof pipelinePassMany;
      passDone: typeof pipelinePassDone;
      detail: typeof pipelinePeekDetail;
      boardCap: typeof PIPELINE_BOARD_CAP;
      boardMore: typeof pipelineBoardMore;
      words: typeof PIPELINE_WORDS;
    };
    __whyNotAHandoff: typeof whyNotAHandoff;
    __handoffE164: typeof handoffE164;
    __phoneDisplay: typeof formatPhoneDisplay;
    __brokenConfigWords: typeof BROKEN_CONFIG_WORDS;
    __hardLimits: typeof hardLimitsWords;
    __csvCell: typeof csvCell;
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
      leadNearWhere: typeof leadNearWhere;
      planCeiling: typeof planCeiling;
      leadUndoable: typeof leadUndoable;
      leadReviewGroups: typeof leadReviewGroups;
      leadBand: typeof leadBand;
      leadReviewCosts: typeof leadReviewCosts;
      leadCheckAgainCents: typeof leadCheckAgainCents;
      leadAskedFor: typeof leadAskedFor;
      leadMapPlot: typeof leadMapPlot;
      leadMapAcross: typeof leadMapAcross;
      leadMapNote: typeof leadMapNote;
      leadPinTone: typeof leadPinTone;
      LEAD_REVIEW_ACT_WORDS: typeof LEAD_REVIEW_ACT_WORDS;
      LEAD_REVIEW_GROUP_WHY: typeof LEAD_REVIEW_GROUP_WHY;
    };
  }
}

if (typeof window !== "undefined") {
  window.React = React;
  window.ReactDOM = ReactDOM;
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
  window.__proposalMessage = proposalMessage;
  // And which link is a person's now (0008): their deal's while it is a proposal out, none for any other deal, their
  // own only with no deal. The thread reads it off People's row, so its send never offers a client a proposal.
  window.__proposalLinkOf = proposalLinkOf;
  // People › Pipeline (0008): the rows People already holds, grouped by where each deal stands, what a card dropped in
  // another column asks for, what the peek says of a row, and every word the scope says. The page composes them; it
  // decides nothing (pipeline-scope.jsx).
  window.__pipeline = {
    of: pipelineOf,
    move: pipelineMove,
    peek: pipelinePeekOf,
    // Its own rail, and its address (clients/pipeline:v-<view>:p-<person>): the shell and the page read one spelling.
    rail: pipelineRail,
    route: pipelineRoute,
    parse: parsePipelineRoute,
    viewLabel: pipelineViewLabel,
    // The row carries the deal: its order by the member's heading, a selection's pass and what it came to, what the
    // peek says once the person is read, and how many cards a board column shows.
    sorted: pipelineSorted,
    passMany: pipelinePassMany,
    passDone: pipelinePassDone,
    detail: pipelinePeekDetail,
    boardCap: PIPELINE_BOARD_CAP,
    boardMore: pipelineBoardMore,
    words: PIPELINE_WORDS,
  };
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
    leadNearWhere,
    leadUndoable,
    leadReviewGroups,
    leadBand,
    leadReviewCosts,
    leadCheckAgainCents,
    leadAskedFor,
    LEAD_REVIEW_ACT_WORDS,
    LEAD_REVIEW_GROUP_WHY,
    leadMapPlot,
    leadMapAcross,
    leadMapNote,
    leadPinTone,
  };
}

export {};
