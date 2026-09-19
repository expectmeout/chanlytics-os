# Google Maps' terms and the lead finder: a review

**Decision, Ruben, 18 September 2026:** leads come through Apify actors, with the Google Maps actor as the default for local businesses. He has read this review and accepts its risk. It stays as the record and is not a gate.

Written 18 September 2026 by Claude, at Ruben's request, from the primary documents and published rulings listed at the end. **This is not legal advice.** Claude is not a lawyer. It is a close reading of Google's terms and the US case law, to decide what to build. Where the answer turns on a judgment a court would make, it says so.

## The question

May Chanlytics, as a paid feature, have a third-party scraper (an actor on Apify) collect Google Maps listings and the contact details on each business's website for a workspace? Then store them as leads, show them, let the owner export them, and send the listing facts to a model that judges fit?

## The short answer

1. **Scraping consumer Google Maps for a paid lead product breaks Google's own terms, and having Apify do it does not change that.** The Maps terms (§2(c)) forbid mass downloading or bulk feeds of Maps content, including letting anyone else do it. Section 2's opening line also covers anyone acting on your behalf.
2. **Whether Google could enforce that against Chanlytics is genuinely uncertain.**
   - **In our favour:** scraping public pages is not a computer crime (hiQ, 9th Cir. 2022). One court held that contract claims trying to control public, uncopyrightable facts are preempted by copyright law (X v. Bright Data, 2024).
   - **Against us:** Google's terms say they bind signed-out visitors. Meta's terms did not, and that was the distinction the court relied on in Meta v. Bright Data (2024). A scraper that had accepted a site's terms lost on contract (hiQ, 2022).
3. **Google's enforcement so far targets scraping vendors, not their customers.** It sued SerpApi in December 2025. That suit was dismissed in July 2026, refiled narrower in August, and is still open.
4. **The real risks for Chanlytics are business risks more than a lawsuit:**
   - Google can close accounts that scrape content that isn't theirs (its general terms name scraping as an example). That includes the Maps Platform account the Google reviews feature needs.
   - Supply: the scraper can break, or be withdrawn under Google's pressure, taking the feature with it.
   - Selling customers a product built on data Google says may not be collected this way.
5. **Google's licensed route does not fix it.** The Maps Platform terms (§3.2.3) forbid copying and saving business names, addresses or reviews from the API, and caching anything but place IDs. The PRD's "Places API fallback" cannot feed a stored, exportable lead list either.
6. **Recommendation:**
   - **Don't launch Google Maps scraping to paying workspaces.**
   - **Build discovery on openly licensed places data.** Overture Maps' places (CDLA-Permissive-2.0) and Foursquare's open places (Apache 2.0) both carry names, addresses, phones and websites for commercial use. Foursquare's schema also lists email.
   - Take contact details from each business's own website, check the mailbox as planned, and keep the Google Maps scrape as an internal yardstick only.
   - **First, measure coverage (free).** If open data finds far fewer of the right businesses and Google Maps is still wanted as the source, that is the moment to pay a lawyer: it would mean knowingly operating against Google's terms.

**Not taken.** Ruben kept the Google Maps actor through Apify and accepts the risk (the decision at the top).

## What the documents say

**Google Terms of Service** (effective 30 July 2026).
- **Who is bound:** anyone who accesses Google's services, signed in or not.
- **"Don't abuse our services":** forbids automated access that violates a page's machine-readable instructions such as robots.txt.
- **Suspension and termination:** Google may act on a material breach; its examples include scraping content that doesn't belong to you.
- **Governing law:** California, with disputes in the Santa Clara County courts.

**google.com/robots.txt** (read 18 September 2026). For every crawler:
- **Allowed:** `/maps/search/`, `/maps/place/`, `/maps/preview` and `/search?…tbm=map`.
- **Disallowed:** the bare `/maps?` (except listed parameters) and `/maps/` generally.
- The paths a Maps scraper uses are mostly on the allowed list, so the robots.txt clause is probably not where the problem lies. The Maps terms are.

**Google Maps / Google Earth Additional Terms** (last modified 27 January 2026). These apply on top of the Terms of Service to anyone using Google Maps. Section 2 opens: you may not, *"or allow those acting on your behalf to"*:
- (a) Redistribute or sell any part of Maps, or create a new product or service based on it.
- (b) Copy the content, except as your permissions or intellectual-property law (including fair use) allow. Facts such as names, phones and addresses are not copyrightable (Feist, 1991), so (b) bites less on facts.
- (c) Mass-download or create bulk feeds of the content, or let anyone else do so. **This is the clause a lead finder breaks.**
- (d) Use Maps to create or augment a mapping-related dataset, which it says includes business listings databases, mailing lists and telemarketing lists. But it applies only when the dataset serves a service that substitutes for, or closely resembles, Google Maps. A lead list does not, so (d) most likely does not apply.

**Google Maps Platform Terms of Service** (last modified 26 August 2026). These bind API customers.
- **"Google Maps Content"** means content provided through the Services, the APIs, including places data and business listings. So these terms govern what Chanlytics takes from the Places API, not what a scraper takes from the consumer site.
- **§3.2.3(a) No Scraping:** no exporting or extracting content for use outside the Services. The listed examples include bulk-downloading places information and copying and saving business names, addresses or user reviews.
- **(b) No Caching:** nothing may be cached beyond what the service-specific terms allow.
- **(c)(vii):** Maps content may not be used to train, test, validate or fine-tune models. The judge only reads listing facts at inference, but it could never read Places API content.
- **(d)(iii):** the core services may not be used in a listings or directory service.

**Places API policies:**
- Place IDs may be stored indefinitely.
- Everything else falls under the caching restrictions.
- Content shown without a Google map carries a "Google Maps" attribution.
- Reviews carry their author's credit.

**Apify.** Complying with the target site's terms, and with data-protection law, is the customer's responsibility under its terms and shared-responsibility model. For personal data, Apify is a processor acting on the customer's instructions.

## What the courts have said (United States)

- **Van Buren v. United States (2021) and hiQ Labs v. LinkedIn (9th Cir. 2022):** scraping public pages is not access "without authorization" under the Computer Fraud and Abuse Act.
- **hiQ's contract loss (N.D. Cal., November 2022; settlement December 2022):** hiQ had accepted LinkedIn's user agreement and used fake accounts. It lost on breach of contract, then settled with a $500,000 judgment, an injunction and destruction of the scraped data.
- **Meta v. Bright Data (N.D. Cal., January 2024):** Meta's terms bound only users, so logged-off scraping of public data did not breach them. The court relied on Meta having removed language that bound visitors. Google's terms still bind signed-out visitors, which cuts the other way here. Whether a browsewrap binds without real notice is still for a court to decide.
- **X Corp v. Bright Data (N.D. Cal., May 2024):** state contract claims that would control the scraping of public, uncopyrighted data were preempted by the Copyright Act. That is one district court's view, not settled law.
- **Google v. SerpApi (N.D. Cal., filed 19 December 2025):**
  - Google sued a search-results scraper under the DMCA, for circumventing its anti-bot protection.
  - Dismissed 20 July 2026, on the ground that public search results are not copyrighted.
  - Refiled on narrower grounds 10 August; a new motion to dismiss was filed 25 August.
  - Google is willing to fight scraping vendors in court.

## The laws that apply whatever the source

- **California (CPRA):**
  - The business-to-business exemption ended on 1 January 2023, so a sole proprietor's name, phone or email is personal information.
  - The exception is information the business reasonably believes the person lawfully made public. A business's own listing and website fit that well.
  - Keep the source of every fact, as the plan already does.
- **Texas data broker law (SB 2121, in force 1 September 2025):**
  - It covers collecting or transferring personal data not collected from the individual.
  - It applies to a company that makes more than half its revenue that way, or makes revenue directly from the personal data of more than 50,000 individuals in 12 months.
  - Leads included in the plan are not revenue made directly from data. **Lead packs could be**, so revisit this before selling packs and count individuals (sole proprietors) separately from businesses.
- **California's data broker registry (Delete Act):** it uses the CCPA's definition of personal information, which excludes publicly available information. Revisit it with the Texas question before packs.
- **CAN-SPAM** covers business-to-business commercial email. The rules:
  - A truthful sender and subject.
  - The message identified as an advertisement.
  - A physical postal address.
  - A working opt-out, honoured within ten business days.
  - Responsibility for anyone sending on your behalf.

  The draft must meet all of them; the owner sends it.
- **Telemarketing Sales Rule (amended March 2024, in force 16 May 2024):** business-to-business telemarketing may not include material misrepresentations or false statements.
  - B2B calls stay mostly outside the Do Not Call rules.
  - The TCPA still requires consent for autodialed, artificial-voice or prerecorded calls to mobiles, and many small businesses answer on mobiles. The product never does those for leads.

## The routes, side by side

| Route | Under the terms | Enforcement today | Business risk | Verdict |
|---|---|---|---|---|
| Scrape consumer Google Maps through Apify; store, show, export | Breaks the Maps terms §2(c), including through someone acting for you | Low at our scale; Google has gone after vendors | Account closure (including Maps Platform), the source breaking, reputational | **Not for paying workspaces**; internal yardstick only |
| Places API; store and export the results | Breaks Platform §3.2.3(a) (copy and save names and addresses), (b) caching, (d)(iii) directory use | Contractual; API customers can be audited | API key revoked | **No** |
| Places API for display only (a rating fetched when shown, with attribution; only the place ID stored) | Allowed | — | A cost per view | Optional add-on, later |
| Open places data (Overture, Foursquare) plus the business's own website | Licensed for commercial use, with attribution | — | Coverage and freshness not yet measured | **Recommended**, after a free coverage check |

## What changes in the product, if Ruben agrees

Not taken: Ruben kept the Google Maps actor (the decision at the top). Kept as the record.

- **Discovery:**
  - Businesses come from open places data, filtered by category and area.
  - The website each listing gives is read for contact details: the business's own public pages, respecting robots.txt.
  - Mailboxes are checked as planned.
  - Provenance in the product becomes "A business listing (Overture or Foursquare)" and "their website", and each source is credited as its licence asks.
- **The judge** still decides fit, now from the listing facts that open data carries.
- **Ratings and review counts:** open data doesn't carry Google's.
  - Fit leans on category, website presence, social profiles, operating status and the dataset's own confidence.
  - A rating, if it matters, is fetched at display time from the Places API, with attribution and nothing stored.
- **The coverage check comes first, and costs nothing but time.**
  - Take three niches (personal trainers in Austin, injury firms in Miami, wedding planners around Austin).
  - For each, compare Overture's and Foursquare's results against a fresh Google Maps sample read for the comparison only and not stored: share found, phone, website and email completeness, closed places and wrong-kind rate.
  - Overture's files are public on S3 and read with DuckDB, a Python package of about 20 MB; installing it needs Ruben's yes. Foursquare's needs a free account on its portal (Ruben's to create) or Hugging Face access.
- **If open data finds materially fewer of the right businesses** (as a working line, under about 70% of what a Google search finds), bring the trade-off back to Ruben with the numbers. A lawyer's opinion is worth paying for at that point.

## Inside Apify only (Ruben, 18 September)

Superseded the same day: the Google Maps actor is the first source, with no side-by-side and no acceptance step, and Claude chooses the source for each ask (PRD §16, decisions 22–23).

Ruben's constraint: Chanlytics gets leads only through actors on Apify, never from Google Maps or any other source directly. That changes the options, not the reading of the terms.

- **What Apify changes.**
  - Chanlytics never touches Google; the actor's developer and Apify do the access, from their own servers.
  - Google's enforcement so far (SerpApi) has gone after the scraping vendor, not its customers.
  - So the chance of Google pursuing Chanlytics is lower than for a company scraping on its own.
- **What it does not change.**
  - Apify's terms and its shared-responsibility model make the customer responsible for complying with the target site's terms and with data-protection law. Apify acts as the customer's processor.
  - The Maps terms reach anyone acting on a user's behalf, if Chanlytics counts as a user.
  - The business risks stay: the actor can break or be withdrawn, and a paid product would rest on data collected against Google's terms.
- **The licensed route exists inside Apify.** Overture-backed actors are on the Store:
  - `foxlabs/location-intelligence`: Overture's ~76M places by area and category, with phones, emails, websites and socials. About $0.005 a result; updated 7 September 2026.
  - `datavaultlabs/local-business-lead-intelligence`: Overture discovery plus robots.txt-respecting website enrichment for emails and phones, with lead scores. About $0.004 a result; updated 18 August 2026.
  - Both are new, with 2–3 users each: the data is licensed, the actors are unproven.
- **The recommendation, revised for the constraint:**
  1. Hide the discovery actor behind one source port. The recipe can then run on an Overture actor, on the Google Maps actor, or on a second Google Maps actor (`vortex_data/google-maps`) as a fallback.
  2. Compare the Google Maps actor and the Overture actors side by side on the same three niches. That costs about $1, from the roughly $2.90 left of the $5 calibration budget Ruben approved.
  3. If an Overture actor finds at least about 70% of the right businesses the Google Maps actor finds, make it the default: licensed data, the same product.
  4. If not, the Google Maps actor can be the default only with Ruben's explicit, recorded acceptance of the terms risk above, and with these mitigations:
     - Facts only: never review text or photos.
     - Retention limits.
     - No "Google Maps data" in marketing.
     - The fallback actor.
     - A lawyer's opinion before lead packs, or before scaling past the invited pilot.

## Sources

- Google Terms of Service: https://policies.google.com/terms
- Google Maps / Google Earth Additional Terms of Service: https://www.google.com/help/terms_maps/
- Google Maps Platform Terms of Service: https://cloud.google.com/maps-platform/terms
- Places API policies and attributions: https://developers.google.com/maps/documentation/places/web-service/policies
- google.com robots.txt: https://www.google.com/robots.txt
- Apify shared responsibility model: https://docs.apify.com/security/shared-responsibility and General Terms: https://docs.apify.com/legal/general-terms-and-conditions
- Overture-backed actors on Apify: https://apify.com/foxlabs/location-intelligence and https://apify.com/datavaultlabs/local-business-lead-intelligence
- hiQ v. LinkedIn settlement: https://www.privacyworld.blog/2022/12/linkedins-data-scraping-battle-with-hiq-labs-ends-with-proposed-judgment/
- Meta v. Bright Data: https://www.fbm.com/publications/major-decision-affects-law-of-scraping-and-online-data-collection-meta-platforms-v-bright-data/
- X Corp v. Bright Data: https://www.skadden.com/insights/publications/2024/05/district-court-adopts-broad-view
- Google v. SerpApi: https://www.searchenginejournal.com/google-files-dmca-suit-targeting-serpapis-serp-scraping/563847/ and https://www.theregister.com/offbeat/2026/02/21/serpapi-asks-court-to-dismiss-google-web-scraping-lawsuit/4591023
- CPRA "publicly available": https://www.truevault.com/blog/what-is-publicly-available-information-under-the-ccpa
- Texas SB 2121: https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20250904-texas-expands-and-modifies-data-broker-registration-law
- Telemarketing Sales Rule, B2B: https://www.ftc.gov/news-events/news/press-releases/2024/03/ftc-implements-new-protections-businesses-against-telemarketing-fraud-affirms-protections-against-ai
- CAN-SPAM: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business
- Overture places: https://docs.overturemaps.org/guides/places/ and licensing: https://docs.overturemaps.org/attribution/
- Foursquare OS Places: https://docs.foursquare.com/data-products/docs/fsq-places-open-source and schema: https://docs.foursquare.com/data-products/docs/places-os-data-schema
