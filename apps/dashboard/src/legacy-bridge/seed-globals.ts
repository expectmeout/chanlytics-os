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
import { ROLE_PERMS, SOURCE_WORDS, samePhone, whyNotAPhone, whyNotAHandoff, handoffE164 } from "@chanlytics/contracts";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    __DEMO_MODE: boolean;
    ROLE_PERMS: typeof ROLE_PERMS;
    __FACT_WORDS: typeof SOURCE_WORDS;
    __samePhone: typeof samePhone;
    __whyNotAPhone: typeof whyNotAPhone;
    __whyNotAHandoff: typeof whyNotAHandoff;
    __handoffE164: typeof handoffE164;
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
  // How a fact's source is said beside its value. Published here for the same
  // reason ROLE_PERMS is: the words belong to the contracts package, and a
  // second copy in a page is one edit away from the surface claiming a
  // provenance the resolver never gave it.
  window.__FACT_WORDS = SOURCE_WORDS;
  // "(646) 932-5775" and "+16469325775" are one number. The editor compares the
  // typed value against the provisioned line as you type, and a page that
  // rolled its own comparison would accuse a workspace of a conflict for
  // writing its own number in a friendly format.
  window.__samePhone = samePhone;
  // Why a typed number is not one anyone can be reached on, in the owner's
  // words. The published number is now optional, so the only thing standing
  // between a typo and a receptionist reading it aloud is this check.
  window.__whyNotAPhone = whyNotAPhone;
  window.__whyNotAHandoff = whyNotAHandoff;
  window.__handoffE164 = handoffE164;
}

export {};
