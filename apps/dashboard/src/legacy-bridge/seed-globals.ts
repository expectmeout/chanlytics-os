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
import { ROLE_PERMS } from "@chanlytics/contracts";

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: typeof ReactDOM;
    __DEMO_MODE: boolean;
    ROLE_PERMS: typeof ROLE_PERMS;
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
}

export {};
