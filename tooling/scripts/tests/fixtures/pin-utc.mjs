// Imported first by a test that asserts the day a viewer in UTC reads. A formatter keeps the zone it was built in, and
// contracts builds its zone-dependent ones on first use (shared/time.ts, formatterOnUse), so the zone is set here, before
// any test asks for a date: the runner's preloads may already have loaded contracts (the network stand-in loads channels,
// which imports it), and a formatter built at load had kept the machine's zone. The words themselves are said in the viewer's zone (a browser's), which a machine twelve
// hours east would make another day; these tests pin the viewer they describe. Not a *.test.mjs, so the suite never globs it.
process.env.TZ = "UTC";
