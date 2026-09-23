# A proposal is a link on the person — design

Ruben's ask, 22 September 2026: on a person, attach a proposal, and the receptionist or the OS
puts it into the reply or the email draft, the way the booking link already goes out. A LINK,
never a file: the product stores no documents, and booking already works this way. Checked
against the code at `1b26296d` (#884) before it was written; where this note and the code
disagree, the code wins.

## What the code already does

- **The booking link is text, not a tool.** On WhatsApp and SMS the prompt names the workspace's
  one link (`tenant_config.brain.booking_link`) and the model pastes it into its own reply
  (`docs/conversation-flow.md`, stage 9: "the model pastes the booking URL into its words").
  Voice is the only channel with a send tool, and it sends an approved template.
- **The receptionist reads one per-person text**: the owner's notes, loaded by `readLeadContext`
  (`packages/db/src/repositories/thread.ts`) and phrased by `describeLead` into the uncached
  "Who you are speaking with" block that WhatsApp, SMS, voice and the steer rewrite all share.
- **Every person field saves the same way**: an inline control in the About rail →
  `window.__setPersonDetails` → `PUT contacts/[id]/details` → a `security definer` door
  (00054 name and notes, 00125 email) that writes its own ledger event without the value.
- **Sends live in Right now.** The person page's "Text the booking link" button sits beside the
  thread button and carries the words into the Inbox composer through
  `sessionStorage["chanlytics-compose"]`; its words are contracts' `bookingLinkAction`, channel-aware.
- **Nothing sends files on any channel.** Links are the only rich content the product has.
- **Email is live but reply-only**: a person answers an email the customer sent; the subject is
  `Re: …`; `emailHtml` escapes and does not linkify. The receptionist does not draft email
  (deferred until the trust policy). Held drafts exist on WhatsApp and SMS only.
- **The price rule fits.** `violatesNoPrices` swaps any priced draft; the prompt says never quote a
  price. A proposal is the owner's priced answer; the receptionist hands over the address and
  states no figure. A URL passes the detector.
- **Ask's `get_person`** builds its own detail record without notes, so it sees no proposal unless
  one read is added there.
- **Migrations**: main ends at 00152; 00153 is taken by the held smart-lists PR (#874). This is 00154.

## Decision

One URL column on the person, one door, one ledger kind, one sentence to the receptionist, one
About row, one Right now button, one Actions item in the thread. No file, no table of links, no
lifecycle, no template slot, no new tool, no policy change.

### Storage (00154)

`contacts.proposal_url text`, CHECK: trimmed, `^https?://[^[:space:]]+$`, 10–500 characters.
A BEFORE UPDATE OF `erased_at` trigger clears it (00125's shape). Door
`set_person_proposal(p_contact_id uuid, p_url text)`: owner or operator (`is_acting_member`),
empty clears, writes `contact.proposal_set {set, by}` — never the address, because events outlive
an erasure. Not in `people_list` (the page reads it beside the notes), not in the CSV or the
everything export (nor are the notes).

### One derivation of "a web address"

`packages/contracts/src/link.ts`: `normalizeLink` (trim, supply a missing `https://`, http(s)
only, a dotted host, no whitespace, ≤ 500) and `whyNotALink` (the refusal in the owner's words);
`linkHost` for the row. The page checks before a round trip, the route checks before the door, the
CHECK stops a writer that did not.

### The receptionist

`LeadContext.proposalUrl?` (optional, so every fake still compiles); `readLeadContext` selects the
column; `describeLead` adds one sentence:

> The owner has a proposal ready for them at `<url>`. If they ask about price, a quote or the
> proposal, send that link and state none of its figures; on a call, never read the address out —
> say it is being sent to them in writing.

That reaches WhatsApp, SMS, voice (`caller_context`) and the steer rewrite. Under
`faq: ask`, layer two still replaces a pricing reply and hands it to a person — a proposal on file
does not change that. Letting it through under Ask is a possible later dial on the Autonomy pane.

### The person page

- **About**: a "Proposal" row under Email, `PersonProposal` in `PersonEmail`'s shape: the host as
  a link (full address on hover, opens in a new tab), a quiet pencil, "Add a proposal link" when
  empty. What is wrong with a typed address is said under the field.
- **Right now**: beside the booking button, `Send the proposal` (Email: "Email the proposal";
  Text: "Text the proposal"), words from contracts `proposalAction(replyVia, win, sentWords)`.
  Once the address has gone out, the label reads "… again" and the title says when and by which
  wire; change the link and it reads plainly again. Rendered only when free text can go (email,
  text, or an open WhatsApp window) and never for someone who opted out. A closed window shows no
  button: the About rail's "Reply window" row already says why.
- **"Sent" is derived, not stored**: the newest outbound message the page already reads whose body
  contains the current address and whose status is not queued, canceled or failed.
- The message the button carries is one function, `proposalMessage(url)` in contracts:
  "Here's the proposal we put together for you: <url>", published as `window.__proposalMessage`.

### The thread

The conversation DTO's contact select gains `proposal_url`; the thread VM gains `proposalUrl`; the
Actions menu's person group gains "Send the proposal" (hint: the host) when a link is on file, the
thread is real, the window is open and they have not opted out. It fills the composer through a
new `inbox:compose` event (empty box → the sentence; words already typed → the address on its own
line). No chip, no button.

### Ask and email

`getPerson` reads `proposal_url` into its detail record, so `about` carries "Proposal: <host>" and
`draft_reply` can carry the link. `emailHtml` wraps `http(s)` addresses in `<a>` after escaping,
trailing punctuation left outside the link.

## Out, on purpose

Files or uploads. A links table with kinds. A viewed-or-accepted lifecycle (a plain link cannot
report it). A `proposal_link` template slot and a voice tool (feasible later: the booking starter
already carries its URL in a body slot; it would unlock a closed WhatsApp window and texting from a
call, at the cost of a starter template, a slot kind and a voice-shell republish). A first email to
someone who never emailed (the email contract is reply-only). The receptionist drafting email. A
`faq: ask` bypass.

## Order of landing

PR 1 (storage, door, words, route) merges on green; **00154 is pushed to production before PR 2
merges**, because PR 2's selects need the column. PR 2 (the receptionist and the person page),
PR 3 (the thread, Ask, email).
