# One thread

A conversation is drawn one way, wherever it is opened.

## What there was

Two of everything, found by opening ruben@rjcapital.io from each tab on 21 September:

| | Inbox | Conversations |
|---|---|---|
| Component | `InboxThread` (inbox-thread.jsx) | `CvViewer` (conversations.jsx) |
| View model | `toInboxThreadVM` | `toConversationVM` |
| Header | Back, avatar, name, one `…` menu | "← All", avatar, name, a status pill, and a second row of View thread in Inbox · Open profile · Export |
| Bubbles | `TimelineEntry`: links, the quoted chain behind a tap, "Why" on a tap, one line under a reply | its own `.tl-msg` markup: author, status and the reason crowded onto the line above the bubble |
| Around them | the status band, the verbs, the reply box | a "Latest from…" card, and nothing to act with |

They share class names, so they look related. They are not: every bubble is written twice, so every fix lands
once. #746 split an email's quoted chain in the Inbox's view model and said Conversations drew the same messages
the same way; it did not, and Conversations still printed "On Thu, Sep 17, 2026 at 10:44 PM … wrote: >" in full.
On a phone the Conversations thread still had the section tabs, the ✦, a meta line wrapped into columns, "Email"
over every bubble of a one-channel thread, a summary card that took 40% of the screen before the first message —
and no way to answer: "View thread in Inbox" opened a second screen for the same conversation.

## The one thread

**`ThreadPane`** (a new `thread-pane.jsx`) is the conversation, wherever it opens: given a thread, it draws
`InboxThread` — header, timeline, status band, reply box — and owns the verbs a real thread has. There are only
two of those today, and both already go to the server:

- `realVerb(t, verb, payload)` — reply, reply-template, take-over, hand-back, snooze, wake, archive — through
  `window.__inboxVerb`, with the toast that says what happened and the Undo a reply's receipt allows;
- the draft's hold, through `window.__cancelSend`, with the countdown to the server's own deadline.

A real thread keeps no state in the page: the verb goes to the server and the `surface:inbox` re-read repaints.
So moving these into the pane moves no state; it moves code the Inbox and Conversations will both run. The
mockup's seeded threads keep the Inbox's own handlers (`IX_STORE`, `mutate`, the verdict), which only a demo reaches.

**Where the thread comes from.** Every workspace surface boots together, and the Inbox's reads `GET
conversations` — the same page Conversations lists — so any conversation Conversations shows is a thread in
`window.INBOX_DATA.THREADS` under `th-<id>`. The pane looks it up there and draws it again on each `surface:inbox`.
Before the first read lands it says it is reading, never another conversation.

**What happened while you read** (the repaint notice: "Daniela wrote again", "Moved to Handled") moves into the pane,
because it is about the thread. Keeping a thread on screen after a read moves it out of its bucket stays with the
Inbox, because it is about the list.

## What each tab keeps

**The Inbox** draws `ThreadPane` for a real thread. Its list, buckets, bulk acts, keyboard and the mockup are
unchanged.

**Conversations** stays the list by channel — All, Calls, WhatsApp, Email — and a conversation row opens the one
thread beside it on a desktop, over it on a phone. From there you can answer, take it, hand it back, snooze or
archive it, as in the Inbox. What goes:

- **View thread in Inbox** — you are in it.
- **Open profile** and **Export** as header buttons — both are in the `…` menu now (Export is new there, so the Inbox
  gains it too).
- **The status pill in the header** — the status band says it, with what to do about it.
- **The "Latest from…" card** — for a chat or an email the thread's last bubble is the latest; the card repeated it,
  and the quoted chain with it.
- **A link to a conversation not in view opening someone else's.** The first row used to open beside the notice —
  read-only then; with the one thread it would be another customer's reply box. The pane says the conversation
  isn't loaded, and opens nobody else's, as the Inbox already does.

A **call row** — a call record, with its recording and transcript — keeps CvViewer for now. The next PR draws it in
the same frame. So do **the mockup's seeded rows**: their threads act only inside the Inbox page's demo state, so
from Conversations the one thread could not act on them. The mockup keeps CvViewer's chat half until the next PR
retires CvViewer and draws those rows as threads; production never reaches it.

## One look, wherever it is mounted

The thread's phone rules were written as `.inbox …`: the event line without its timestamp, "Why" instead of the
summary, the menu as a sheet, a bubble 88% wide, the status band's phone padding. Mounted in Conversations the same
thread would draw without them — two looks again, from one component. They move onto the thread's own root. The
page-level rules (the list and the thread taking turns, the section tabs and the ✦ stepping aside while a thread is
open) get the same rule for Conversations.

## In the view model

In production, one view model builds every bubble anyone sees: `toInboxThreadVM`'s
timeline, drawn by `TimelineEntry`. `toConversationVM` keeps its `messages` for one job — the words a row is searched
by — and those, with the row's preview, come from the same split an email's bubble uses (`splitQuotedReply`), so
the Conversations preview for ruben@rjcapital.io reads "Got it, thanks!" too. Nothing is built twice for display.

## What comes after

1. **This PR** — chats and email are one thread.
2. **Calls in the same frame** — a call with a conversation opens that thread at its call note, with the recording
   and the transcript there; a call with none opens its record in the same header and menu. `CvViewer` goes.
3. **One list row** — the Conversations and Inbox rows become one component.

## How it is proven

- The pane on the stub React (`conversations-doors`' harness): a conversation row draws `InboxThread` for its
  thread; the verbs reach `__inboxVerb` with that thread; the pane says it is reading before the Inbox's read lands;
  Export is in the menu with the conversation's own route.
- Every Inbox and Conversations test that pins the old viewer is kept true, or moved to what replaced the thing it
  guarded — never loosened into a source scan.
- On production after deploy, on a phone and a desktop: ruben@rjcapital.io opened from each tab is the same thread,
  measured, not eyeballed.
