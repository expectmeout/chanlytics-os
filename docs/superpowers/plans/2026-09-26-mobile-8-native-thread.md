# The phone app, PR 8: the native thread, and a bearer token beside the cookie

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The first screen of the app that is not a WebView: the Inbox thread, drawn natively over the same view model
the web draws, replying through the same door. With it, the API's new door: a bearer token beside the cookie, decided
in `docs/decisions/0011-a-bearer-token-beside-the-cookie.md` before the code. PRD tier 2, PR 8.

- [x] Decision 0011, written against `8c09bdb`.
- [x] The site: `server/bearer.ts` (the header parsed, the verifier injectable), `createBearerClient`, the bearer path
      in `with-route.ts` beside the cookie's (the same-origin rule stays the cookie's), the proxy's pass-through for
      `/api/v1/` with a `Bearer` header. No new route, role or rate bucket; `route-policy.json` unchanged.
- [x] The bridge: the shell's `{t:"token"}` ask; the page's `{t:"token", access, expires}` from its own client's session,
      the access token only.
- [x] Contracts: `native-thread.ts` (`nativeThreadVM` over `toConversationVM`: title, subtitle, bubbles, the composer's
      state in one sentence each, the oldest instant for paging).
- [x] The app: `shell/api.ts` (the bearer call: the page asked for a token when none is fresh, one retry on 401, the
      envelope read), `shell/Thread.tsx` (bubbles, paging back, the composer, refusals in the site's words), the Inbox
      tab as a stack (`(tabs)/inbox/{_layout,index,[id]}.tsx`); the Surface pushes the thread when the page says
      `inbox/<id>` and sends the page back to its list.
- [x] Tests: `bearer.test.mjs` (the wrapper executed with a stand-in verifier), `auth-gate.test.mjs` (the bypass's
      shape), the bridge tests on both sides, `native-thread.test.mjs`, the app's `api.test.mjs`.
- [ ] Ruben's: nothing to set. A new build carries the screen; the site accepts a bearer either way.
- [ ] Squash-merge.

## As built (26 Sep 2026)

- **The page is the token authority.** The shell holds the access token in memory only and asks the page in front for
  it; the refresh token never leaves the page. A cold start has no token until a page is mounted, and the thread opens
  from the Inbox page, so one always is. PR 9 (native Today) decides whether that still holds.
- **A bearer request reads no cookie.** That is what lets the same-origin rule stay the cookie's without a second rule.
- **The thread's times are the phone's clock.** The workspace's zone is the page's; the widget (PR 4) made the same
  call.
- **Attachments say what they are and where to open them.** The media bytes are behind a cookie route
  (`messages/:id/media`); the native screen names the attachment and defers to the web, until a bearer read of media
  is worth its own change.
