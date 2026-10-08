# One motion for every strip of views: implementation plan

> Executed inline, in the session that wrote it, on `strip/one-motion` (local, nothing pushed). Steps are ticked as
> they land. The design is `docs/superpowers/specs/2026-10-08-one-motion-for-every-strip-design.md`.

**Goal:** a change of view moves on one timeline, the same on a desk and a phone and for a tap, a click and a swipe,
drawn by one strip component and one motion module that the Inbox's, People's, Reports' and Settings' strips share.

**Architecture:** a framework-free deck in the kit (`kit/motion/view-deck.ts`) owns the timeline, the finger, the exit,
the arrival and the still copy of the view React removed. The kit's `ViewTabs` draws the strip and its highlight and
asks the deck to leave; `viewPager` hands `touchSwipe` a page to walk. The frame's `main`, Reports' lens body and
Settings' pane register as views and say which side they arrive from with `data-slide`.

**Tech:** TypeScript and TSX in `apps/dashboard/src/surfaces/kit`, the Web Animations API, the legacy shell's JSX as
the frame's adapter, the node suite on the stub React, Playwright (Chromium and WebKit) for the frames.

---

### Task 1: the deck

**Files:** create `apps/dashboard/src/surfaces/kit/motion/view-deck.ts`; test
`tooling/scripts/tests/shell/view-deck.test.mjs`.

- [x] The test first: `springAt` ends on its target, never passes it, is monotone, and is mirrored for the other side;
  `travelOf("100%", 375)` is 375 and `travelOf("56px", 1034)` is 56; a leave animates the view on screen out and
  answers a move; the next view registered with `data-slide` gets the same move's timeline (`startTime`), and the node
  React removed is inserted before it, inert, with no id or test id, and removed when its animation finishes; an arrival
  with no leave before it starts both at once; a second leave starts from where the view is; a view never replaced
  comes back; a view with no `data-slide` is left alone; reduced motion cross-fades with no travel.
- [x] `node tooling/scripts/checks/test.mjs tooling/scripts/tests/shell/view-deck.test.mjs`: red (no module).
- [x] The module: `springAt`, `speedAt`, `travelOf`, `createDeck(env)` with `view(owner)`, `drag`, `settle`, `leave`,
  and the app's own `viewDeck`.
- [x] Green.

### Task 2: the strip

**Files:** create `kit/view-tabs/view-tabs.tsx`, `kit/view-tabs/glide.ts`, `kit/view-tabs/pager.ts`,
`kit/view-tabs/view-tabs.type-test.ts`, `kit/motion/use-slide.ts`; modify `kit/index.ts`, `kit/kit-globals.ts`,
`legacy-bridge/seed-globals.ts`, `kit/kit.css`, `kit/classes.json`, `tooling/scripts/e2e-harness/kit-gallery.mjs`;
test `tooling/scripts/tests/shell/view-tabs.test.mjs`.

- [x] The test first: the strip is a `nav.stabs.stabs-<name>` of links with the pill before them; the picked one is
  `.active` and `aria-current="page"`; a count is a tally, amber when it warns; a press with no key held lights the tab
  at once, asks the deck to leave toward its side and then calls `onPick`; a press with a key held is the browser's; a
  strip of one draws nothing; the pager answers `prev` and `next` from where the lit tab stands and null where the
  touch is another's.
- [x] The component, the glide, the pager, the hook, the registry name `stabs-pill` and its gallery entry.
- [x] Green, with `styles/kit-css`, `styles/kit-gallery` and `styles/kit-components`.

### Task 3: a touch hands a page to the deck

**Files:** modify `apps/dashboard/src/legacy/components/data-bits.jsx`, `apps/dashboard/src/surfaces/calendar/acts.tsx`,
`apps/dashboard/src/surfaces/calendar/shell-verbs.ts`, `apps/dashboard/src/surfaces/legacy-verbs.ts`; test
`tooling/scripts/tests/shell/it-moves.test.mjs`.

- [x] The page tests say the new words: a walk calls `drag(dx)` with the finger's travel (a quarter, 48px at most,
  toward a side with no page), `go(step, speed)` past a third or on a flick, `settle()` short of it and on a cancel;
  nothing from the edges or where the page refuses.
- [x] `touchSwipe`'s page way calls those three; the page that stays (the Calendar's days) is `stayingPage(el, pages)`
  in data-bits, which gives the same three words over `swipeLeave` and `swipeArrive`.
- [x] Green; the file-length and complexity baselines fall.

### Task 4: the frame

**Files:** modify `legacy/components/surface-tabs.jsx`, `legacy/pages/app-shell.jsx`, `legacy/styles/components.css`,
`legacy/styles/tokens.css`, `legacy/styles/mobile.css`, `legacy/Chanlytics.html`, `surfaces/routes.ts`; tests
`shell/surfaces/shell-status.test.mjs`, `shell/surfaces/one-inbox.test.mjs`, `people/moments/people-views.test.mjs`,
`people/people-honest.test.mjs`, `reports/lenses/reports-address.test.mjs`.

- [x] `SurfaceTabs` draws `ViewTabs`; `stripSwipe` hands `viewPager`; `stripPager`, `stripTap`, `stripUnglide`,
  `stripAround`, `stShowPicked` and `stAfterPaint` go.
- [x] `main` takes `ref={viewDeck.view("frame")}` and `data-slide`; the two slide classes go.
- [x] CSS: `route-slide-*` and its keyframes go; a view with `data-slide` plays no entrance of its own; the still copy
  (`.view-leaving`); `--view-travel` in the tokens and People's to 900px.
- [x] The tests follow; green.

### Task 5: Reports

**Files:** modify `surfaces/reports/reports-page.tsx`, `surfaces/reports/chrome.ts`, `legacy/styles/reports.css`; test
`reports/lenses/reports-address.test.mjs` and the page's own.

- [x] The lens body is keyed by its lens, registers as a view and says its side (`useSlide`); `stays` goes from the
  chrome and from `SurfaceViews`.

### Task 6: Settings

**Files:** modify `surfaces/settings/frame/page.tsx`, `legacy/styles/settings.css`, `legacy/styles/mobile.css`; test
`receptionist/business-tab/settings-editor.test.mjs` and Settings' own.

- [x] The sections are `ViewTabs`; the pane registers as a view and says its side; `set-slide-*` goes.

### Task 7: the frames

**Files:** create `dev-tools/load-parity/strip-motion-check.js` (outside the repository, beside the recorder).

- [x] Inbox, People, Reports and Settings; a tap and a swipe, both ways; 375 and 1280 wide; Chromium and WebKit: no
  cut, no empty frame, pages attached, highlight moving every frame, strip scrolling with it, mirrored.
- [x] Two presses, a swipe mid-arrival, a short drag, the first tab's end, reduced motion.

### Task 8: what the build holds

- [x] Stylesheet versions in `Chanlytics.html`. `next-env.d.ts` and the `TEMP-LOCAL-ONLY` line in `next.config.ts` are the
  local dev server's and are left out of every commit (restore both when it stops).
- [x] `corepack pnpm -r typecheck`, `corepack pnpm lint`, the changed tests, `repo/code-health-ratchets`,
  `repo/debt-register`, `styles/*`, `repo/legacy-harness`, `repo/shell-names-are-published`; falls banked with
  `UPDATE_BASELINES=1` on those files and `docs/debt.md` in step.
- [ ] Owed at the push, on Ruben's word: the bundle budget's raise from CI's numbers, and `e2e/shell/phone.spec.ts`
  against the deployed build.
