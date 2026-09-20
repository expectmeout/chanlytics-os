# Lead finder D2: who they are — the peek's own facts and one Reach column

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner opens a lead and understands who the business is — in its own words, where it is, when it is open, what it looks like — and the table shows in one glance whether it can be reached; all from fields the source already returns, at no new cost.

**Architecture:** The Maps card (`packages/core/src/leads/cards.ts`) asks Apify for eleven more of the ~90 fields it already returns per place; the runner hands them to `lead_collect_commit`; migration 00144 gives `leads` the columns and `leads_page` the outputs; contracts' DTO and the two view models carry them; the peek and the table draw them. A left-out place stores none of them (PRD §0.4 keeps a left-out place to the facts that decided it; the columns are null). Approved as a whole ("all approved as you best suggest").

**Tech Stack:** as D1 (`docs/plans/2026-09-20-lead-finder-D1-clean-leads.md`) plus one migration, pushed to production before the merge per `production-db-push-is-mine`: dry run with the cached CLI, confirm it lists only 00144, push, read back, then merge. Regenerate `packages/db/src/database.types.ts` from the local stack (`node tooling/scripts/check-db-types.mjs` with `SUPABASE_CLI` set).

**Not in D2:** Needs review as a queue and the second contacts pass (D3); email from the hosted mailbox and the outbound agent (D4).

---

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `packages/core/src/leads/cards.ts` | `MAPS_FIELDS`, `MapsPlace`, `mapItem` | 1 |
| `supabase/migrations/00144_the_lead_carries_what_the_listing_shows.sql` | the columns, `lead_collect_commit`, `leads_page`, the erase | 2 |
| `packages/core/src/leads/runner.ts` | the place object handed to the door | 3 |
| `apps/dashboard/src/server/leads.ts` | the door's row → `LeadRowDto` | 4 |
| `packages/contracts/src/leads.ts` | `LeadRowDto`, `toLeadPeekVM`, `toLeadRowVM`, the words | 4 |
| `apps/dashboard/src/legacy/pages/leads-peek.jsx` | About, the address, the hours, the photo, the socials, the claimed note, the rank | 5 |
| `apps/dashboard/src/legacy/pages/leads-scope.jsx` | the Reach column; the photo in the Business cell | 6 |
| `apps/dashboard/src/server/leads.ts` (`LEAD_CSV_COLUMNS`) | the export | 6 |
| `apps/dashboard/src/legacy/styles/leads.css` | `.pk-about`, `.pk-where`, `.pk-mark img`, `.ld-reach-cell`, `.ld-mark img` | 7 |

---

### Task 1: The card asks for what it already returns

**Files:**
- Modify: `packages/core/src/leads/cards.ts` (`MAPS_FIELDS` ~line 19, `MapsPlace` ~line 31, `mapItem` ~line 101)
- Test: the file that pins `mapItem` (`grep -ln "mapItem(" tooling/scripts/tests/*.test.mjs`)

- [ ] **Step 1: The failing test.** Beside the existing `mapItem` pin, an item with the eleven fields:

```js
test("the card keeps what the listing shows about the business: its own words, hours, a photo, the spread of reviews, price, the socials, whether it is claimed, its rank, its Maps page", () => {
  const item = {
    title: "Breeza Biscayne", placeId: "ChIJfixture1", categoryName: "Wedding venue", location: { lat: 25.79, lng: -80.19 },
    description: "Waterfront venue for weddings and private events.", ownerDescription: "Family-run since 2009.",
    openingHours: [{ day: "Monday", hours: "9 AM to 6 PM" }, { day: "Tuesday", hours: "Closed" }],
    imageUrl: "https://lh3.example/photo.jpg", reviewsDistribution: { oneStar: 1, twoStar: 0, threeStar: 2, fourStar: 8, fiveStar: 30 },
    price: "$$", facebooks: ["https://facebook.com/breeza"], linkedIns: [], tiktoks: ["https://tiktok.com/@breeza"],
    claimThisBusiness: false, rank: 3, url: "https://maps.google.com/?cid=1",
  };
  const p = LEAD_CARDS_BY_ID.local_businesses.mapItem(item);
  assert.equal(p.about, "Waterfront venue for weddings and private events.", "Google's own line first; the owner's only when there is none");
  assert.deepEqual(p.hours, [{ day: "Monday", hours: "9 AM to 6 PM" }, { day: "Tuesday", hours: "Closed" }]);
  assert.deepEqual([p.imageUrl, p.price, p.facebook, p.linkedin, p.tiktok, p.claimed, p.rank, p.mapsUrl],
    ["https://lh3.example/photo.jpg", "$$", "https://facebook.com/breeza", null, "https://tiktok.com/@breeza", true, 3, "https://maps.google.com/?cid=1"]);
  assert.deepEqual(p.reviewsDist, { one: 1, two: 0, three: 2, four: 8, five: 30 });
  const unclaimed = LEAD_CARDS_BY_ID.local_businesses.mapItem({ ...item, claimThisBusiness: true, description: null, ownerDescription: "Family-run since 2009." });
  assert.deepEqual([unclaimed.claimed, unclaimed.about], [false, "Family-run since 2009."], "claimThisBusiness true is an unclaimed listing");
  const bare = LEAD_CARDS_BY_ID.local_businesses.mapItem({ title: "X", placeId: "ChIJfixture2" });
  assert.deepEqual([bare.about, bare.hours, bare.imageUrl, bare.reviewsDist, bare.claimed, bare.rank, bare.mapsUrl], [null, [], null, null, null, null, null]);
});
```

(Use whatever the file already imports to reach the card — `LEAD_CARDS_BY_ID`, `cardById("local_businesses")`, or the card object directly; match the neighbouring test.)

- [ ] **Step 2: Run it red** (`p.about` is undefined).

- [ ] **Step 3: The card.** `MAPS_FIELDS` gains, after `"location"`:

```ts
  // What the listing shows about the business itself (D2): its own words, hours, a photo, the spread of its
  // reviews, price, the socials beside Instagram, whether the owner claimed the listing, and its rank for the
  // term. All in the item the run already returns; nothing more is asked of the provider.
  "description", "ownerDescription", "openingHours", "imageUrl", "reviewsDistribution", "price",
  "facebooks", "linkedIns", "tiktoks", "claimThisBusiness", "rank", "url",
```

`MapsPlace` gains, after `location`:

```ts
  /** The listing's own line about the business (Google's, else the owner's), capped and stripped like every fact. */
  about: string | null;
  hours: { day: string; hours: string }[];
  imageUrl: string | null;
  reviewsDist: { one: number; two: number; three: number; four: number; five: number } | null;
  price: string | null;
  facebook: string | null;
  linkedin: string | null;
  tiktok: string | null;
  /** true: the owner claimed the listing; false: "claim this business" is showing; null: the item did not say. */
  claimed: boolean | null;
  rank: number | null;
  mapsUrl: string | null;
```

`mapItem` returns, after `location: ...`:

```ts
        about: (str(o.description) ?? str(o.ownerDescription))?.slice(0, 600) ?? null,
        hours: (Array.isArray(o.openingHours) ? o.openingHours : [])
          .map((h) => ({ day: str(obj(h)?.day) ?? "", hours: str(obj(h)?.hours) ?? "" }))
          .filter((h) => h.day && h.hours)
          .slice(0, 7),
        imageUrl: str(o.imageUrl),
        reviewsDist: (() => {
          const d = obj(o.reviewsDistribution);
          if (!d) return null;
          const n = (k: string) => num(d[k]) ?? 0;
          return { one: n("oneStar"), two: n("twoStar"), three: n("threeStar"), four: n("fourStar"), five: n("fiveStar") };
        })(),
        price: str(o.price),
        facebook: strs(o.facebooks)[0] ?? null,
        linkedin: strs(o.linkedIns)[0] ?? null,
        tiktok: strs(o.tiktoks)[0] ?? null,
        claimed: o.claimThisBusiness === true ? false : o.claimThisBusiness === false ? true : null,
        rank: num(o.rank),
        mapsUrl: str(o.url),
```

`str` already caps and strips control characters (the judge's facts rule); if it does not cap, cap `about` here as shown. **Step 4: green.** Then `lead-core`, `lead-runner`, `lead-pipeline` (fixtures build `MapsPlace`s: a fixture missing the new fields must gain them or the type must make them optional — prefer giving the fixture helper defaults, so the type stays honest). **Step 5: commit** — "The card keeps what the listing shows about the business".

---

### Task 2: Migration 00144 — the lead carries what the listing shows

**Files:**
- Create: `supabase/migrations/00144_the_lead_carries_what_the_listing_shows.sql`
- Test: `tooling/scripts/tests/lead-engine.db.test.mjs` (the commit → `leads_page` case, ~line 264)

- [ ] **Step 1: The failing test.** In the page-commit test, give one place of the page the new facts and read them back:

```js
  // D2: the facts the listing shows about the business ride the same commit and come back from leads_page.
  const rich = { ...page.places[0], about: "Waterfront venue for weddings.", hours: [{ day: "Monday", hours: "9 AM to 6 PM" }], image_url: "https://lh3.example/p.jpg",
    price: "$$", reviews_dist: { one: 1, two: 0, three: 2, four: 8, five: 30 }, facebook_url: "https://facebook.com/x", linkedin_url: null, tiktok_url: null, claimed: true, maps_url: "https://maps.google.com/?cid=1", rank: 3 };
  ok(await commit(run, worker, gen, 0, 1, { ...page, places: [rich, ...page.places.slice(1)] }));
  const rows = ok(await owner.client.rpc("leads_page", { p_tenant_id: A, p_search_id: ids.search, p_class: "qualified", p_sort: "found", p_after_key: null, p_limit: 50 }));
  const r = rows.find((x) => x.place_id === rich.place_id);
  assert.deepEqual([r.about, r.hours, r.image_url, r.price, r.reviews_dist, r.facebook_url, r.claimed, r.maps_url, r.rank],
    ["Waterfront venue for weddings.", [{ day: "Monday", hours: "9 AM to 6 PM" }], "https://lh3.example/p.jpg", "$$", { one: 1, two: 0, three: 2, four: 8, five: 30 }, "https://facebook.com/x", true, "https://maps.google.com/?cid=1", 3]);
```

Read the test to see how `page.places` are shaped and whether `page` is committed once already (then commit the rich page in a fresh round or a fresh place id — a known place is `on conflict do nothing`, see Step 3).

- [ ] **Step 2: Red** on the local stack (`Could not find` the columns / `leads_page` has no `about`).

- [ ] **Step 3: The migration.**

```sql
-- 00144 · The lead carries what the listing shows.
--
-- D2 (docs/plans/2026-09-20-lead-finder-D2-who-they-are.md). The Maps item a
-- lead is built from returns some ninety fields; the engine asked for
-- twenty-one and kept the ones that decide a class. The owner opening a lead
-- saw a name, a category, a city and a phone, and asked who the business IS.
-- These columns hold what the listing shows about it -- in its own words,
-- its hours, a photo, the spread of its reviews, its price level, the
-- socials beside Instagram, whether the owner claimed the listing, its Maps
-- page and its rank for the term -- all from the item the run already
-- returned. No door writes them but lead_collect_commit; a left-out place
-- carries none of them (PRD §0.4); erase blanks them with the rest.

alter table public.leads
  add column if not exists about        text,
  add column if not exists hours        jsonb not null default '[]'::jsonb,
  add column if not exists image_url    text,
  add column if not exists price        text,
  add column if not exists reviews_dist jsonb,
  add column if not exists facebook_url text,
  add column if not exists linkedin_url text,
  add column if not exists tiktok_url   text,
  add column if not exists claimed      boolean,
  add column if not exists maps_url     text,
  add column if not exists rank         integer;

comment on column public.leads.about is 'The listing''s own line about the business: Google''s, else the owner''s; capped at 600 characters and stripped of control characters before it is stored.';
comment on column public.leads.hours is 'Opening hours as the listing shows them, [{day, hours}] up to seven, in the business''s own words ("9 AM to 6 PM", "Closed").';
comment on column public.leads.reviews_dist is '{one, two, three, four, five}: how many reviews at each star, for the spread beside the rating.';
comment on column public.leads.claimed is 'true when the owner has claimed the listing; false when Maps still offers "claim this business"; null when the item did not say. An unclaimed listing rarely watches its email.';
comment on column public.leads.rank is 'Where the place stood in the term''s results on Maps when it was found: "#3 for wedding planner".';
```

Then **`lead_collect_commit`**: copy the whole function from `00140_the_lead_finder_engine.sql` (from `create or replace function public.lead_collect_commit(` at line 1002 to its closing `$$;`) into 00144 verbatim, and change exactly two things in it. The insert (00140's lines with `insert into public.leads (...)`):

```sql
      insert into public.leads (tenant_id, place_id, business_name, category, street, city, region, postal_code, country, lat, lng,
                                website_host, instagram_url, phone_e164, phone_sources, phone_wrong, email, email_alternates, email_state, rating, reviews,
                                about, hours, image_url, price, reviews_dist, facebook_url, linkedin_url, tiktok_url, claimed, maps_url, rank)
      values (v_round.tenant_id, v_pl->>'place_id', coalesce(left(v_pl->>'business_name', 200), ''), left(v_pl->>'category', 120),
              left(v_pl->>'street', 200), left(v_pl->>'city', 120), left(v_pl->>'region', 40), left(v_pl->>'postal_code', 20),
              coalesce(v_pl->>'country', 'US'), (v_pl->>'lat')::double precision, (v_pl->>'lng')::double precision,
              left(v_pl->>'website_host', 120), left(v_pl->>'instagram_url', 200), v_pl->>'phone_e164',
              coalesce((v_pl->>'phone_sources')::smallint, 0), coalesce((v_pl->>'phone_wrong')::boolean, false),
              v_pl->>'email', coalesce(v_pl->'email_alternates', '[]'::jsonb), coalesce(v_pl->>'email_state', 'none'),
              (v_pl->>'rating')::numeric, (v_pl->>'reviews')::integer,
              left(v_pl->>'about', 600), coalesce(v_pl->'hours', '[]'::jsonb), left(v_pl->>'image_url', 500), left(v_pl->>'price', 8),
              v_pl->'reviews_dist', left(v_pl->>'facebook_url', 300), left(v_pl->>'linkedin_url', 300), left(v_pl->>'tiktok_url', 300),
              (v_pl->>'claimed')::boolean, left(v_pl->>'maps_url', 500), (v_pl->>'rank')::integer)
      -- A place already here keeps its worked state and gains what this listing shows, where it had none.
      on conflict (tenant_id, place_id) where place_id is not null do update set
        about        = coalesce(public.leads.about, excluded.about),
        hours        = case when public.leads.hours = '[]'::jsonb then excluded.hours else public.leads.hours end,
        image_url    = coalesce(public.leads.image_url, excluded.image_url),
        price        = coalesce(public.leads.price, excluded.price),
        reviews_dist = coalesce(public.leads.reviews_dist, excluded.reviews_dist),
        facebook_url = coalesce(public.leads.facebook_url, excluded.facebook_url),
        linkedin_url = coalesce(public.leads.linkedin_url, excluded.linkedin_url),
        tiktok_url   = coalesce(public.leads.tiktok_url, excluded.tiktok_url),
        claimed      = coalesce(public.leads.claimed, excluded.claimed),
        maps_url     = coalesce(public.leads.maps_url, excluded.maps_url),
        rank         = coalesce(public.leads.rank, excluded.rank);
```

(`do nothing` became `do update` on these eleven columns only; nothing else on the row changes, so a worked lead's stage, email state and version are untouched, and `select l.id into v_lead` after it still finds the row. Note that a left-out place's `v_pl` carries nulls for all eleven — Task 3 — so it gains nothing.)

Then **`leads_page`**: `drop function if exists public.leads_page(uuid, uuid, text, text, text, integer, text, text, uuid);` and re-create it from 00142's text (lines 594–672) with three additions — in `returns table (` after `places integer, version integer,`:

```sql
  about text, hours jsonb, image_url text, price text, reviews_dist jsonb, facebook_url text, linkedin_url text, tiktok_url text, claimed boolean, maps_url text, rank integer,
```

in `base` after `l.found_at,`:

```sql
           l.about, l.hours, l.image_url, l.price, l.reviews_dist, l.facebook_url, l.linkedin_url, l.tiktok_url, l.claimed, l.maps_url, l.rank,
```

and in the final select after `b.places, b.version,`:

```sql
         b.about, b.hours, b.image_url, b.price, b.reviews_dist, b.facebook_url, b.linkedin_url, b.tiktok_url, b.claimed, b.maps_url, b.rank,
```

Keep its `comment on function`, `revoke` and `grant` lines. Then the erase: find in 00142 the `update public.leads set` inside `lead_erase` that blanks `email`, and re-declare that function in 00144 with the eleven columns set to null (`hours = '[]'::jsonb`) in the same statement — the erasure test (`erasure.db.test.mjs` or `leads.db.test.mjs`) asserts what a blanked row keeps; extend it to assert `about` is null after erase.

- [ ] **Step 4:** apply locally (`docker cp` then `psql -f`, `MSYS_NO_PATHCONV=1`), run `lead-engine.db.test.mjs` and `leads.db.test.mjs` green. Regenerate `database.types.ts`; the diff is the eleven columns on `leads` and the eleven outputs of `leads_page`. **Step 5: commit** — "The lead carries what the listing shows (00144)".

---

### Task 3: The runner hands them over

**Files:**
- Modify: `packages/core/src/leads/runner.ts` (the `place:` object, ~line 274)
- Test: `tooling/scripts/tests/lead-runner.test.mjs` (the acceptance test's stored lead)

- [ ] **Step 1: The failing test.** Where the acceptance test reads `w.T.leads`, with a fixture place given `about`/`imageUrl`/`claimed` (add them to the fixture item in `_lead-fixtures.mjs` for one fitting place and one closed place):

```js
  const fit = w.T.leads.find((l) => l.business_name === "Zilker Strength Lab");
  assert.deepEqual([fit.about, fit.image_url, fit.claimed, fit.rank], ["Independent strength studio.", "https://lh3.example/z.jpg", true, 1], "what the listing shows rides the commit");
  assert.deepEqual([closedLead.about, closedLead.image_url, closedLead.hours], [null, null, []], "a left-out place carries none of it (PRD §0.4)");
```

- [ ] **Step 2: Red. Step 3:** in the `place:` object after `rating: c.raw.rating, reviews: c.raw.reviews,`:

```ts
      // What the listing shows about the business (D2): kept for a lead, never for a left-out place (§0.4).
      about: excluded ? null : c.raw.about, hours: excluded ? [] : c.raw.hours, image_url: excluded ? null : c.raw.imageUrl,
      price: excluded ? null : c.raw.price, reviews_dist: excluded ? null : c.raw.reviewsDist,
      facebook_url: excluded ? null : c.raw.facebook, linkedin_url: excluded ? null : c.raw.linkedin, tiktok_url: excluded ? null : c.raw.tiktok,
      claimed: excluded ? null : c.raw.claimed, maps_url: excluded ? null : c.raw.mapsUrl, rank: excluded ? null : c.raw.rank,
```

The fake world's `lead_collect_commit` (`_lead-world.mjs`) copies `place` into `T.leads`; if it whitelists columns, add these. **Step 4: green. Step 5: commit** — "The runner hands the door what the listing shows".

---

### Task 4: The DTO and the two view models

**Files:**
- Modify: `apps/dashboard/src/server/leads.ts` (the row type ~line 317 and the mapping ~line 379)
- Modify: `packages/contracts/src/leads.ts` (`LeadRowDto` ~811, `LeadPeekVM` ~636, `toLeadPeekVM` ~698, `LeadRowVM` ~869, `toLeadRowVM` ~899, `LEAD_WORDS`)
- Test: `tooling/scripts/tests/leads-vm.test.mjs`

- [ ] **Step 1: The failing tests.**

```js
test("the peek knows who they are: their own words, where, when they are open today, what they look like, the spread of reviews, the socials, whether the listing is claimed, the rank it was found at", () => {
  const r = row({ about: "Waterfront venue for weddings.", street: "101 Biscayne Blvd", city: "Miami", state: "FL", postal_code: "33132",
    hours: [{ day: "Thursday", hours: "9 AM to 6 PM" }, { day: "Friday", hours: "Closed" }], image_url: "https://lh3.example/p.jpg", price: "$$",
    reviews_dist: { one: 1, two: 0, three: 2, four: 8, five: 30 }, facebook_url: "https://facebook.com/x", linkedin_url: null, tiktok_url: "https://tiktok.com/@x",
    claimed: false, maps_url: "https://maps.google.com/?cid=1", rank: 3, rating: 4.7, reviews: 41 });
  const v = toLeadPeekVM(r, search(), TZ, new Date("2026-09-17T15:00:00Z")); // a Thursday in America/Chicago
  assert.equal(v.about, "Waterfront venue for weddings.");
  assert.deepEqual(v.where, { line: "101 Biscayne Blvd, Miami, FL 33132", href: "https://maps.google.com/?cid=1" });
  assert.equal(v.today, "Open today · 9 AM to 6 PM");
  assert.equal(toLeadPeekVM(r, search(), TZ, new Date("2026-09-18T15:00:00Z")).today, "Closed today");
  assert.equal(toLeadPeekVM(row({ ...r, hours: [] }), search(), TZ, new Date("2026-09-18T15:00:00Z")).today, null, "no hours, no line");
  assert.equal(v.image, "https://lh3.example/p.jpg");
  assert.equal(v.sub, "Wedding venue · $$ · Miami, FL");
  assert.deepEqual(v.reviewsDist, [1, 0, 2, 8, 30]);
  assert.deepEqual(Object.keys(v.links).filter((k) => v.links[k]), ["website", "instagram", "facebook", "tiktok", "maps"]);
  assert.equal(v.claimedNote, "Listing not claimed by the owner", "an unclaimed listing rarely watches its email");
  assert.equal(toLeadPeekVM(row({ ...r, claimed: true }), search(), TZ, NOW_DATE).claimedNote, null);
  assert.equal(v.found[0].text, `On Google Maps, #3 for "wedding venue"`, "the rank rides the first line of Found");
});
test("the row carries the photo, and the two contacts as one glance", () => {
  const v = toLeadRowVM(row({ image_url: "https://lh3.example/p.jpg" }), TZ, NOW_DATE);
  assert.equal(v.image, "https://lh3.example/p.jpg");
  assert.deepEqual(v.reach, { email: { word: "Checked", state: "ok", address: "hello@zilkerstrength.example" }, phone: { number: "+1 (512) 555-0101", agrees: true } });
});
```

Adjust the fixture's names (`row`, `search`, `TZ`, `NOW_DATE`) to the file's own; the `found[0]` shape to what `toLeadPeekVM` already builds for "On Google Maps, searching …" (the rank replaces "searching" when present: `#3 for "wedding venue"`).

- [ ] **Step 2: Red. Step 3:** `server/leads.ts` row type gains `about: string | null; hours: unknown; image_url: string | null; price: string | null; reviews_dist: unknown; facebook_url: string | null; linkedin_url: string | null; tiktok_url: string | null; claimed: boolean | null; maps_url: string | null; rank: number | null;` and the mapping passes each through (`hours: Array.isArray(r.hours) ? r.hours : []`, `reviews_dist` as an object or null). `LeadRowDto` gains the same eleven, all optional (`?:`) so every fixture that builds a DTO keeps compiling, defaulting to null/[] in the VMs. `toLeadPeekVM` gains:

```ts
    about: r.about ?? null,
    where: r.street || r.city ? { line: [r.street, [r.city, r.state].filter(Boolean).join(", ") + (r.postal_code ? ` ${r.postal_code}` : "")].filter(Boolean).join(", "), href: r.maps_url ?? null } : null,
    today: todayLine(r.hours ?? [], tz, now),
    image: r.image_url ?? null,
    reviewsDist: r.reviews_dist ? [r.reviews_dist.one, r.reviews_dist.two, r.reviews_dist.three, r.reviews_dist.four, r.reviews_dist.five] : null,
    claimedNote: r.claimed === false ? LEAD_UNCLAIMED_NOTE : null,
```

with `links` gaining `facebook`, `linkedin`, `tiktok`, `maps` in the website/instagram shape, `sub` becoming `[category, price, area].filter(Boolean).join(" · ")`, and:

```ts
/** "Open today · 9 AM to 6 PM", "Closed today", or null when the listing showed no hours. The day is the business's own (tz). */
function todayLine(hours: { day: string; hours: string }[], tz: string, now: Date): string | null {
  if (!hours.length) return null;
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(now);
  const h = hours.find((x) => x.day.toLowerCase() === day.toLowerCase());
  if (!h) return null;
  return /^closed/i.test(h.hours) ? "Closed today" : `Open today · ${h.hours}`;
}
export const LEAD_UNCLAIMED_NOTE = "Listing not claimed by the owner";
```

`toLeadRowVM` gains `image` and `reach: { email: { word, state, address } | null, phone: { number, agrees } | null }` built from the fields it already derives for the two cells. `LEAD_WORDS` gains `about: "About"`, `today: "Today"`, `unclaimed: LEAD_UNCLAIMED_NOTE`, `reach: "Reach"`. **Step 4: green** (`leads-vm`, `leads-peek`, `leads-honest`, `lead-routes`). **Step 5: commit** — "The view models know who they are".

---

### Task 5: The peek shows who they are

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-peek.jsx` (`LeadPeekHead` ~52, `LeadPeekInfo` ~199 after `pk-fit`, the foot ~278, the Found list)
- Test: `tooling/scripts/tests/leads-peek.test.mjs`

- [ ] **Step 1: The failing test** — draw a peek with the D2 VM fields and assert `peek-photo` (an `img` with `alt=""`), `peek-about`, `peek-where` (a link to the Maps page), `peek-today`, `peek-claimed`, `peek-facebook`/`peek-tiktok`/`peek-maps` in the foot, and that a VM without them draws none of these nodes.

- [ ] **Step 2: Red. Step 3:** head — `<span className="pk-mark">` draws `<img src={vm.image} alt="" loading="lazy" data-testid="peek-photo" />` when `vm.image`, else `vm.mark`. After `pk-fit`:

```jsx
        {vm.about ? <p className="pk-about" data-testid="peek-about">{vm.about}</p> : null}
        {(vm.where || vm.today || vm.claimedNote) ? (
          <div className="pk-where" data-testid="peek-where-block">
            {vm.where ? (vm.where.href
              ? <a href={vm.where.href} target="_blank" rel="noopener noreferrer" data-testid="peek-where"><Icon name="pin" size={12} />{vm.where.line}</a>
              : <span data-testid="peek-where"><Icon name="pin" size={12} />{vm.where.line}</span>) : null}
            {vm.today ? <span data-testid="peek-today"><Icon name="clock" size={12} />{vm.today}</span> : null}
            {vm.claimedNote ? <span className="pk-quiet" data-testid="peek-claimed"><Icon name="info" size={12} />{vm.claimedNote}</span> : null}
          </div>
        ) : null}
```

(Use icon names that exist in `components/icons.jsx` — `clock` does; check `pin` and `info`, else `map`/`shield`.) The foot draws facebook, linkedin, tiktok and maps the way it draws instagram. The rating line, where the peek shows it, gains the five-dot spread on hover: `title={vm.reviewsDist ? \`5★ ${d[4]} · 4★ ${d[3]} · 3★ ${d[2]} · 2★ ${d[1]} · 1★ ${d[0]}\` : undefined}`. **Step 4: green. Step 5: commit** — "The peek shows who they are".

---

### Task 6: The table's one glance, and the export

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-scope.jsx` (`ldBusinessCell` ~54; `LEAD_COLUMNS` ~73: `email` + `phone` → `reach`)
- Modify: `packages/contracts/src/leads.ts` (`LEAD_COLUMN_KEYS`/the column list the view saves, if it names `email`/`phone`)
- Modify: `apps/dashboard/src/server/leads.ts` (`LEAD_CSV_COLUMNS`)
- Test: `tooling/scripts/tests/leads-honest.test.mjs` (the headings pin), `lead-routes.test.mjs` (the export pin)

- [ ] **Step 1: The failing tests.** The headings pin becomes `["Business", "Fit", "Reach", "Why it fits", "Rating", "Stage", "Found"]`; a row's `lead-reach` cell carries `lead-reach-email` (title = the address, the state's shape and word) and `lead-reach-phone` (the number, `✓✓` when both sources agree); the Business cell draws `<img>` when the row has a photo. The export gains `About`, `Facebook`, `LinkedIn`, `Google Maps` after `Website`.

- [ ] **Step 2: Red. Step 3:**

```jsx
  { key: "reach", label: "Reach", sortable: false, cell: (l) => (
    <td key="reach" className="shrink ld-reach-cell" data-testid="lead-reach">
      {l.cls === "excluded" ? <span className="dim">Not checked</span> : (
        <>
          {l.reach.email
            ? <button type="button" className="ld-reach-email" title={\`\${l.reach.email.address} · \${l.reach.email.word}\`} onClick={(e) => { e.stopPropagation(); x.onCopy(l.id); }} data-testid="lead-reach-email"><LeadShape state={l.reach.email.state} word={l.reach.email.word} />{l.reach.email.word}</button>
            : <span className="dim" data-testid="lead-reach-email">No email</span>}
          <span className="dot" />
          {l.reach.phone
            ? <span className="ld-reach-phone" data-testid="lead-reach-phone">{l.reach.phone.number}{l.reach.phone.agrees && <span className="ld-tick2" title="Maps and their website agree">✓✓</span>}</span>
            : <span className="dim" data-testid="lead-reach-phone">No phone</span>}
        </>
      )}
    </td>
  ) },
```

A saved view that names `email` or `phone` among its columns reads as `reach` (one line in whatever parses the saved column list: `.map((k) => (k === "email" || k === "phone" ? "reach" : k))`, deduplicated), so nobody's saved view loses the column. The Business cell's `ld-mark` draws `<img src={l.image} alt="" loading="lazy" />` when `l.image`. Export: `["About", (r) => r.about ?? null], ["Facebook", (r) => r.facebook_url ?? null], ["LinkedIn", (r) => r.linkedin_url ?? null], ["Google Maps", (r) => r.maps_url ?? null]`. **Step 4: green. Step 5: commit** — "Reach: both contacts in one glance; the export says who they are".

---

### Task 7: The styles

- [ ] In `leads.css`, beside `.pk-*`: `.pk-mark img { width: 40px; height: 40px; border-radius: 10px; object-fit: cover; display: block; }`, `.pk-about { font-size: 13px; line-height: 1.5; color: var(--ink-muted); margin: 0; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }`, `.pk-where { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--ink-dim); } .pk-where a, .pk-where span { display: inline-flex; align-items: center; gap: 6px; color: inherit; text-decoration: none; } .pk-where a:hover { color: var(--ink); } .pk-where .pk-quiet { color: var(--ink-faint); }`. Beside the table rules: `.ld-reach-cell { white-space: nowrap; display: flex; align-items: center; gap: 8px; } .ld-reach-email { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: none; font: inherit; color: var(--ink); cursor: pointer; } .ld-reach-email:hover { text-decoration: underline; } .ld-mark img { width: 28px; height: 28px; border-radius: 8px; object-fit: cover; display: block; }`. At 900px the reach cell stacks (`flex-direction: column; align-items: flex-start; gap: 2px`). Commit — "The peek and the table wear the facts".

---

### Task 8: Dists, types, the suite, the push, the record

- [ ] Rebuild dists; regenerate `database.types.ts`; typecheck; full suite; lint. Commit.
- [ ] PR. When CI is green: dry run against production lists only `00144`; push; read back (`\d public.leads` columns and `leads_page`'s return type); merge; after deploy, open one of the five real searches on production and confirm a lead's peek draws its About, address, today's hours and photo, and the table's Reach column.
- [ ] PRD v3 §14: the D1 line's "Next: D2 …" becomes "**D2 — who they are (built).**" with one sentence.
