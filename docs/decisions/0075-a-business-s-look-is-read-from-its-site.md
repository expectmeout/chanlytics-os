# 0075 · A business's look is read from its site

Decided by Ruben on 28 October 2026, in the conversation that followed the emails-and-forms review (the owner alerts'
layout first, then this). Written against main's `cfbbabb21` (#1900). Built on the lane
`email/a-business-s-look-is-read-from-its-site`; its migration is 00490.

## Context

Every email a business sent its customers left as plain paragraphs, whatever it was for, and the pages such an email
opened (`/c/<token>`, `/u/<token>`) wore Chanlytics' own coral. The brand on a mail is whoever the reader is dealing
with: a customer of a salon is dealing with the salon. The one email where this costs most is the website sign-up's
confirmation (00489): the person was on the salon's site seconds earlier, and an unbranded mail from an unknown sender
with a raw link reads as phishing, so nobody presses it, and the salon never gets a list to send offers to.

A workspace already wore a logo (00407: the bucket, the door, the Logo row with "Use the one on your website"), but by
an owner's press alone, and nothing of the workspace held a colour. New sign-ups arrive without a hand to press
anything: the first run must do it.

## Decision

1. **Two facts on the row.** A workspace's look is its logo (`tenants.logo_path`, 00407) and its colour
   (`tenants.accent`, 00490: one lower-case `#rrggbb`). Nothing else: inboxes strip the rest, and a logo and one colour
   are what a reader recognises.
2. **No model draws a layout.** One letter (contracts `letterHtml`), table-built and tested once, takes the two facts.
   The sign-up confirmation is its first use (`signupConfirmEmailHtml`); an offer's letter follows later and reuses it.
   Visit mail (reminders, "how did it go", win-back) and every reply stay plain, as a person's email is: they are
   written to be answered, and a template is not answered.
3. **The first run reads the look.** The `website_read` job (0073) already fetches the home page; it now reads the
   page's colour in code (core `siteAccentOf`: the theme-color meta, else the buttons' background, else the most used
   colour that is neither paper nor ink; darkened until white words read on it) and the mark the site declares (core
   `siteLogoFrom`, the same reading as the Logo row's lookup), remakes a square PNG of it (channels
   `remadeLogo`, moved
   from the dashboard and taught to shrink a square up to 2048 to 256), stores it in 00407's bucket and wears both
   through one service-role door, `wear_found_look`. What was found is kept with the read (`business_reads.facts.look`).
4. **The owner's choice stands, including the choice of none.** `wear_found_look` fills a field only where its column is
   empty AND no `settings.changed` event names that field with a `by`. A logo or colour a person set, or cleared, is
   never written over by a read, however often the website is read again. The read's own event says `by: null, from:
'website'`.
5. **Set and seen in Settings › Business.** A Colour row after the Logo row: a swatch, Change, the browser's own picker,
   and under it the very email a customer gets, drawn with the draft, so what is previewed is what is sent. Its door is
   `set_workspace_accent` (the member's, settings permission, as `set_workspace_logo` is); its route
   `PUT`/`DELETE workspaces/accent`. The boot's workspace list carries `accent` beside `logo_url`.
6. **The pages wear it too.** The confirmation and unsubscribe pages draw the business's mark over the card and its colour
   on the button and links (`linkPageLookOf`, `linkPageMark`, `linkPageStyle`), on the product's paper as before.
7. **Existing workspaces** are asked the same read once, by `tooling/scripts/ops/look/look-backfill.mjs` (dry-run by default,
   `--apply` on Ruben's word, after 00490 is on production).

## Consequences

- An email a business sends through the letter reads as the business's; nothing changes for the plain ones.
- A square icon the site declares (an apple-touch-icon, almost always) is worn without a press; a wide or non-PNG mark is
  kept with the read for the Logo row's "Use the one on your website", which makes it square in the browser.
- Either deploy order works: the edge reads the colour leniently (a database before 00490 answers none), and the
  dashboard's list reads without it where the column is missing.
- Owed after this lane: the Logo row offering the found mark the read could not make square; the offer letter (lane 4);
  the letter's words in the version's language once offers ride it.
