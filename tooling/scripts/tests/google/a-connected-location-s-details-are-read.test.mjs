/**
 * A connected location read for its details as it is bound (decision 0073, R17; apps/edge/lib/google/profile-details.ts
 * over channels readLocationDetails), run over a database in memory with Google's Business Information API answered by
 * the test: the hours, the number, the website and the kind go where the listing's facts are, the owner's own listing's
 * now; the services with their prices, the days closed, the words and the kinds go to what Check offers beside them
 * (business_reads, google_profile); its website is asked to be read. A read Google refuses costs only these offers.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";
import { fakeDb } from "../_fake-db.mjs";
import { rows } from "../_rows.mjs";

const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: "oauth-client-for-this-file",
  GOOGLE_OAUTH_CLIENT_SECRET: "oauth-secret-for-this-file",
  GOOGLE_OAUTH_REDIRECT_URI: "https://dash.test/api/v1/google/callback",
};
const was = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));
Object.assign(process.env, ENV);
after(() => {
  for (const [k, v] of Object.entries(was)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
const { readProfileDetails } = await importSrc("apps/edge/lib/google/profile-details.ts");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOCATION = "locations/222";
const DETAILS = `https://mybusinessbusinessinformation.googleapis.com/v1/${LOCATION}`;
/** The fields the read asks for, as the wire says them. */
const READ_MASK = "name,title,phoneNumbers,categories,websiteUri,regularHours,specialHours,profile,serviceItems";

/** The listing as the public read left it: its kind and zone known, its number and hours not. */
const STORED = {
  booking_page: "https://www.vagaro.com/harborsalon",
  hours: null,
  phone_display: null,
  phone_e164: null,
  primary_type: "hair_salon",
  primary_type_label: "Salon",
  service_area_only: false,
  time_zone: "America/New_York",
  website: "https://old.example",
};

/** The location as Google's Business Information API answers it, with the read mask's fields. */
const LOC = {
  name: LOCATION,
  title: "Harbor Salon",
  phoneNumbers: { primaryPhone: "(718) 555-0142" },
  categories: {
    primaryCategory: {
      name: "categories/gcid:hair_salon",
      displayName: "Hair salon",
      serviceTypes: [{ serviceTypeId: "job_type_id:haircut", displayName: "Haircut" }],
    },
    additionalCategories: [{ name: "categories/gcid:barber_shop", displayName: "Barber shop" }],
  },
  websiteUri: "https://harborsalon.example",
  regularHours: {
    periods: [
      { openDay: "TUESDAY", openTime: { hours: 9 }, closeDay: "TUESDAY", closeTime: { hours: 18 } },
      { openDay: "SATURDAY", openTime: { hours: 10, minutes: 30 }, closeDay: "SATURDAY", closeTime: { hours: 16 } },
    ],
  },
  specialHours: {
    specialHourPeriods: [
      { startDate: { year: 2026, month: 12, day: 25 }, closed: true },
      { startDate: { year: 2026, month: 12, day: 31 }, endDate: { year: 2027, month: 1, day: 2 }, closed: true },
      // Open short on the day after Thanksgiving: not a day closed.
      { startDate: { year: 2026, month: 11, day: 27 }, openTime: { hours: 10 }, closeTime: { hours: 14 } },
    ],
  },
  profile: { description: "A neighbourhood salon on the harbor." },
  serviceItems: [
    { structuredServiceItem: { serviceTypeId: "job_type_id:haircut" }, price: { currencyCode: "USD", units: "45" } },
    {
      freeFormServiceItem: { label: { displayName: "Balayage" } },
      price: { currencyCode: "USD", units: "180", nanos: 500000000 },
    },
    // The same service again, by another hand: one is kept.
    { freeFormServiceItem: { label: { displayName: "haircut" } } },
    { freeFormServiceItem: { label: { displayName: "Colour" } }, price: { currencyCode: "EUR", units: 65 } },
    { freeFormServiceItem: { label: { displayName: "Consultation" } } },
  ],
};

/** The workspace: its connection, the listing linked (or none), its Vault entry, and what a read writes. */
function world({ listing = true } = {}) {
  const tables = {
    google_listings: listing ? [rows.googleListing({ tenant_id: A, place_id: "ChIJharbor", facts: STORED })] : [],
    business_reads: [],
    jobs: [],
  };
  const db = fakeDb(
    tables,
    {},
    {
      get_google_credentials: () => ({
        refresh_token: "rt-1",
        access_token: "at-live",
        expires_at: Date.now() + 3_600_000,
        scope: "https://www.googleapis.com/auth/business.manage",
      }),
    },
  );
  return { db, tables };
}
const conn = (over = {}) => ({ tenant_id: A, location_name: LOCATION, ...over });
/** Google, answered by the test: the details by their address; every call kept. */
function google(answer = () => ({ status: 200, body: JSON.stringify(LOC) })) {
  const calls = [];
  const net = async (req) => {
    calls.push(req);
    return answer(req);
  };
  return { calls, net };
}

test("a connected location's details: its hours, number, website and kind on the listing; its services and prices, days closed, words and kinds for Check; its website asked to be read", async () => {
  const w = world();
  const g = google();
  await readProfileDetails(w.db, conn(), new Date(), g.net);

  assert.deepEqual(
    g.calls.map((c) => [c.method, c.url, c.headers.Authorization]),
    [["GET", `${DETAILS}?${new URLSearchParams({ readMask: READ_MASK })}`, "Bearer at-live"]],
    "one read of the location, as the owner, with the token still good",
  );
  assert.deepEqual(
    w.tables.google_listings[0].facts,
    {
      ...STORED,
      hours: [
        { open: { day: 2, hour: 9, minute: 0 }, close: { day: 2, hour: 18, minute: 0 } },
        { open: { day: 6, hour: 10, minute: 30 }, close: { day: 6, hour: 16, minute: 0 } },
      ],
      phone_e164: "+17185550142",
      phone_display: "(718) 555-0142",
      website: "https://harborsalon.example",
      primary_type_label: "Hair salon",
      booking_page: null,
    },
    "what the owner's own listing says, where it says it; the kind's key and the zone as they were; the booking page found on the old website gone with it",
  );
  const [read] = w.tables.business_reads;
  assert.deepEqual([read.tenant_id, read.source, read.read_from, read.error], [A, "google_profile", LOCATION, null]);
  assert.deepEqual(read.facts, {
    services: [
      { name: "Haircut", price_note: "$45", duration_min: null },
      { name: "Balayage", price_note: "$180.50", duration_min: null },
      { name: "Colour", price_note: "65 EUR", duration_min: null },
      { name: "Consultation", price_note: null, duration_min: null },
    ],
    closed: [
      { date: "2026-12-25", until: null },
      { date: "2026-12-31", until: "2027-01-02" },
    ],
    rules: [],
    answers: [],
    description: "A neighbourhood salon on the harbor.",
    categories: ["Hair salon", "Barber shop"],
  });
  assert.deepEqual(
    w.tables.jobs.map((j) => [j.kind, j.payload.url]),
    [["website_read", "https://harborsalon.example/"]],
    "the website the profile names, read for Check too",
  );
});

test("a location that says little keeps what the listing said; with no listing linked, only the offers are kept", async () => {
  const w = world();
  const sparse = { name: LOCATION, title: "Harbor Salon" };
  await readProfileDetails(w.db, conn(), new Date(), google(() => ({ status: 200, body: JSON.stringify(sparse) })).net);
  assert.deepEqual(
    w.tables.google_listings[0].facts,
    STORED,
    "nothing it did not say is overwritten, the booking page kept with the website it was found on",
  );
  assert.deepEqual(w.tables.business_reads[0].facts.services, []);
  assert.equal(w.tables.jobs.length, 0, "no website named, none read");

  const unlinked = world({ listing: false });
  await readProfileDetails(unlinked.db, conn(), new Date(), google().net);
  assert.equal(unlinked.tables.google_listings.length, 0, "no listing made by a details read");
  assert.equal(unlinked.tables.business_reads.length, 1);
});

test("a read Google refuses, a location not bound, or credentials gone cost only the offers: nothing kept, nothing thrown", async () => {
  const refused = world();
  const g = google(() => ({
    status: 403,
    body: JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED" } }),
  }));
  await readProfileDetails(refused.db, conn(), new Date(), g.net);
  assert.equal(g.calls.length, 1);
  assert.deepEqual(
    [refused.tables.google_listings[0].facts, refused.tables.business_reads, refused.tables.jobs],
    [STORED, [], []],
  );

  const unbound = world();
  const none = google();
  await readProfileDetails(unbound.db, conn({ location_name: null }), new Date(), none.net);
  assert.equal(none.calls.length, 0, "no location, nothing asked");

  const gone = world();
  const db = fakeDb(gone.tables, {}, { get_google_credentials: () => null });
  const nothing = google();
  await readProfileDetails(db, conn(), new Date(), nothing.net);
  assert.equal(nothing.calls.length, 0);
  assert.equal(gone.tables.business_reads.length, 0);
});
