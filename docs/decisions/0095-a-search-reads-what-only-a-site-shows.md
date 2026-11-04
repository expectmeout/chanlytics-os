# 0095 · A search reads what only a site shows, and a site is read once

**Status:** Built on the lane `cm-site-reads` (`edge/website-reads-get-their-time`), 4 November 2026, on Ruben's word
("build tiers 1-3 end to end"), from the review `Claude Video/docs/2026-11-04-website-reads-review.md`. Migration 00541.
Written against main's `d56b2e620`. No real search has run through it yet: `lead_collect`'s `siteReads`, `lead_rounds.site_reads`
and the sweep's `marks_due` and `marks_kept` are what say it works. Firecrawl's `branding` and `map` were written to its
documentation, not a live call: the look keeps its own reading behind `branding`, and `website_look` logs which answered
(`logo_from`, `accent_from`), until real reads have proved it.

## Context

PRD §7.1 held the judge to a listing's facts, "never a page's own words", and a seen criterion to a fact a listing can show.
So "offers boxing classes" or "books online" could only ever be unknown: every place went to Needs review, the question after the
probe fired on nearly every such search, and the card's own words told the planner not to ask. Meanwhile the site was being
read anyway. Since 31 October (decision 0054, Firecrawl) a search has read each kept place's home page for its mark, a cold
email's check reads it again for its opening, and a preview reads it a third time. A read is one credit whatever it
answers, the provider's cached copy too, and none of them was counted: the budget that "bounds scraping, judging, checks and
retries" (PRD §16.32) did not bound this.

Three smaller things had the same root, that nothing had been redrawn for a reader that takes seconds rather than a GET:
the booking page was read inside the link's own request with four seconds to answer, the mark step reserved a whole judge's
bound behind the page's last batch, where no judge follows, and an edge without its key told every owner their site was down.

## Decision

1. **A plan says what only a website can show.** A criterion may be `on_site` (contracts `LeadCriterion`): Ask writes it, with
   `seen`, where the owner asks for what a business offers, sells or how it books, and only then. `planReadsSites` is the one
   test. A plan without one is shown to the judge word for word what it always was, so its reused answers stand, and is priced
   as it was.
2. **The judge reads it as one more quoted fact.** `PlaceFacts.site`: the page's title, its description and its main content's
   first words, in one line, at most `LEAD_SITE_FACT_MAX`, no angle bracket and no format character, inside the same `<places>`
   block whose rubric says it is data and never instructions. A pass must cite it, which code holds (`classify`: a pass that cites
   anything else goes to Needs review as only the listing's say, whatever standard the criterion was written with), and code still
   decides the class. Reading the home page alone is the limit: a fact only on another page stays unknown, and the place goes to
   Needs review, which is free.
3. **A second model never sees a page's words.** They can name people. The shadow and the screen get the place without them,
   and are not asked what only a site can answer.
4. **No place is judged blind for want of time.** Sites are read after the screen and before the judge, six at once, in what the
   judge's bound leaves, each given at least four seconds. The batch stops at the first place whose site could not be asked for:
   what precedes it is judged and committed, and the rest is the next job's, whole, so a slow search is a slow search and never
   a lot of "unknown". A batch that moved nothing waits fifteen seconds under a job name of its own, because this job already
   holds the name its offset would give. A site that answered nothing is another matter: that is the place's own, and it is
   judged with `site: null`.
5. **A site is read once.** `siteReadsOf` holds one run of the collect's reads by host: the mark step finds the judge's page in
   hand, and two listings of one site are one read. Apify's contact step still visits the site too; it finds the emails and
   social links, returns no page, and costs less than a read, so it is not a duplicate to remove.
6. **A read is paid where it is read.** `lead_site_reads_spent` (00541), as the collect lets go of its run: `LEAD_SITE_READ_USD`
   a read, against the round while it lives (`site_reads`, `cost_usd`, the counters out of its reservation), else this month and
   today, as a re-check is. A plan that reads sites reserves for them (`estimateRoundUsd`, `lead_estimate_ceiling`); one that does
   not reads only for a mark, in its spare time, and its room covers that. A failed write is logged and costs the record, never
   the page.
7. **The marks get real time.** The step's end is its caller's (`markUntil`): its allowance, or what must stay free behind it,
   the next judge's whole bound only where another batch follows in this job (never behind a page's last batch, or one the time
   cut short), and otherwise only the kill margin its commit runs inside.
   The leads sweep tries again once, a few minutes on, for what a collect had no time for and for a people search's companies,
   whose collect marks none: the leads found in the five minutes before its last whole slot, so however late a tick runs inside
   its five minutes each lead is tried by one tick. A read of it is paid by its workspace.
8. **The booking page has one home: the website's read.** `business_reads.facts.booking_page` is where the site says customers
   book, and `booking_read` whether a booking platform's page was read beside it. Check offers it from there, so a business that
   is not on Google gets the offer too; the link reads no site, and answers sooner. `GoogleListingFacts.booking_page`,
   `bookingPageKept` and `GoogleDto.bookingPage` are gone, and a listing's old copy falls away at its next read. Decision 0073's
   item 27 stands; its 3c-4 reads this way.
9. **Every read of a page says what it is.** `PAGE_READS` (`lib/public-page.ts`) names each read's time, its size, whether it
   wants the page as it stands now, never the provider's copy of two days (`fresh`, what an owner's press reads: what they just
   changed must be what is read), and whether it wants the look. `homePage` asks a site's other spelling, www. or not, inside the
   same time: a site often answers on one alone.
10. **A cold email's site line is the page's main content.** `siteWordsOf` (core, one reading for the opening and the judge)
    reads the reader's title, description and Markdown, where it had read the raw page, menus and footers included.
11. **The look asks the reader first.** The home page's read at an owner's press asks for Firecrawl's `branding`: its logo goes
    first to `siteLogoFrom`, held to the same bytes and the same builders' stock marks, and its primary colour through
    `accentOfColour`, the same two rules as a theme colour. `siteAccentOf` and `leadMarksFrom` stand behind it, until `website_look`
    has shown enough real reads to take them out. A lead's read does not ask: it is time-poor and many.
12. **A site's other pages.** `sitePagesLinkedFrom` also reads a link's address, near the site's root, where its words say nothing
    ("/hair-services" under "Hair"). A home page that links to none of them leaves the reader's map to ask (`siteLinks`, one
    credit), by the same word rule over what each page's head calls it. Firecrawl's `links` format alone would have thrown away
    the link's own words, which is the better signal, and is free in the page we already hold.
13. **The reader's credits are watched.** With none left every read comes back empty and nothing anywhere is wrong by itself. The
    health sweep reads what is left (`site-reader-watch.ts`) and pages, through the pager, under a tenth of the plan or 500, and
    when the key is refused; a read refused in the moment logs `site_read_refused`. With no reader at all the website read says
    it failed, never that the site did not answer, and the sweep's second try looks at nothing.

## Consequences

- A search that reads sites costs about 60% more a place, and a batch of it takes up to twenty seconds longer: one batch a tick
  is its likely pace. A plan that does not read them costs what it did.
- `PRD §7.1` is amended where a plan asks: the judge may read a page's words, inside its data block. A page written to talk to
  the model has only the rubric's guard and the schema's shape between it and a passed criterion; the worst it can buy is a
  lead the owner reads and turns down, so it is accepted, and a pass must still cite the site.
- The round's `cost_usd` now holds reading beside the provider's usage. The card's price is the dearest plan's; the true price is
  the plan's, which the credit watch shows.
- Not built, on purpose: keeping what a site says on the lead, so a later cold email reads nothing. It would save one credit for a
  lead that reaches a sequence and whose listing gives no opening, at the cost of a second writer of `leads.facts` for every lead
  found; the provider's copy already spares it the time.
