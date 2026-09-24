# The thread is a phone screen

Measured on `app.chanlytics.com` at 375×812, signed in, against the pilot's workspace.

## What the audit found

**Chrome took 47% of the screen.** Top bar 52px, section tabs 48px, thread header 69px;
status band 85–115px, composer 68px, tab bar 58px. The conversation — the only reason the
screen exists — got 432px of 812. At 320×640 it got 270 of 640.

**The outbound bubble inverted in dark mode.** `.tl-msg.agent .tl-msg-body` set
`background: var(--ink-muted)` and `color: var(--bg)` — a text token used as a surface and
the page colour used as text. In light that draws a dark bubble on a light page. In dark it
draws an `L*70` light slab with near-black text, and the loudest thing on the screen became a
three-word reply.

**The meta row wrapped into columns.** `.tl-msg-by` is an `inline-flex` of four independent
spans, so at 375px `by WhatsApp Receptionist · Booking · 91% sure · Read` wrapped as *units*
into a ragged three-column block with orphaned `·` separators.

**The same fact was said three times.** On Zoe Martin's thread: the event line
("Flagged for a human — Sent a voice note / photo"), the status band ("They sent a voice note
or photo the receptionist can't read"), and a third copy of the quoted message in the status
band's `IxAsk`.

**An email arrived with its quote chain intact.** "Got it, thanks!" rendered as six lines of
`On Thu, Sep 17, 2026 at 10:44 PM … wrote: > testing back at you >`.

**A booking URL took five lines.** `https://book.example.com/en-us/4471902_marisa-s-beauty-salon_hair-salon_29902_brooklyn`
force-wrapped inside the bubble, and was not tappable.

Also: the `…` menu opened as a desktop popover pinned to the far top corner, over the
conversation; `.phone-tabs` had `padding-bottom: 6px` with no `env(safe-area-inset-bottom)`;
scroll anchored mid-bubble; timestamps printed twice within 40px; the header subtitle spent
its only line on `+1 (917) 555-0114` / `no name saved`; and the Ask ✦ sat in the same corner
as Send.

## What changes

### Tokens — a bubble is a surface, not inverted ink

`--bubble-us-bg` / `--bubble-us-line` are defined per theme; the body keeps `--ink`. "Ours"
reads by elevation in both themes instead of flipping. Light mode is corrected by the same
change: the bubble stops being near-black.

### The thread

- The section tabs (`Needs you / Conversations / Live`) hide while a thread is open on a
  phone. `SurfaceTabs` already hides on a person's profile for the same reason — a detail view
  keeps its focus. Here it is CSS on `.inbox.phone-thread`, so the desktop split pane keeps them.
- The status band's prose folds into one line of state beside the actions. `IxAsk` — the third
  copy of the customer's message — comes off the phone; the bubble is two inches above it.
- `.tl-msg-by` becomes one line that ellipses. Author and delivery status stay visible. The
  intent and confidence (`Booking · 91% sure`) move behind a tap: a `.tl-msg-why` button that
  opens the reason and the facts it used. On desktop the hover title stays.
- The `· {entry.at}` in the `byYou` branch goes: `.tl-msg-meta` above the bubble already
  prints it.
- A long URL renders as a tappable link truncated **by CSS**, not by string surgery, so the
  full address stays in the DOM for selection and copy. Customer-sent links become tappable
  for the first time.
- An email's quoted chain splits in the viewmodel (`splitQuotedReply`) and renders behind
  `Show quoted text`. Shared with Conversations, which draws the same messages.
- The event line top-aligns its bullet and stops centring its timestamp against a four-line
  paragraph.
- `TlMedia` gets an aspect box so a photo reserves its height instead of popping in.

### The chrome

- `env(safe-area-inset-bottom)` on the composer, as `.phone-tabs` and `.lm-whisper` already have.
- The Ask ✦ hides inside an open thread: the composer is the primary action there.
- The `…` menu becomes a bottom sheet on a phone — `MoreMenu` already renders a backdrop, so
  this is CSS on `.more-menu`.
- Back gets its 44px target as a real hit area rather than a bare glyph.
- The header subtitle carries channel and waiting instead of the phone number.

### The list

- Two stacked tab rows become one: the buckets carry the counts, so the section tabs' own
  `Needs you` badge is the duplicate.
- The bulk-select column comes off the phone. Archive and Snooze are already in the thread's
  menu, and the checkbox only ever appeared on the active row — one of three competing left
  rails (unread dot, sometimes-checkbox, avatar).
- `ruben@rjcapit…` beside a clipped `billing@rjcapital.io has it` becomes a layout with one
  truncation instead of two fighting.

## What does not change

No verb, no route, no API. Conversations and Live keep their layouts. Desktop changes only
where the token fix corrects it — which is a correction, not a redesign.

## How it is proven

`splitQuotedReply` is a pure function in contracts, run against real quote shapes.
The rendering changes run on the stub-React harness (`inbox-list-honest`'s pattern), which
mounts the pages over a fake wire. No source scans.
